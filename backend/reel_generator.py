"""
MindStream Reel Generator (MovieLite Edition - 4x faster)
Pipeline: Script (Llama 3.3 70B via Groq / Gemini fallback) → Videos (Pexels/Pixabay/Coverr) → TTS (MiMo Dean) → Subtitles (Manual) → Composite (MovieLite)
"""

# Suppress tqdm progress bars from MovieLite (must be before imports)
import os

os.environ["TQDM_DISABLE"] = "1"

# Limit BLAS/OpenMP threading at import time so numpy doesn't saturate all cores.
# The preset system overrides ffmpeg threads at runtime, but BLAS threads must be
# set before OpenBLAS initializes (i.e. before numpy is imported).
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS64_NUM_THREADS", "1")  # scipy_openblas64 uses this
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import re
import json
import asyncio
import requests
import base64
import shutil
import sys
import time
import threading
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

try:
    from google import genai
    import movielite as ml
    from pictex import Canvas, Shadow
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install movielite pictex google-generativeai python-dotenv")
    exit(1)

# Suppress third-party warnings for cleaner ux
import warnings

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*FontNotFoundWarning.*")
warnings.filterwarnings("ignore", message=".*fontconfig.*")
warnings.filterwarnings("ignore", message=".*resource_tracker.*")
import logging

logging.basicConfig(level=logging.ERROR)
for logger_name in ["movielite", "moviepy", "imageio", "urllib3", "google", "httpx", "httpcore"]:
    _l = logging.getLogger(logger_name)
    _l.setLevel(logging.ERROR)
    _l.propagate = False

import contextlib

load_dotenv()


@dataclass(frozen=True)
class HardwareProfile:
    """CPU topology available to this process, respecting cpuset limits."""

    logical_cpus: Tuple[int, ...]
    physical_core_groups: Tuple[Tuple[int, ...], ...]

    @property
    def logical_core_count(self) -> int:
        return len(self.logical_cpus)

    @property
    def physical_core_count(self) -> int:
        return len(self.physical_core_groups)


def _detect_hardware_profile() -> HardwareProfile:
    """Return available logical CPUs grouped by physical core where possible."""
    try:
        logical_cpus = tuple(sorted(os.sched_getaffinity(0)))
    except (AttributeError, OSError):
        logical_cpus = tuple(range(max(1, os.cpu_count() or 1)))
    if not logical_cpus:
        logical_cpus = (0,)

    # Linux exposes sibling threads through sysfs. Keeping siblings together lets
    # Fast use a small number of complete physical cores instead of all threads.
    groups: Dict[Tuple[str, str], List[int]] = {}
    try:
        for cpu in logical_cpus:
            topology_dir = f"/sys/devices/system/cpu/cpu{cpu}/topology"
            with open(os.path.join(topology_dir, "physical_package_id")) as fh:
                package_id = fh.read().strip()
            with open(os.path.join(topology_dir, "core_id")) as fh:
                core_id = fh.read().strip()
            groups.setdefault((package_id, core_id), []).append(cpu)
    except OSError:
        groups = {}

    if groups:
        physical_core_groups = tuple(
            tuple(cpus) for _, cpus in sorted(groups.items(), key=lambda item: min(item[1]))
        )
    else:
        # Without topology information, treat each available CPU as a core. This
        # remains safe because Fast is deliberately capped below all-core usage.
        physical_core_groups = tuple((cpu,) for cpu in logical_cpus)

    return HardwareProfile(logical_cpus, physical_core_groups)

# Speed and resource presets
PRESETS = {
    # Background-friendly. Resource limits are resolved from the CPU topology.
    "normal": {
        "frame_size": (720, 1280),
        "target_fps": 24,
        "video_quality": "middle",
        "download_workers": 1,
        "download_chunk_size": 131072,
    },
    # Faster while intentionally leaving most of the machine to the user.
    "fast": {
        "frame_size": (720, 1280),
        "target_fps": 24,
        # MovieLite maps this to x264 ultrafast / CRF 23. At 720p it is a
        # practical Fast trade-off, while Normal retains the balanced encoder.
        "video_quality": "low",
        "cpu_quota_percent": None,
        "download_workers": 2,
        "download_chunk_size": 262144,
    },
}

CALIBRATION_VERSION = 2
CALIBRATION_SAMPLE_SECONDS = 6.0
CALIBRATION_MIN_SPEEDUP = 0.08
CALIBRATION_WORKER_MEMORY_BYTES = 768 * 1024 * 1024


def _available_memory_bytes() -> Optional[int]:
    """Return available RAM on Linux without treating cached memory as unavailable."""
    try:
        values = {}
        with open("/proc/meminfo") as fh:
            for line in fh:
                key, value = line.split(":", 1)
                values[key] = int(value.strip().split()[0]) * 1024
        return values.get("MemAvailable")
    except (OSError, ValueError, IndexError):
        return None


def _candidate_worker_counts(hardware: HardwareProfile) -> Tuple[int, ...]:
    """Return safe worker candidates without consuming every physical core."""
    # Reserve one physical core for the desktop whenever the machine has more
    # than one. MovieLite's short-reel split/merge overhead also makes more than
    # four candidates counterproductive to benchmark at generation time.
    cpu_limit = max(1, hardware.physical_core_count - 1)
    memory_available = _available_memory_bytes()
    memory_limit = (
        max(1, memory_available // CALIBRATION_WORKER_MEMORY_BYTES)
        if memory_available is not None
        else 2
    )
    max_workers = min(4, cpu_limit, memory_limit)
    return tuple(range(1, max_workers + 1))


def _normal_cpu_quota_percent(hardware: HardwareProfile) -> int:
    """Choose a responsive aggregate CPU budget from available core topology."""
    # A compositor and encoder can use CPU concurrently. On a four-core machine,
    # 150% lets that pipeline make progress while still leaving most capacity to
    # the desktop; smaller machines scale down instead of using the same quota.
    return min(150, max(100, 50 + 25 * hardware.physical_core_count))


def _resolve_preset(preset: str, hardware: HardwareProfile) -> Dict[str, Any]:
    """Resolve a preset into limits appropriate for this machine.

    MovieLite creates one Python compositor and one libx264 encoder per render
    process. Its implementation also merges every part afterwards, so benchmarked
    scaling is useful through two workers but additional workers mainly add memory
    pressure and encoder contention for MindStream's short portrait reels.
    """
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset '{preset}'. Choose from: {', '.join(PRESETS)}")

    config = dict(PRESETS[preset])
    if preset == "normal":
        # A single compositor plus the cgroup quota keeps Normal lightweight.
        # Leave placement to the kernel scheduler rather than pinning CPU 0.
        config.update(
            writer_processes=1,
            ffmpeg_threads=1,
            cpu_affinity=(),
            niceness=10,
            cpu_quota_percent=_normal_cpu_quota_percent(hardware),
        )
        return config

    # Fast preset uses multi-worker rendering and full physical core count for FFmpeg encoding
    fast_worker_limit = max(2, min(4, hardware.physical_core_count))
    config.update(
        writer_processes=fast_worker_limit,
        ffmpeg_threads=max(2, hardware.physical_core_count),
        cpu_affinity=(),
        niceness=0,
    )
    return config


def _run_in_cpu_limited_scope(preset: str) -> Optional[int]:
    """Re-exec Normal in a user cgroup so its average CPU use is truly capped.

    Affinity and niceness are useful scheduling hints, but neither prevents an
    idle machine from running one core at 100%. systemd's CPUQuota covers the
    Python renderer and every MovieLite/FFmpeg child process on Linux.
    """
    quota_percent = (
        _normal_cpu_quota_percent(_detect_hardware_profile())
        if preset == "normal"
        else PRESETS[preset].get("cpu_quota_percent")
    )
    if (
        not quota_percent
        or sys.platform != "linux"
        or os.getenv("MINDSTREAM_CPU_QUOTA_APPLIED") == "1"
    ):
        return None

    systemd_run = shutil.which("systemd-run")
    if not systemd_run:
        print("WARNING: CPU quota unavailable; continuing with affinity limits only.")
        return None

    command = [
        systemd_run,
        "--user",
        "--scope",
        "--quiet",
        "-p",
        f"CPUQuota={quota_percent}%",
        "env",
        "MINDSTREAM_CPU_QUOTA_APPLIED=1",
        sys.executable,
        os.path.abspath(__file__),
        *sys.argv[1:],
    ]
    print(f"Normal preset: applying a {quota_percent}% CPU quota.")
    try:
        import subprocess

        return subprocess.run(command, check=False).returncode
    except OSError as exc:
        print(f"WARNING: Could not apply CPU quota ({exc}); continuing normally.")
        return None


class ReelGenerator:
    """Complete generation pipeline with multi-source video search and ambient audio."""

    def __init__(
        self,
        gemini_key: str = None,
        pexels_key: str = None,
        pixabay_key: str = None,
        coverr_key: str = None,
        mimo_key: str = None,
        preset: str = "normal",
        recalibrate_presets: bool = False,
    ):
        # load API keys if not provided
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.pexels_key = pexels_key or os.getenv("PEXELS_API_KEY")
        self.pixabay_key = pixabay_key or os.getenv("PIXABAY_API_KEY")
        self.coverr_key = coverr_key or os.getenv("COVERR_API_KEY")
        self.mimo_key = mimo_key or os.getenv("MIMO_API_KEY")

        # Script model provider selection
        self.script_provider = os.getenv("SCRIPT_MODEL_PROVIDER", "gemini").lower()
        self.script_model = os.getenv("SCRIPT_MODEL_NAME", "gemini-2.0-flash-exp")

        # Speed / resource preset
        self.preset = preset
        self.hardware = _detect_hardware_profile()
        self.physical_cores = self.hardware.physical_core_count
        self.preset_cfg = _resolve_preset(preset, self.hardware)
        self._niceness_applied = False
        self.recalibrate_presets = recalibrate_presets

        # Reuse a single HTTP session across all API calls (connection pooling)
        self._http = requests.Session()

        # Validate required keys
        if self.script_provider == "gemini" and not self.gemini_key:
            raise ValueError("GEMINI_API_KEY required (set in .env)")
        if self.script_provider == "groq" and not self.groq_key:
            raise ValueError("GROQ_API_KEY required (set in .env)")
        if not self.pexels_key:
            raise ValueError("PEXELS_API_KEY required (set in .env)")
        if not self.mimo_key:
            raise ValueError("MIMO_API_KEY required (set in .env)")

        # Initialize clients based on provider
        if self.script_provider == "gemini":
            self.client = genai.Client(api_key=self.gemini_key)

        # Output directories
        self.output_dir = "output"
        self.temp_dir = os.path.join(self.output_dir, "temp")
        os.makedirs(os.path.join(self.output_dir, "audio"), exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "reels"), exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)
        self.calibration_path = os.path.join(
            self.output_dir, "render_profile_calibration.json"
        )

        # Ambient audio mapping per FER+ emotion class (falls back to neutral.mp3 if missing)
        self.ambient_music = {
            "angry":    "assets/audio/angry.mp3",     # Low rumble, rain on glass
            "contempt": "assets/audio/contempt.mp3",  # Sparse piano, warm pad hum
            "disgust":  "assets/audio/disgust.mp3",   # Gentle stream, forest ambience
            "fear":     "assets/audio/fear.mp3",      # Slow breathing, soft drone
            "happy":    "assets/audio/happy.mp3",     # Warm resonance, morning birds
            "neutral":  "assets/audio/neutral.mp3",   # White noise, minimal drone
            "sad":      "assets/audio/sad.mp3",       # Sparse piano, slow ocean waves
            "surprise": "assets/audio/surprise.mp3",  # Calm waves, grounding bell
        }

    @contextlib.contextmanager
    def _spinner(self, message: str):
        """Context manager that shows a braille spinner with the given message."""
        stop = False

        def _run():
            idx = 0
            while not stop:
                sys.stdout.write(
                    f"\r{self.BRAILLE_CHARS[idx % len(self.BRAILLE_CHARS)]} {message}"
                )
                sys.stdout.flush()
                idx += 1
                time.sleep(0.1)
            sys.stdout.write("\r" + " " * 50 + "\r")
            sys.stdout.flush()

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop = True
            thread.join(timeout=0.2)

    def generate_script(self, emotion: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ask Gemini to return a JSON object with:
          - "script": full spoken text (sent verbatim to TTS)
          - "subtitles": list of short phrases (4-6 words each) that together
                         cover the whole script in order
        """
        activity = context.get("active_tab_category", "browsing")
        time_of_day = context.get("time_of_day", "the day")
        user_name = context.get("user_name", "friend")

        # Map activity categories to richer, more evocative language for the prompt
        activity_descriptions = {
            "coding":        "writing code -- deep in logic, problem-solving, debugging",
            "entertainment": "watching videos or streams -- passively consuming content",
            "social_media":  "scrolling through social media -- flicking between posts and feeds",
            "research":      "reading and researching -- absorbing information",
            "shopping":      "browsing products -- weighing options, comparing things",
            "browsing":      "browsing the web -- moving from tab to tab",
        }
        activity_desc = activity_descriptions.get(activity, f"working on their computer ({activity})")

        prompt = f"""You are a wise, warm elder -- like a grandfather -- speaking directly to {user_name} who is currently feeling {emotion}.

Generate a deeply personal, grounding spoken reflection that is 45-60 seconds long when read aloud slowly.

DO NOT use corporate wellness language, coaching platitudes, or generic mindfulness scripts.
Speak with real intimacy, as if you know this person and genuinely care.

Context you must weave in naturally:
- Their name: {user_name}
- What they've been doing: {activity_desc}
- Time of day: {time_of_day}
- Their emotional state: {emotion}

Writing guidelines (follow all of them):
1. Open by gently saying their name and acknowledging the quality of their attention in this moment -- not what they were doing, but HOW they were doing it (pulled in, scattered, absorbed, restless, flowing)
2. Use one vivid nature metaphor (river, cloud, tree, candle, tide, light) that mirrors their emotional state: {emotion}
3. Acknowledge the universal human quality of getting absorbed in screens -- validate it without shame
4. Give ONE simple physical anchor they can do right now (e.g. "feel the weight of your feet on the floor", "place a palm on your chest", "let your eyes rest on something distant")
5. End with a gentle permission -- to rest, to be imperfect, to simply exist for a moment

DO NOT:
- Mention specific websites, domains, or app names
- Be prescriptive about what they "should" do
- Use coaching or corporate language
- List multiple steps or actions

You MUST respond with ONLY a valid JSON object, nothing else -- no markdown fences, no explanation:
{{
  "script": "<the complete spoken text as one continuous string, punctuated for natural speech>",
  "subtitles": [
    "<phrase 1 -- 4 to 6 words>",
    "<phrase 2 -- 4 to 6 words>",
    "..."
  ]
}}

The subtitles array must contain the ENTIRE script broken into SHORT consecutive phrases of 4-6 words each, in order.
Every word in the script must appear in exactly one subtitle phrase.
Do not truncate, summarise, or skip any part of the script."""

        # Call the appropriate LLM based on provider
        if self.script_provider == "groq":
            response = self._http.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.groq_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.script_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a wise, warm elder who creates mindfulness scripts in JSON format.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.8,
                    "response_format": {"type": "json_object"},
                },
                timeout=30,
            )
            response.raise_for_status()
            raw = response.json()["choices"][0]["message"]["content"]
        else:
            response = self.client.models.generate_content(
                model=self.script_model, contents=prompt, config={"temperature": 0.9}
            )
            raw = response.text.strip()
            # Strip markdown fences if the model ignores the instruction
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw.strip())
            raw = raw.strip()

        data = json.loads(raw)

        if "script" not in data or "subtitles" not in data:
            raise ValueError(
                f"LLM JSON missing required keys. Got: {list(data.keys())}"
            )

        script = data["script"].strip()
        subtitles = [p.strip() for p in data["subtitles"] if p.strip()]

        if not script:
            raise ValueError("LLM returned an empty script.")
        if not subtitles:
            raise ValueError("LLM returned no subtitle phrases.")

        return {"script": script, "subtitles": subtitles}

    # Video keyword extraction

    def extract_video_keywords(self, script: str, emotion: str, context: Dict[str, Any] = None) -> List[str]:
        """Extract 8-10 cinematic/moody video search terms from the script and context."""
        activity = (context or {}).get("active_tab_category", "")
        activity_hint = f"\n- User's current activity: {activity}" if activity else ""

        prompt = f"""From this mindfulness script about the emotion "{emotion}", extract 8-10 search terms to find matching stock video footage.

Script:
{script}{activity_hint}

The video aesthetic must feel: deep, cinematic, moody, trustworthy, grounding -- NOT bright, cheerful, or stock-photo generic.
Use low-light, dusk, mist, shadows, slow motion, nature, water, fire, sky, or architectural calm as visual themes.
Vary the terms so each clip looks visually distinct from the others.

Return ONLY a JSON array of 8-10 strings, e.g.:
["misty forest at dusk", "soft rain on a window", "dark ocean waves at night", "candle flame slow motion", "fog rolling over mountains", "empty street at night rain", "close up water drops glass", "lone tree misty field"]

No explanation, no markdown -- just the raw JSON array."""

        try:
            if self.script_provider == "groq":
                response = self._http.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.groq_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.script_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7,
                    },
                    timeout=20,
                )
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
            else:
                response = self.client.models.generate_content(
                    model=self.script_model,
                    contents=prompt,
                    config={"temperature": 0.9},
                )
                text = response.text.strip()

            text = text.replace("```json", "").replace("```", "").strip()
            keywords = json.loads(text)
            if isinstance(keywords, list) and keywords:
                return keywords[:10]
        except Exception as e:
            print(f"Keyword extraction failed ({e})")
            return []

        return []

    # Multi-source video search + download

    def search_pexels_videos(
        self, keyword: str, orientation: str = "portrait"
    ) -> Optional[str]:
        """Search Pexels and return a direct download URL for the best match."""
        try:
            resp = self._http.get(
                "https://api.pexels.com/videos/search",
                headers={"Authorization": self.pexels_key},
                params={
                    "query": keyword,
                    "orientation": orientation,
                    "size": "medium",
                    "per_page": 20,
                },
                timeout=10,
            )
            resp.raise_for_status()
            videos = resp.json().get("videos", [])

            if not videos:
                return None

            # Prefer HD (height >= 1080) portrait files
            for video in videos:
                for f in sorted(
                    video.get("video_files", []),
                    key=lambda x: x.get("height", 0),
                    reverse=True,
                ):
                    if f.get("height", 0) >= 720:
                        return f.get("link")

            # Any file as last resort
            files = videos[0].get("video_files", [])
            return files[0].get("link") if files else None
        except Exception as e:
            return None

    def search_pixabay_videos(self, keyword: str) -> Optional[str]:
        """Search Pixabay (fallback source) and return a direct download URL."""
        if not self.pixabay_key:
            return None

        try:
            resp = self._http.get(
                "https://pixabay.com/api/videos/",
                params={
                    "key": self.pixabay_key,
                    "q": keyword,
                    "video_type": "all",
                    "per_page": 20,
                },
                timeout=10,
            )
            resp.raise_for_status()
            videos = resp.json().get("hits", [])

            if not videos:
                return None

            # Get the medium or small video URL
            for video in videos:
                if "medium" in video.get("videos", {}):
                    return video["videos"]["medium"]["url"]
                elif "small" in video.get("videos", {}):
                    return video["videos"]["small"]["url"]

            return None
        except Exception as e:
            return None

    def search_coverr_videos(self, keyword: str) -> Optional[str]:
        """Search Coverr (fallback source) and return a direct download URL."""
        if not self.coverr_key:
            return None

        try:
            # Coverr API endpoint (based on common API patterns)
            resp = self._http.get(
                "https://api.coverr.co/videos",
                headers={"Authorization": f"Bearer {self.coverr_key}"},
                params={"query": keyword, "per_page": 20},
                timeout=10,
            )
            resp.raise_for_status()
            videos = resp.json().get("videos", [])

            if not videos:
                return None

            # Get the download URL
            for video in videos:
                if "url" in video:
                    return video["url"]

            return None
        except Exception as e:
            # Coverr API might have different structure, fail gracefully
            return None

    def _download_video(self, url: str, dest: str) -> bool:
        try:
            r = self._http.get(url, stream=True, timeout=60)
            r.raise_for_status()

            chunk_size = self.preset_cfg["download_chunk_size"]
            with open(dest, "wb") as fh:
                for chunk in r.iter_content(chunk_size=chunk_size):
                    fh.write(chunk)
            return True
        except Exception as e:
            return False

    def download_videos_for_script(self, keywords: List[str], job_id: str) -> List[str]:
        """
        Download one video per keyword (with multi-source fallback), return list of local paths.
        NO hardcoded fallback keywords - if search fails, generation fails gracefully.
        """
        if not keywords:
            print("No keywords extracted -- cannot download videos")
            return []

        def download_single_keyword(i: int, kw: str) -> Optional[str]:
            """Try all sources for a keyword: Pexels → Pixabay → Coverr"""
            url = None

            # Try Pexels first
            url = self.search_pexels_videos(kw)
            if url:
                source = "Pexels"

            # Fallback to Pixabay
            if not url and self.pixabay_key:
                url = self.search_pixabay_videos(kw)
                if url:
                    source = "Pixabay"

            # Fallback to Coverr
            if not url and self.coverr_key:
                url = self.search_coverr_videos(kw)
                if url:
                    source = "Coverr"

            if not url:
                return None

            dest = os.path.join(self.temp_dir, f"{job_id}_clip_{i}.mp4")
            if self._download_video(url, dest):
                return dest
            return None

        # Download videos in parallel with DNF-style progress
        paths = []
        completed = 0
        total = len(keywords)
        width = 20

        with ThreadPoolExecutor(
            max_workers=min(self.preset_cfg["download_workers"], len(keywords))
        ) as executor:
            futures = {
                executor.submit(download_single_keyword, i, kw): (i, kw)
                for i, kw in enumerate(keywords)
            }

            for future in as_completed(futures):
                i, kw = futures[future]
                try:
                    result = future.result()
                    if result:
                        paths.append(result)
                except Exception as e:
                    pass
                completed += 1
                # DNF-style progress bar matching the format of other steps
                pct = int(100 * completed / total) if total > 0 else 0
                filled = int(width * completed / total) if total > 0 else 0
                bar = "━" * filled + " " * (width - filled)
                color = self.CYAN if completed < total else self.GREEN
                # Format exactly like _progress_bar_dnf with green checkmark prefix
                desc = f"{'Downloading footage':<26}"
                if completed >= total:
                    # Final line with green checkmark
                    print(
                        f"\r{self.GREEN}✓{self.RESET} {desc}{color}{pct:3d}% |{bar}| {completed}/{total}{self.RESET}",
                        end="",
                        flush=True,
                    )
                else:
                    # In-progress with spinner (updates per item)
                    spinner_char = self.BRAILLE_CHARS[
                        completed % len(self.BRAILLE_CHARS)
                    ]
                    print(
                        f"\r{self.CYAN}{spinner_char}{self.RESET} {desc}{color}{pct:3d}% |{bar}| {completed}/{total}{self.RESET}",
                        end="",
                        flush=True,
                    )

        print()  # newline after progress
        # Sort paths by clip number to maintain order
        paths.sort(
            key=lambda p: (
                int(re.search(r"clip_(\d+)", p).group(1)) if "clip_" in p else 999
            )
        )

        if not paths:
            print("No videos could be downloaded from any source")
            return []

        return paths

    # TTS via Xiaomi MiMo API (Dean voice)

    async def _generate_tts_async(self, script: str, output_path: str) -> str:
        loop = asyncio.get_event_loop()

        response = await loop.run_in_executor(
            None,
            lambda: self._http.post(
                "https://api.xiaomimimo.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.mimo_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "mimo-v2.5-tts",
                    "messages": [{"role": "assistant", "content": script}],
                    "audio": {"format": "mp3", "voice": "Dean"},
                },
                timeout=90,
            ),
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"MiMo TTS API error {response.status_code}: {response.text[:300]}"
            )
        audio_b64 = response.json()["choices"][0]["message"]["audio"]["data"]
        with open(output_path, "wb") as fh:
            fh.write(base64.b64decode(audio_b64))

        return output_path

    def generate_tts(self, script: str, output_path: str) -> str:
        """Synchronous wrapper around the async MiMo call."""
        asyncio.run(self._generate_tts_async(script, output_path))
        return output_path

    # Subtitle SRT generation (Gemini-based, proportional timing)

    @staticmethod
    def _srt_ts(seconds: float) -> str:
        """Convert float seconds → SRT timestamp string HH:MM:SS,mmm."""
        ms = max(0, int(round(seconds * 1000)))
        h = ms // 3_600_000
        ms %= 3_600_000
        m = ms // 60_000
        ms %= 60_000
        s = ms // 1_000
        ms %= 1_000
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    @staticmethod
    def _word_count(phrase: str) -> int:
        return max(1, len(phrase.split()))

    def _phrase_has_pause(self, phrase: str) -> bool:
        """Does this phrase end with punctuation that implies a longer pause?"""
        return bool(re.search(r"[.!?…]$", phrase.strip()))

    def build_srt(self, subtitles: List[str], audio_duration: float) -> str:
        """
        Distribute audio_duration across subtitle phrases.
        Uses character count as a better proxy for speech duration than word count.
        """
        if not subtitles:
            return ""

        PAUSE_BONUS = 0.20  # Add 20% extra time for phrases ending with punctuation

        # Use character count (better proxy for speech duration than word count)
        weights = []
        for phrase in subtitles:
            # Count characters (excluding spaces) as base weight
            w = max(1, len(phrase.replace(" ", "")))

            # Add pause time for sentence endings
            if self._phrase_has_pause(phrase):
                w += PAUSE_BONUS * w

            weights.append(w)

        total_weight = sum(weights)
        available = audio_duration

        lines = []
        cursor = 0.0

        for idx, (phrase, weight) in enumerate(zip(subtitles, weights), start=1):
            phrase_dur = available * (weight / total_weight)
            start = cursor
            end = cursor + phrase_dur
            cursor = end

            lines.append(str(idx))
            lines.append(f"{self._srt_ts(start)} --> {self._srt_ts(end)}")
            lines.append(phrase)
            lines.append("")

        return "\n".join(lines)

    # Video Compositing

    # SRT Parser (Manual subtitle handling for MovieLite)

    @staticmethod
    def _parse_srt_content(content: str) -> List[Tuple[float, float, str]]:
        """Parse SRT content string and return list of (start, end, text) tuples."""
        content = content.strip()
        blocks = re.split(r"\n\n+", content)
        subtitles = []

        for block in blocks:
            lines = block.strip().split("\n")
            if len(lines) < 3:
                continue

            timestamp_line = lines[1]
            match = re.match(
                r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})",
                timestamp_line,
            )
            if not match:
                continue

            h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, match.groups())
            start_time = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0
            end_time = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0
            text = " ".join(lines[2:])
            subtitles.append((start_time, end_time, text))

        return subtitles

    @staticmethod
    def parse_srt(srt_path: str) -> List[Tuple[float, float, str]]:
        """Parse SRT file and return list of (start_time, end_time, text) tuples."""
        with open(srt_path, "r", encoding="utf-8") as f:
            content = f.read()
        return ReelGenerator._parse_srt_content(content)

    def _create_subtitle_canvas(self, frame_width: int) -> Canvas:
        """Create styled canvas for subtitle text (MovieLite/pictex)."""
        scale = frame_width / 1080
        return (
            Canvas()
            .font_family("Poppins")
            .font_size(round(50 * scale))
            .color("#FFFF00")  # Yellow
            .text_shadows(
                Shadow(
                    offset=(round(2 * scale), round(2 * scale)),
                    blur_radius=round(3 * scale),
                    color="black",
                )
            )
            .padding(round(20 * scale))
        )

    def _resize_to_portrait(
        self, clip: ml.VideoClip, frame_size: Tuple[int, int]
    ) -> ml.VideoClip:
        """
        Resize to the preset's portrait output size using MovieLite.
        MovieLite's set_size() maintains aspect ratio and crops/pads automatically.
        """
        # MovieLite's set_size will resize maintaining aspect ratio
        # If the source aspect ratio doesn't match, it will crop center
        clip.set_size(width=frame_size[0], height=frame_size[1])
        return clip

    def _calibration_signature(self) -> Dict[str, Any]:
        """Describe the machine and output profile that affect worker scaling."""
        return {
            "logical_cpus": list(self.hardware.logical_cpus),
            "physical_core_groups": [
                list(group) for group in self.hardware.physical_core_groups
            ],
            "frame_size": list(self.preset_cfg["frame_size"]),
            "target_fps": self.preset_cfg["target_fps"],
            "video_quality": self.preset_cfg["video_quality"],
            "movielite_version": getattr(ml, "__version__", "unknown"),
        }

    def _affinity_for_workers(self, workers: int) -> Tuple[int, ...]:
        # Process count is the resource control. The kernel can then place work
        # naturally instead of permanently reserving arbitrary CPU IDs.
        return ()

    def _load_calibrated_workers(self) -> Optional[int]:
        if self.recalibrate_presets or not os.path.exists(self.calibration_path):
            return None
        try:
            with open(self.calibration_path, encoding="utf-8") as fh:
                cached = json.load(fh)
            profile = cached.get("profiles", {}).get(self.preset)
            if (
                cached.get("version") != CALIBRATION_VERSION
                or cached.get("signature") != self._calibration_signature()
                or not profile
            ):
                return None
            workers = int(profile["workers"])
            return workers if workers in _candidate_worker_counts(self.hardware) else None
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None

    def _save_calibrated_workers(
        self, workers: int, timings: Dict[int, float]
    ) -> None:
        payload: Dict[str, Any] = {
            "version": CALIBRATION_VERSION,
            "signature": self._calibration_signature(),
            "profiles": {},
        }
        try:
            if os.path.exists(self.calibration_path):
                with open(self.calibration_path, encoding="utf-8") as fh:
                    existing = json.load(fh)
                if existing.get("signature") == payload["signature"]:
                    payload["profiles"] = existing.get("profiles", {})
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            pass

        payload["profiles"][self.preset] = {
            "workers": workers,
            "timings_seconds": {str(key): round(value, 3) for key, value in timings.items()},
        }
        temporary_path = f"{self.calibration_path}.tmp"
        try:
            with open(temporary_path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(temporary_path, self.calibration_path)
        except OSError:
            try:
                os.remove(temporary_path)
            except OSError:
                pass

    def _benchmark_render_workers(self, video_path: str, workers: int) -> float:
        """Render a short clip using a candidate worker count and return wall time."""
        frame_width, frame_height = self.preset_cfg["frame_size"]
        output_path = os.path.join(
            self.temp_dir, f"calibration_{self.preset}_{workers}_{os.getpid()}.mp4"
        )
        clip = None
        started = time.perf_counter()
        try:
            with self._limit_render_resources(
                self.preset_cfg["ffmpeg_threads"],
                self._affinity_for_workers(workers),
                self.preset_cfg["niceness"],
            ):
                clip = ml.VideoClip(video_path)
                sample_duration = min(CALIBRATION_SAMPLE_SECONDS, clip.duration)
                if sample_duration <= 0:
                    raise RuntimeError("Video has no usable duration for calibration")
                self._resize_to_portrait(clip, (frame_width, frame_height))
                clip.set_duration(sample_duration)
                writer = ml.VideoWriter(
                    output_path,
                    fps=self.preset_cfg["target_fps"],
                    size=(frame_width, frame_height),
                    duration=sample_duration,
                )
                writer.add_clip(clip)
                writer.write(
                    processes=workers,
                    video_quality=(
                        ml.VideoQuality.HIGH
                        if self.preset_cfg["video_quality"] == "high"
                        else ml.VideoQuality.MIDDLE
                    ),
                )
            return time.perf_counter() - started
        finally:
            if clip is not None and hasattr(clip, "close"):
                clip.close()
            try:
                os.remove(output_path)
            except OSError:
                pass

    def _configure_calibrated_workers(self, video_path: str) -> None:
        """Select a measured Fast worker count once per hardware/output profile."""
        if self.preset != "fast":
            return

        cached_workers = self._load_calibrated_workers()
        if cached_workers is not None:
            self.preset_cfg["writer_processes"] = cached_workers
            self.preset_cfg["cpu_affinity"] = self._affinity_for_workers(cached_workers)
            return

        candidates = _candidate_worker_counts(self.hardware)
        if len(candidates) == 1:
            self.preset_cfg["writer_processes"] = candidates[0]
            self.preset_cfg["cpu_affinity"] = ()
            print("  Fast: using one render worker while memory headroom is limited.")
            return

        print("Calibrating Fast for this machine (one-time)...")
        timings: Dict[int, float] = {}
        for workers in candidates:
            try:
                timings[workers] = self._benchmark_render_workers(video_path, workers)
            except Exception:
                continue

        if not timings:
            print("  Calibration skipped; using the safe Fast fallback.")
            return

        selected_workers = min(timings)
        selected_time = timings[selected_workers]
        for workers in sorted(timings):
            if workers == selected_workers:
                continue
            candidate_time = timings[workers]
            if candidate_time <= selected_time * (1 - CALIBRATION_MIN_SPEEDUP):
                selected_workers = workers
                selected_time = candidate_time

        self.preset_cfg["writer_processes"] = selected_workers
        self.preset_cfg["cpu_affinity"] = self._affinity_for_workers(selected_workers)
        self._save_calibrated_workers(selected_workers, timings)
        print(f"  Fast calibrated: {selected_workers} render worker(s).")

    @contextlib.contextmanager
    def _limit_render_resources(
        self,
        ffmpeg_threads: int,
        cpu_affinity: Tuple[int, ...],
        niceness: int,
    ):
        """Apply the preset's CPU budget to MovieLite and its child processes.

        MovieLite forks render workers, so the affinity, niceness, and Popen patch
        are inherited by frame rendering, libx264 encoding, audio work, and merging.
        """
        import subprocess

        original_popen = subprocess.Popen

        _patch_count = 0  # track how many calls we intercepted

        def _patched_popen(args, *posargs, **kwargs):
            nonlocal _patch_count
            if isinstance(args, (list, tuple)) and args:
                # Match "ffmpeg" by basename (handles /usr/bin/ffmpeg too)
                prog = os.path.basename(str(args[0]))
                if prog == "ffmpeg" and "-threads" not in args:
                    args = list(args)
                    # Find last occurrence of "-i" to place -threads as an output option (after input)
                    last_i = -1
                    for idx, arg in enumerate(args):
                        if str(arg) == "-i":
                            last_i = idx
                    insert_idx = (
                        (last_i + 2)
                        if (last_i != -1 and last_i + 1 < len(args))
                        else (len(args) - 1)
                    )
                    args.insert(insert_idx, "-threads")
                    args.insert(insert_idx + 1, str(ffmpeg_threads))
                    _patch_count += 1
            return original_popen(args, *posargs, **kwargs)

        # MovieLite's compositor calls OpenCV for every frame. Keep it single
        # threaded so one render worker cannot exceed its preset CPU budget.
        try:
            import cv2

            saved_cv2_threads = cv2.getNumThreads()
            cv2.setNumThreads(1)
        except Exception:
            saved_cv2_threads = None

        saved_affinity = None
        if cpu_affinity and hasattr(os, "sched_setaffinity"):
            try:
                saved_affinity = os.sched_getaffinity(0)
                os.sched_setaffinity(0, set(cpu_affinity))
            except (OSError, PermissionError):
                saved_affinity = None

        subprocess.Popen = _patched_popen
        if niceness > 0 and not self._niceness_applied:
            # This is intentionally applied only to Normal. Linux niceness cannot
            # be raised again without elevated privileges, but this worker exits
            # after generation and all MovieLite children inherit the lower priority.
            try:
                os.nice(niceness)
                self._niceness_applied = True
            except (OSError, PermissionError):
                pass

        try:
            yield
        finally:
            subprocess.Popen = original_popen

            if saved_cv2_threads is not None:
                try:
                    import cv2

                    cv2.setNumThreads(saved_cv2_threads)
                except Exception:
                    pass

            if saved_affinity is not None and hasattr(os, "sched_setaffinity"):
                try:
                    os.sched_setaffinity(0, saved_affinity)
                except (OSError, PermissionError):
                    pass

            if _patch_count > 0:
                print(
                    f"  (patched {_patch_count} ffmpeg calls → threads={ffmpeg_threads})"
                )
            else:
                print(f"  (WARNING: ffmpeg patch did not fire -- threads not limited)")

    def composite_reel(
        self,
        video_paths: List[str],
        tts_path: str,
        output_path: str,
        subtitle_list: List[str],
        ambient_path: Optional[str] = None,
        tts_duration: float = 0.0,
    ) -> str:
        """
        Composite reel using MovieLite.
        Concatenates video clips, mixes audio, and overlays subtitles.
        Wrapped entirely in _limit_render_resources so every MovieLite stage
        respects the selected CPU budget.
        """
        ffmpeg_threads = self.preset_cfg["ffmpeg_threads"]
        cpu_affinity = self.preset_cfg["cpu_affinity"]
        niceness = self.preset_cfg["niceness"]

        with self._limit_render_resources(ffmpeg_threads, cpu_affinity, niceness):
            # Use pre-computed duration to avoid re-loading the TTS audio
            if tts_duration <= 0:
                tts_audio_tmp = ml.AudioClip(tts_path)
                tts_duration = tts_audio_tmp.duration
                tts_audio_tmp.close()
            duration = tts_duration

            target_fps = self.preset_cfg["target_fps"]
            writer_procs = self.preset_cfg["writer_processes"]
            frame_width, frame_height = self.preset_cfg["frame_size"]
            quality_str = self.preset_cfg["video_quality"]
            video_quality = (
                ml.VideoQuality.HIGH
                if quality_str == "high"
                else (
                    ml.VideoQuality.LOW
                    if quality_str == "low"
                    else ml.VideoQuality.MIDDLE
                )
            )

            # Process video clips
            # Cap each clip at MAX_CLIP_SECONDS so the reel cuts every few seconds
            # rather than looping the same scene for the entire TTS duration.
            MAX_CLIP_SECONDS = 5.0
            n_clips = len(video_paths)
            # Distribute total duration evenly but never exceed the cap.
            # If we have more clips than needed, only use as many as required
            # to cover the full audio at the cap duration.
            clips_needed = max(1, -(-int(duration) // int(MAX_CLIP_SECONDS)))  # ceil div
            clips_to_use = video_paths[:clips_needed] if len(video_paths) >= clips_needed else video_paths
            n_used = len(clips_to_use)
            time_per_clip = duration / n_used
            # If even distribution is above cap, loop back through available clips
            if time_per_clip > MAX_CLIP_SECONDS:
                time_per_clip = MAX_CLIP_SECONDS

            processed_clips = []
            current_time = 0.0
            clip_idx = 0

            while current_time < duration - 0.05:
                path = clips_to_use[clip_idx % n_used]
                clip_dur = min(time_per_clip, duration - current_time)
                clip = ml.VideoClip(path)
                clip = self._resize_to_portrait(clip, (frame_width, frame_height))

                if clip.duration < clip_dur:
                    clip.loop(True)

                clip.set_duration(clip_dur)
                clip.set_start(current_time)
                # Mute the video's own audio track -- all audio comes from TTS + ambient
                if clip.audio.has_audio:
                    clip.audio.set_volume(0)
                current_time += clip_dur
                clip_idx += 1
                processed_clips.append(clip)

            print(f"{self.GREEN}✓{self.RESET} Processing video clips")

            # Setup audio
            print(f"{self.GREEN}✓{self.RESET} Synchronizing audio")

            tts_audio = ml.AudioClip(tts_path)
            tts_audio.set_start(0)

            audio_clips = [tts_audio]
            if ambient_path and os.path.exists(ambient_path):
                ambient_audio = ml.AudioClip(ambient_path, start=0, volume=0.35)
                ambient_audio.set_duration(duration)
                ambient_audio.loop(True)
                audio_clips.append(ambient_audio)

            # Generate subtitles in memory (no disk write)
            srt_content = self.build_srt(subtitle_list, duration)
            subtitle_entries = self._parse_srt_content(srt_content)

            subtitle_clips = []
            canvas = self._create_subtitle_canvas(frame_width)

            for start_time, end_time, text in subtitle_entries:
                adjusted_start = max(0, start_time - 0.2)
                adjusted_end = max(adjusted_start + 0.1, end_time - 0.2)

                text_clip = ml.TextClip(
                    text,
                    start=adjusted_start,
                    duration=adjusted_end - adjusted_start,
                    canvas=canvas,
                )

                text_width = text_clip.size[0]
                text_clip.set_position(
                    ((frame_width - text_width) // 2, int(frame_height * 0.86))
                )
                subtitle_clips.append(text_clip)

            print(
                f"{self.GREEN}✓{self.RESET} Rendering {len(subtitle_clips)} subtitle segments\n"
            )

            # Export
            self._print_step(5, 5, "Exporting final video")

            with self._spinner("Exporting..."):
                writer = ml.VideoWriter(
                    output_path,
                    fps=target_fps,
                    size=(frame_width, frame_height),
                    duration=duration,
                )

                for clip in processed_clips:
                    writer.add_clip(clip)
                for audio_clip in audio_clips:
                    writer.add_clip(audio_clip)
                for sub_clip in subtitle_clips:
                    writer.add_clip(sub_clip)

                writer.write(processes=writer_procs, video_quality=video_quality)

            print(f"{self.GREEN}✓{self.RESET} Reel generated successfully")

            # Cleanup all held resources
            all_clips = processed_clips + audio_clips + subtitle_clips
            for clip in all_clips:
                try:
                    if hasattr(clip, "close"):
                        clip.close()
                except Exception:
                    pass

            return output_path

    # Main pipeline

    # ANSI color codes
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    RESET = "\033[0m"

    # Braille spinner for multi-stage loading
    BRAILLE_CHARS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def _print_step(self, step: int, total: int, desc: str):
        """Print step header in DNF style."""
        print(f"[{step}/{total}] {desc}")

    def _progress_bar_dnf(
        self, current: int, total: int, desc: str, color: str = ""
    ) -> str:
        """Generate DNF-style progress bar with proper vertical alignment."""
        width = 20
        percentage = (current / total * 100) if total > 0 else 0
        filled = int(width * current / total) if total > 0 else 0
        bar = "━" * filled + " " * (width - filled)
        return f"{desc:<25} {color}{percentage:3.0f}% |{bar}| {current}/{total}{self.RESET}"

    def generate_reel(
        self,
        job_id: str,
        emotion: str,
        context: Dict[str, Any],
        header: bool = True,
        output_filename: Optional[str] = None,
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "success": False,
            "job_id": job_id,
            "reel_path": None,
            "script": None,
            "keywords": None,
            "preset": self.preset,
            "error": None,
        }

        try:
            # Script generation
            self._print_step(1, 5, "Generating personalized script")
            provider_name = "Groq" if self.script_provider == "groq" else "Gemini"
            print(f"Provider : {provider_name} ({self.script_model})")

            with self._spinner("Generating script..."):
                script_data = self.generate_script(emotion, context)
                script = script_data["script"]
                subtitle_list = script_data["subtitles"]
                result["script"] = script

            desc = f"{'Script generated':<26}"
            print(
                f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET}\n"
            )

            # Video search
            self._print_step(2, 5, "Finding supporting visuals")
            print(f"Provider : Pexels")

            with self._spinner("Searching videos..."):
                keywords = self.extract_video_keywords(script, emotion, context)
                result["keywords"] = keywords
                if not keywords:
                    raise RuntimeError("Could not extract video keywords from script")

            def _truncate(kw, maxlen=20):
                return kw if len(kw) <= maxlen else kw[: maxlen - 1] + "…"

            keywords_display = " • ".join(_truncate(kw) for kw in keywords[:4])
            print(f"Keywords : {keywords_display}")

            video_paths = self.download_videos_for_script(keywords, job_id)
            if not video_paths:
                raise RuntimeError("No videos could be downloaded")
            print()

            # TTS generation
            self._print_step(3, 5, "Generating narration")
            print(f"Provider : MiMo (Dean)")

            with self._spinner("Generating narration..."):
                tts_path = os.path.join(self.output_dir, "audio", f"{job_id}.mp3")
                self.generate_tts(script, tts_path)

            # Compute TTS duration once (avoids reloading in composite_reel)
            tts_duration = 0.0
            try:
                audio = ml.AudioClip(tts_path)
                tts_duration = audio.duration
                duration_display = int(tts_duration)
                audio.close()
                desc = f"{'Narration generated':<26}"
                print(
                    f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET} ({duration_display}s)\n"
                )
            except:
                desc = f"{'Narration generated':<26}"
                print(
                    f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET}\n"
                )

            self._print_step(4, 5, "Preparing final composition")
            self._configure_calibrated_workers(video_paths[0])
            reel_name = output_filename if output_filename else f"{job_id}.mp4"
            reel_path = os.path.join(self.output_dir, "reels", reel_name)
            ambient_path = self.ambient_music.get(
                emotion, self.ambient_music.get("neutral")
            )
            self.composite_reel(
                video_paths=video_paths,
                tts_path=tts_path,
                output_path=reel_path,
                subtitle_list=subtitle_list,
                ambient_path=ambient_path,
                tts_duration=tts_duration,
            )

            result["reel_path"] = reel_path
            result["success"] = True

            # Clean up temp video clips
            for p in video_paths:
                try:
                    os.remove(p)
                except OSError:
                    pass

        except Exception as exc:
            result["error"] = str(exc)
            import traceback

            traceback.print_exc()

        return result


# CLI entry point


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="MindStream Reel Generator")
    parser.add_argument("--job-id", required=False, help="Job ID")
    parser.add_argument("--emotion", required=False, help="Emotion label")
    parser.add_argument("--context", required=False, help="Context JSON string")
    parser.add_argument("--output-filename", required=False, help="Output MP4 filename")
    parser.add_argument(
        "--preset",
        required=False,
        default="normal",
        choices=list(PRESETS.keys()),
        help="Speed/resource preset (default: normal)",
    )
    parser.add_argument(
        "--recalibrate-presets",
        action="store_true",
        help="Ignore cached Fast calibration and measure worker scaling again",
    )
    args = parser.parse_args()

    scoped_exit_code = _run_in_cpu_limited_scope(args.preset)
    if scoped_exit_code is not None:
        return scoped_exit_code

    print("MindStream -- Reel Generation\n")

    try:
        gen = ReelGenerator(
            preset=args.preset, recalibrate_presets=args.recalibrate_presets
        )
        print(f"Preset: {args.preset.title()}\n")
    except ValueError as e:
        print("\033[91m✗\033[0m Environment check failed\n")
        print(f"Error: {e}", file=sys.stderr)
        return 1

    start_time = time.time()

    if args.job_id and args.emotion and args.context:
        try:
            ctx = json.loads(args.context)
        except json.JSONDecodeError as e:
            print(f"Invalid --context JSON: {e}", file=sys.stderr)
            return 1
        print(
            f"Job   : {args.job_id} | {args.emotion.title()} | {ctx.get('user_name', 'User')}\n"
        )
        result = gen.generate_reel(
            job_id=args.job_id, emotion=args.emotion, context=ctx, header=False, output_filename=args.output_filename
        )
    else:
        print("Input : inline sample parameters")
        sample_job_id = "sample-job-001"
        sample_emotion = "neutral"
        sample_context = {
            "user_name": "User",
            "active_tab_category": "coding",
            "time_of_day": "afternoon"
        }
        print(
            f"Job   : {sample_job_id} | {sample_emotion.title()} | {sample_context.get('user_name', 'User')}\n"
        )
        result = gen.generate_reel(
            job_id=sample_job_id,
            emotion=sample_emotion,
            context=sample_context,
            header=False,
        )

    elapsed = time.time() - start_time
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    time_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

    if result["success"]:
        print(f"\n{time_str} • {result['reel_path']}")
        return 0
    else:
        print(f"{gen.RED}✗{gen.RESET} Reel generation failed", file=sys.stderr)
        print(f"Error: {result['error']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
