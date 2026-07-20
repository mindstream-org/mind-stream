"""
MindStream Reel Generator (MovieLite Edition - 4x faster)
Pipeline: Script (Gemini JSON) → Videos (Pexels/Pixabay/Coverr) → TTS (MiMo Dean) → Subtitles (Manual) → Composite (MovieLite)
"""

# Suppress tqdm progress bars from MovieLite (must be before imports)
import os
os.environ['TQDM_DISABLE'] = '1'

import re
import json
import asyncio
import requests
import base64
import sys
import time
import threading
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

# Suppress third-party warnings for cleaner CLI output
import warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', message='.*FontNotFoundWarning.*')
warnings.filterwarnings('ignore', message='.*fontconfig.*')
warnings.filterwarnings('ignore', message='.*resource_tracker.*')
import logging
logging.getLogger('movielite').setLevel(logging.CRITICAL)  # Even more aggressive
# Suppress all logs from movielite module
logging.getLogger('movielite').propagate = False

# Redirect stderr temporarily to suppress font warnings
import contextlib
import subprocess

@contextlib.contextmanager
def suppress_stderr():
    """Context manager to temporarily suppress stderr output."""
    import sys
    import os
    stderr_fd = sys.stderr.fileno()
    old_stderr = os.dup(stderr_fd)
    devnull = os.open(os.devnull, os.O_WRONLY)
    try:
        os.dup2(devnull, stderr_fd)
        yield
    finally:
        os.dup2(old_stderr, stderr_fd)
        os.close(devnull)
        os.close(old_stderr)

# Suppress MovieLite INFO logs (only show errors)
import logging
logging.getLogger('movielite').setLevel(logging.ERROR)

# Load environment variables from .env file
load_dotenv()


class ReelGenerator:
    """Complete reel generation pipeline with multi-source video search and ambient audio."""

    def __init__(self, gemini_key: str = None, pexels_key: str = None, 
                 pixabay_key: str = None, coverr_key: str = None, mimo_key: str = None):
        # Load API keys from environment
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.pexels_key = pexels_key or os.getenv("PEXELS_API_KEY")
        self.pixabay_key = pixabay_key or os.getenv("PIXABAY_API_KEY")
        self.coverr_key = coverr_key or os.getenv("COVERR_API_KEY")
        self.mimo_key = mimo_key or os.getenv("MIMO_API_KEY")

        # Script model provider selection
        self.script_provider = os.getenv("SCRIPT_MODEL_PROVIDER", "gemini").lower()
        self.script_model = os.getenv("SCRIPT_MODEL_NAME", "gemini-2.0-flash-exp")

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
        
        # Ambient audio mapping (placeholder files - replace with real audio later)
        self.ambient_music = {
            "frustrated": "assets/audio/frustrated.mp3",  # Dark ambient, subtle rain
            "fatigued":   "assets/audio/fatigued.mp3",    # Soft piano, gentle pads
            "distracted": "assets/audio/distracted.mp3",  # Calm waves, subtle wind
            "anxious":    "assets/audio/anxious.mp3",     # Breathing sounds, soft hum
            "neutral":    "assets/audio/neutral.mp3",     # White noise, minimal drone
        }

    # -----------------------------------------------------------------------
    # Step 1 — Script generation
    # -----------------------------------------------------------------------

    def generate_script(self, emotion: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ask Gemini to return a JSON object with:
          - "script": full spoken text (sent verbatim to TTS)
          - "subtitles": list of short phrases (4-6 words each) that together
                         cover the whole script in order
        """
        activity          = context.get("active_tab_category", "browsing")
        time_of_day       = context.get("time_of_day", "the day")
        duration          = context.get("session_duration_minutes", 0)
        idle_time         = context.get("idle_minutes_since_last_activity", 0)
        user_name         = context.get("user_name", "friend")
        local_weather     = context.get("local_weather", "calm")

        # Build activity description more generically
        activity_desc = activity
        if duration > 60:
            activity_desc += f" for a while"
        elif duration > 30:
            activity_desc += f" for some time"

        prompt = f"""You are a wise, warm elder — like a grandfather — speaking directly to {user_name} who is currently feeling {emotion}.

Generate a deeply personal, grounding spoken reflection that is 45-60 seconds long when read aloud slowly.

DO NOT use corporate wellness language, coaching platitudes, or generic mindfulness scripts.
Speak with real intimacy, as if you know this person and genuinely care.

Context you must weave in naturally:
- Their name: {user_name}
- What they've been doing: {activity_desc} on their computer
- How long: about {duration} minutes
- Time of day: {time_of_day}
- Weather outside right now: {local_weather}
- Their emotional state: {emotion}

Writing guidelines (follow all of them):
1. Open by gently saying their name and acknowledging the pattern of their attention — not a specific tab or website, but the quality of how they've been engaging (pulled in, distracted, focused, etc.)
2. Use one vivid nature metaphor (river, cloud, tree, candle, tide, light) that mirrors their emotional state
3. Acknowledge the universal human quality of getting caught in digital loops — validate it without shame
4. Give ONE simple physical anchor they can do right now (e.g. "feel the weight of your feet on the floor", "place a palm on your chest", "let your eyes rest on something distant")
5. End with a gentle permission — to rest, to be imperfect, to simply exist for a moment

DO NOT:
- Mention specific websites, domains, or tab titles
- Be prescriptive about what they "should" do
- Use coaching or corporate language
- List multiple steps or actions

You MUST respond with ONLY a valid JSON object, nothing else — no markdown fences, no explanation:
{{
  "script": "<the complete spoken text as one continuous string, punctuated for natural speech>",
  "subtitles": [
    "<phrase 1 — 4 to 6 words>",
    "<phrase 2 — 4 to 6 words>",
    "..."
  ]
}}

The subtitles array must contain the ENTIRE script broken into SHORT consecutive phrases of 4-6 words each, in order.
Every word in the script must appear in exactly one subtitle phrase.
Do not truncate, summarise, or skip any part of the script."""

        # Call the appropriate LLM based on provider
        if self.script_provider == "groq":
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.groq_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.script_model,
                    "messages": [
                        {"role": "system", "content": "You are a wise, warm elder who creates mindfulness scripts in JSON format."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.8,
                    "response_format": {"type": "json_object"}
                },
                timeout=30
            )
            response.raise_for_status()
            raw = response.json()["choices"][0]["message"]["content"]
        else:
            response = self.client.models.generate_content(
                model=self.script_model,
                contents=prompt,
                config={"temperature": 0.9}
            )
            raw = response.text.strip()
            # Strip markdown fences if the model ignores the instruction
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw.strip())
            raw = raw.strip()

        data = json.loads(raw)

        if "script" not in data or "subtitles" not in data:
            raise ValueError(f"LLM JSON missing required keys. Got: {list(data.keys())}")

        script    = data["script"].strip()
        subtitles = [p.strip() for p in data["subtitles"] if p.strip()]

        if not script:
            raise ValueError("LLM returned an empty script.")
        if not subtitles:
            raise ValueError("LLM returned no subtitle phrases.")

        return {"script": script, "subtitles": subtitles}

    # -----------------------------------------------------------------------
    # Step 2 — Video keyword extraction
    # -----------------------------------------------------------------------

    def extract_video_keywords(self, script: str, emotion: str) -> List[str]:
        """Extract 3-5 cinematic/moody video search terms from the script."""
        
        prompt = f"""From this mindfulness script about the emotion "{emotion}", extract 3-5 search terms to find matching stock video footage.

Script:
{script}

The video aesthetic must feel: deep, cinematic, moody, trustworthy, grounding — NOT bright, cheerful, or stock-photo generic.
Use low-light, dusk, mist, shadows, slow motion, nature, water, fire, sky, or architectural calm as visual themes.

Return ONLY a JSON array of 3-5 strings, e.g.:
["misty forest at dusk", "soft rain on a window", "dark ocean waves at night", "candle flame slow motion"]

No explanation, no markdown — just the raw JSON array."""

        try:
            if self.script_provider == "groq":
                response = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.groq_key}", "Content-Type": "application/json"},
                    json={
                        "model": self.script_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.7
                    },
                    timeout=20
                )
                response.raise_for_status()
                text = response.json()["choices"][0]["message"]["content"]
            else:
                response = self.client.models.generate_content(
                    model=self.script_model,
                    contents=prompt,
                    config={"temperature": 0.9}
                )
                text = response.text.strip()
            
            text = text.replace("```json", "").replace("```", "").strip()
            keywords = json.loads(text)
            if isinstance(keywords, list) and keywords:
                return keywords[:5]
        except Exception as e:
            print(f"Keyword extraction failed ({e})")
            return []

        return []

    # -----------------------------------------------------------------------
    # Step 3 — Multi-source video search + download
    # -----------------------------------------------------------------------

    def search_pexels_videos(self, keyword: str, orientation: str = "portrait") -> Optional[str]:
        """Search Pexels and return a direct download URL for the best match."""
        try:
            resp = requests.get(
                "https://api.pexels.com/videos/search",
                headers={"Authorization": self.pexels_key},
                params={"query": keyword, "orientation": orientation, "size": "medium", "per_page": 20},
                timeout=10,
            )
            resp.raise_for_status()
            videos = resp.json().get("videos", [])
            
            if not videos:
                return None

            # Prefer HD (height >= 1080) portrait files
            for video in videos:
                for f in sorted(video.get("video_files", []), key=lambda x: x.get("height", 0), reverse=True):
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
            resp = requests.get(
                "https://pixabay.com/api/videos/",
                params={
                    "key": self.pixabay_key,
                    "q": keyword,
                    "video_type": "all",
                    "per_page": 20
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
            resp = requests.get(
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
            r = requests.get(url, stream=True, timeout=60)
            r.raise_for_status()
            
            with open(dest, "wb") as fh:
                for chunk in r.iter_content(chunk_size=65536):
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
            print("No keywords extracted — cannot download videos")
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
        
        with ThreadPoolExecutor(max_workers=min(4, len(keywords))) as executor:
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
                bar = '━' * filled + ' ' * (width - filled)
                color = self.CYAN if completed < total else self.GREEN
                # Format exactly like _progress_bar_dnf with green checkmark prefix
                desc = f"{'Downloading footage':<26}"
                if completed >= total:
                    # Final line with green checkmark
                    print(f"\r{self.GREEN}✓{self.RESET} {desc}{color}{pct:3d}% |{bar}| {completed}/{total}{self.RESET}", end='', flush=True)
                else:
                    # In-progress with spinner (updates per item)
                    spinner_char = self.BRAILLE_CHARS[completed % len(self.BRAILLE_CHARS)]
                    print(f"\r{self.CYAN}{spinner_char}{self.RESET} {desc}{color}{pct:3d}% |{bar}| {completed}/{total}{self.RESET}", end='', flush=True)
        
        print()  # newline after progress
        # Sort paths by clip number to maintain order
        paths.sort(key=lambda p: int(re.search(r'clip_(\d+)', p).group(1)) if 'clip_' in p else 999)
        
        if not paths:
            print("No videos could be downloaded from any source")
            return []
        
        return paths

    # -----------------------------------------------------------------------
    # Step 4 — TTS via Xiaomi MiMo API (Dean voice)
    # -----------------------------------------------------------------------

    async def _generate_tts_async(self, script: str, output_path: str) -> str:
        loop = asyncio.get_event_loop()
        
        
        response = await loop.run_in_executor(
            None,
            lambda: requests.post(
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

    # -----------------------------------------------------------------------
    # Step 5 — Subtitle SRT generation (Gemini-based, proportional timing)
    # -----------------------------------------------------------------------

    @staticmethod
    def _srt_ts(seconds: float) -> str:
        """Convert float seconds → SRT timestamp string HH:MM:SS,mmm."""
        ms = max(0, int(round(seconds * 1000)))
        h  = ms // 3_600_000;  ms %= 3_600_000
        m  = ms // 60_000;     ms %= 60_000
        s  = ms // 1_000;      ms %= 1_000
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

        PAUSE_BONUS = 0.20   # Add 20% extra time for phrases ending with punctuation
        
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
        available    = audio_duration

        lines   = []
        cursor  = 0.0

        for idx, (phrase, weight) in enumerate(zip(subtitles, weights), start=1):
            phrase_dur = available * (weight / total_weight)
            start      = cursor
            end        = cursor + phrase_dur
            cursor     = end

            lines.append(str(idx))
            lines.append(f"{self._srt_ts(start)} --> {self._srt_ts(end)}")
            lines.append(phrase)
            lines.append("")

        return "\n".join(lines)

    # -----------------------------------------------------------------------
    # Step 6 — Video Compositing
    # -----------------------------------------------------------------------

    # -----------------------------------------------------------------------
    # Step 6 — SRT Parser (Manual subtitle handling for MovieLite)
    # -----------------------------------------------------------------------

    @staticmethod
    def parse_srt(srt_path: str) -> List[Tuple[float, float, str]]:
        """
        Parse SRT file and return list of (start_time, end_time, text) tuples.
        Times are in seconds (float).
        """
        with open(srt_path, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        
        # Split by double newlines (subtitle blocks)
        blocks = re.split(r'\n\n+', content)
        subtitles = []
        
        for block in blocks:
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue
            
            # Line 0: sequence number (ignore)
            # Line 1: timestamp (00:00:01,234 --> 00:00:03,456)
            # Line 2+: subtitle text
            
            timestamp_line = lines[1]
            match = re.match(r'(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})', timestamp_line)
            if not match:
                continue
            
            # Parse start time
            h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, match.groups())
            start_time = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0
            end_time = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0
            
            # Join remaining lines as text
            text = ' '.join(lines[2:])
            
            subtitles.append((start_time, end_time, text))
        
        return subtitles

    def _create_subtitle_canvas(self) -> Canvas:
        """Create styled canvas for subtitle text (MovieLite/pictex) with text wrapping."""
        return (
            Canvas()
            .font_family("Poppins")
            .font_size(50)
            .color("#FFFF00")  # Yellow
            .text_shadows(Shadow(offset=(2, 2), blur_radius=3, color="black"))
            .size(1080, None)  # Full video width (1080px) - text_align center will center it
            .padding(20)  # 20px padding for safety
            .text_align("center")  # Center-align text within the full-width canvas
        )

    def _resize_to_portrait(self, clip: ml.VideoClip) -> ml.VideoClip:
        """
        Resize to exactly 1080×1920 (9:16) using MovieLite.
        MovieLite's set_size() maintains aspect ratio and crops/pads automatically.
        """
        # MovieLite's set_size will resize maintaining aspect ratio
        # If the source aspect ratio doesn't match, it will crop center
        clip.set_size(width=1080, height=1920)
        return clip

    def composite_reel(
        self,
        video_paths: List[str],
        tts_path: str,
        output_path: str,
        subtitle_list: List[str],
        ambient_path: Optional[str] = None,
    ) -> str:
        """
        Composite reel using MovieLite (4x faster than MoviePy).
        Concatenates video clips, mixes audio, and overlays subtitles.
        """
        # Get TTS audio duration to determine video length
        tts_audio = ml.AudioClip(tts_path)
        duration = tts_audio.duration
        
        # --- Phase 1: Process video clips with smooth playback optimization ---
        time_per_clip = duration / len(video_paths)
        processed_clips = []
        current_time = 0.0  # Track cumulative time to avoid gaps
        
        TARGET_FPS = 30  # Standardize all clips to 30fps for smooth playback
        
        for i, path in enumerate(video_paths):
            clip = ml.VideoClip(path)
            
            # CRITICAL FIX 1: Resize BEFORE setting duration/fps to avoid frame inconsistencies
            clip = self._resize_to_portrait(clip)
            
            # CRITICAL FIX 2: Get the actual source FPS and standardize to TARGET_FPS
            # This prevents jitter from FPS mismatches between clips
            source_fps = getattr(clip, 'fps', 30)
            
            # CRITICAL FIX 3: If clip is too short, use looping instead of freezing last frame
            # This creates smoother transitions
            if clip.duration < time_per_clip:
                clip.loop(True)  # Enable looping for short clips
            
            # CRITICAL FIX 4: Set exact duration to prevent gaps/overlaps
            clip.set_duration(time_per_clip)
            clip.set_start(current_time)
            
            # Move to next clip's start time
            current_time += time_per_clip
            
            processed_clips.append(clip)
        
        print(f"{self.GREEN}✓{self.RESET} Processing video clips")
        
        # --- Phase 2: Setup audio ---
        print(f"{self.GREEN}✓{self.RESET} Synchronizing audio")
        
        # Add TTS audio
        tts_audio.set_start(0)
        
        # Add ambient audio if provided
        audio_clips = [tts_audio]
        if ambient_path and os.path.exists(ambient_path):
            ambient_audio = ml.AudioClip(ambient_path, start=0, volume=0.12)
            ambient_audio.set_duration(duration)
            ambient_audio.loop(True)  # Loop if shorter than TTS
            audio_clips.append(ambient_audio)
        
        # --- Phase 3: Generate and parse subtitles ---
        srt_content = self.build_srt(subtitle_list, duration)
        srt_path = tts_path.replace(".mp3", ".srt")
        with open(srt_path, "w", encoding="utf-8") as fh:
            fh.write(srt_content)
        
        # Parse SRT and create TextClip for each subtitle
        subtitle_clips = []
        # Suppress fontconfig warnings when creating canvas
        with suppress_stderr():
            canvas = self._create_subtitle_canvas()
        
        for start_time, end_time, text in self.parse_srt(srt_path):
            # Advance subtitles by 0.2 seconds to appear slightly earlier than audio
            # This compensates for reading time and feels more natural
            adjusted_start = max(0, start_time - 0.2)
            adjusted_end = max(adjusted_start + 0.1, end_time - 0.2)  # Ensure min 0.1s duration
            
            text_clip = ml.TextClip(
                text,
                start=adjusted_start,  # Adjusted time for better sync
                duration=adjusted_end - adjusted_start,
                canvas=canvas
            )
            
            # Position subtitles:
            # Canvas is now full width (1080px), text_align="center" handles horizontal centering
            # Position at x=0 (left edge), y=1650 (moved up, gives ~270px from bottom)
            text_clip.set_position((0, 1650))
            subtitle_clips.append(text_clip)
        
        print(f"{self.GREEN}✓{self.RESET} Rendering {len(subtitle_clips)} subtitle segments\n")
        
        # --- Phase 5: Export ---
        self._print_step(5, 5, "Exporting final video")
        
        stop_spinner = False
        def spinner():
            idx = 0
            while not stop_spinner:
                sys.stdout.write(f'\r{self.BRAILLE_CHARS[idx % len(self.BRAILLE_CHARS)]} Exporting...')
                sys.stdout.flush()
                idx += 1
                time.sleep(0.1)
            sys.stdout.write('\r' + ' ' * 50 + '\r')
            sys.stdout.flush()
        
        spinner_thread = threading.Thread(target=spinner, daemon=True)
        spinner_thread.start()
        
        # Create writer with optimized settings for smooth playback
        # fps=30 ensures consistent frame rate across all clips
        # size=(1080, 1920) is standard 9:16 portrait
        writer = ml.VideoWriter(
            output_path, 
            fps=30,  # Fixed 30fps for smooth playback
            size=(1080, 1920),
            duration=duration  # Explicit duration prevents timing issues
        )
        
        # Add video clips (sequential concatenation)
        for clip in processed_clips:
            writer.add_clip(clip)
        
        # Add audio clips (mixed)
        for audio_clip in audio_clips:
            writer.add_clip(audio_clip)
        
        # Add subtitle clips (overlays)
        for sub_clip in subtitle_clips:
            writer.add_clip(sub_clip)
        
        # Patch tqdm to prevent MovieLite from showing progress bars
        try:
            import tqdm
            _original_tqdm = tqdm.tqdm
            _original_tqdm_gui = tqdm.tqdm_gui if hasattr(tqdm, 'tqdm_gui') else None
            # Replace tqdm with a no-op class
            class SilentTqdm:
                def __init__(self, *args, **kwargs):
                    self.iterable = kwargs.get('iterable', args[0] if args else None)
                def __iter__(self):
                    return iter(self.iterable) if self.iterable else iter([])
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
                def update(self, n=1):
                    pass
                def close(self):
                    pass
            tqdm.tqdm = SilentTqdm
            if hasattr(tqdm, 'tqdm_gui'):
                tqdm.tqdm_gui = SilentTqdm
        except ImportError:
            _original_tqdm = None
            _original_tqdm_gui = None
        
        # Write video with optimized settings for smooth playback
        # processes=4: Parallel rendering for speed
        # video_quality.HIGH: Better quality encoding (reduces artifacts)
        try:
            writer.write(processes=4, video_quality=ml.VideoQuality.HIGH)
        finally:
            # Restore original tqdm
            if _original_tqdm:
                tqdm.tqdm = _original_tqdm
                if _original_tqdm_gui and hasattr(tqdm, 'tqdm_gui'):
                    tqdm.tqdm_gui = _original_tqdm_gui
        
        stop_spinner = True
        spinner_thread.join(timeout=0.2)
        print(f"{self.GREEN}✓{self.RESET} Reel generated successfully")
        
        # Cleanup - MovieLite clips have close() method, but it's optional
        # They auto-cleanup when garbage collected
        try:
            for clip in processed_clips:
                if hasattr(clip, 'close'):
                    clip.close()
        except Exception:
            pass  # Ignore cleanup errors
        
        return output_path

    # -----------------------------------------------------------------------
    # Main pipeline
    # -----------------------------------------------------------------------

    # ANSI color codes
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    RESET = '\033[0m'

    # Braille spinner for multi-stage loading
    BRAILLE_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

    def _print_step(self, step: int, total: int, desc: str):
        """Print step header in DNF style."""
        # Separator line removed for cleaner output
        print(f"[{step}/{total}] {desc}")

    def _progress_bar_dnf(self, current: int, total: int, desc: str, color: str = '') -> str:
        """Generate DNF-style progress bar with proper vertical alignment."""
        width = 20
        percentage = (current / total * 100) if total > 0 else 0
        filled = int(width * current / total) if total > 0 else 0
        bar = '━' * filled + ' ' * (width - filled)
        return f"{desc:<25} {color}{percentage:3.0f}% |{bar}| {current}/{total}{self.RESET}"
    
    def generate_reel(self, job_id: str, emotion: str, context: Dict[str, Any], header: bool = True) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "success": False,
            "job_id": job_id,
            "reel_path": None,
            "script": None,
            "keywords": None,
            "error": None,
        }

        try:
            # Phase 1: Script generation
            self._print_step(1, 5, "Generating personalized script")
            print(f"Provider : Gemini ({self.script_model})")
            
            stop_spinner = False
            def spinner():
                idx = 0
                while not stop_spinner:
                    sys.stdout.write(f'\r{self.BRAILLE_CHARS[idx % len(self.BRAILLE_CHARS)]} Generating script...')
                    sys.stdout.flush()
                    idx += 1
                    time.sleep(0.1)
                sys.stdout.write('\r' + ' ' * 50 + '\r')
                sys.stdout.flush()
            
            spinner_thread = threading.Thread(target=spinner, daemon=True)
            spinner_thread.start()
            
            script_data   = self.generate_script(emotion, context)
            script        = script_data["script"]
            subtitle_list = script_data["subtitles"]
            result["script"] = script
            
            stop_spinner = True
            spinner_thread.join(timeout=0.2)
            desc = f"{'Script generated':<26}"
            print(f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET}\n")

            # Phase 2: Video search
            self._print_step(2, 5, "Finding supporting visuals")
            print(f"Provider : Pexels")
            
            stop_spinner = False
            spinner_thread = threading.Thread(target=spinner, daemon=True)
            spinner_thread.start()
            
            keywords = self.extract_video_keywords(script, emotion)
            result["keywords"] = keywords
            if not keywords:
                raise RuntimeError("Could not extract video keywords from script")
            
            stop_spinner = True
            spinner_thread.join(timeout=0.2)
            
            # Display keywords compactly (truncate long ones)
            def _truncate(kw, maxlen=20):
                return kw if len(kw) <= maxlen else kw[:maxlen-1] + "…"
            keywords_display = " • ".join(_truncate(kw) for kw in keywords[:4])
            print(f"Keywords : {keywords_display}")
            
            video_paths = self.download_videos_for_script(keywords, job_id)
            if not video_paths:
                raise RuntimeError("No videos could be downloaded")
            print()  # Blank line after phase

            # Phase 3: TTS generation
            self._print_step(3, 5, "Generating narration")
            print(f"Provider : MiMo (Dean)")
            
            stop_spinner = False
            spinner_thread = threading.Thread(target=spinner, daemon=True)
            spinner_thread.start()
            
            tts_path = os.path.join(self.output_dir, "audio", f"{job_id}.mp3")
            self.generate_tts(script, tts_path)
            
            stop_spinner = True
            spinner_thread.join(timeout=0.2)
            
            # Calculate audio duration for display
            try:
                audio = ml.AudioClip(tts_path)
                duration = int(audio.duration)
                audio.close()
                desc = f"{'Narration generated':<26}"
                print(f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET} ({duration}s)\n")
            except:
                desc = f"{'Narration generated':<26}"
                print(f"{self.GREEN}✓{self.RESET} {desc}{self.GREEN}100% |{'━' * 20}| 1/1{self.RESET}\n")

            # Phase 4: Timeline preparation
            self._print_step(4, 5, "Preparing final composition")
            reel_path    = os.path.join(self.output_dir, "reels", f"{job_id}.mp4")
            ambient_path = self.ambient_music.get(emotion, self.ambient_music.get("neutral"))
            self.composite_reel(
                video_paths=video_paths,
                tts_path=tts_path,
                output_path=reel_path,
                subtitle_list=subtitle_list,
                ambient_path=ambient_path,
            )

            result["reel_path"] = reel_path
            result["success"]   = True

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


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    import sys
    import argparse

    print("MindStream — Phase 3: Reel Generation\n")
    print("Checking environment...")

    parser = argparse.ArgumentParser(description="MindStream Reel Generator")
    parser.add_argument("--job-id",   required=False, help="Job ID")
    parser.add_argument("--emotion",  required=False, help="Emotion label")
    parser.add_argument("--context",  required=False, help="Context JSON string")
    args = parser.parse_args()

    try:
        gen = ReelGenerator()
        print(f"{gen.GREEN}✓{gen.RESET} Environment ready\n")
    except ValueError as e:
        print(f"{gen.RED}✗{gen.RESET} Environment check failed\n")
        print(f"Error: {e}", file=sys.stderr)
        return 1

    start_time = time.time()

    if args.job_id and args.emotion and args.context:
        try:
            ctx = json.loads(args.context)
        except json.JSONDecodeError as e:
            print(f"Invalid --context JSON: {e}", file=sys.stderr)
            return 1
        print(f"Job   : {args.job_id} | {args.emotion.title()} | {ctx.get('user_name', 'User')}\n")
        result = gen.generate_reel(job_id=args.job_id, emotion=args.emotion, context=ctx, header=False)
    else:
        sample = "data/sample_emotion_result.json"
        if not os.path.exists(sample):
            print(f"Sample file not found: {sample}", file=sys.stderr)
            return 1
        print(f"Input : {sample}")
        with open(sample) as fh:
            data = json.load(fh)
        print(f"Job   : {data['job_id']} | {data['emotion']['label'].title()} | {data['context'].get('user_name', 'User')}\n")
        result = gen.generate_reel(
            job_id=data["job_id"],
            emotion=data["emotion"]["label"],
            context=data["context"],
            header=False
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
    import sys
    sys.exit(main())