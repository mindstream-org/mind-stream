"""
MindStream Reel Generator
Pipeline: Script (Gemini JSON) → Videos (Pexels/Pixabay/Coverr) → TTS (MiMo Dean) → Subtitles (Gemini) → Composite (MoviePy)
"""

import os
import re
import json
import asyncio
import requests
import base64
import warnings
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

try:
    from google import genai
    from moviepy import (
        VideoFileClip, AudioFileClip, CompositeAudioClip,
        concatenate_videoclips, afx, TextClip, CompositeVideoClip,
    )
    from moviepy.video.tools.subtitles import SubtitlesClip
    from tqdm import tqdm
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install google-generativeai moviepy python-dotenv tqdm")
    exit(1)

# Suppress MoviePy warnings about frame reading issues
warnings.filterwarnings('ignore', message='.*bytes wanted but 0 bytes read.*')
warnings.filterwarnings('ignore', category=UserWarning, module='moviepy')

# Load environment variables from .env file
load_dotenv()


# ---------------------------------------------------------------------------
# Font discovery — prefer Roboto, fallback to other sans-serif fonts
# ---------------------------------------------------------------------------
_FONT_CANDIDATES = [
    "/usr/share/fonts/google-roboto/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/roboto/Roboto-Bold.ttf",
    "/usr/share/fonts/google-carlito-fonts/Carlito-Bold.ttf",
    "/usr/share/fonts/liberation-fonts/LiberationSans-Bold.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]

def _find_font() -> str:
    for path in _FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    return "Arial"  # MoviePy system fallback


FONT_PATH = _find_font()


class ReelGenerator:
    """Complete reel generation pipeline with multi-source video search and ambient audio."""

    def __init__(self, gemini_key: str = None, pexels_key: str = None, 
                 pixabay_key: str = None, coverr_key: str = None, mimo_key: str = None):
        # Load API keys from environment or parameters
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.pexels_key = pexels_key or os.getenv("PEXELS_API_KEY")
        self.pixabay_key = pixabay_key or os.getenv("PIXABAY_API_KEY")  # Optional
        self.coverr_key = coverr_key or os.getenv("COVERR_API_KEY")  # Optional
        self.mimo_key = mimo_key or os.getenv("MIMO_API_KEY") or "sk-s2v2izgvyp8htvq654ogi2bfph91vzvhyr45pti7wmowp81x"

        if not self.gemini_key:
            raise ValueError("GEMINI_API_KEY is required — set it in .env or pass as parameter")
        if not self.pexels_key:
            raise ValueError("PEXELS_API_KEY is required — get a free key at https://www.pexels.com/api/")

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

        print(f"Generating script for emotion: {emotion}")

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

        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        raw = response.text.strip()

        # Strip markdown fences if Gemini ignores the instruction
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw.strip())
        raw = raw.strip()

        data = json.loads(raw)

        if "script" not in data or "subtitles" not in data:
            raise ValueError(f"Gemini JSON missing required keys. Got: {list(data.keys())}")

        script    = data["script"].strip()
        subtitles = [p.strip() for p in data["subtitles"] if p.strip()]

        if not script:
            raise ValueError("Gemini returned an empty script.")
        if not subtitles:
            raise ValueError("Gemini returned no subtitle phrases.")

        print(f"Script generated ({len(subtitles)} subtitle phrases)")
        return {"script": script, "subtitles": subtitles}

    # -----------------------------------------------------------------------
    # Step 2 — Video keyword extraction
    # -----------------------------------------------------------------------

    def extract_video_keywords(self, script: str, emotion: str) -> List[str]:
        """Extract 3-5 cinematic/moody video search terms from the script."""
        print("Extracting video keywords...")
        
        prompt = f"""From this mindfulness script about the emotion "{emotion}", extract 3-5 search terms to find matching stock video footage.

Script:
{script}

The video aesthetic must feel: deep, cinematic, moody, trustworthy, grounding — NOT bright, cheerful, or stock-photo generic.
Use low-light, dusk, mist, shadows, slow motion, nature, water, fire, sky, or architectural calm as visual themes.

Return ONLY a JSON array of 3-5 strings, e.g.:
["misty forest at dusk", "soft rain on a window", "dark ocean waves at night", "candle flame slow motion"]

No explanation, no markdown — just the raw JSON array."""

        try:
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            text = response.text.strip()
            text = text.replace("```json", "").replace("```", "").strip()
            keywords = json.loads(text)
            if isinstance(keywords, list) and keywords:
                return keywords[:5]
        except Exception as e:
            print(f"Keyword extraction failed ({e})")
            # If Gemini fails, the video search will simply fail gracefully
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
        
        print(f"Downloading videos for {len(keywords)} keywords...")
        
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
        
        # Download videos in parallel
        paths = []
        with ThreadPoolExecutor(max_workers=min(4, len(keywords))) as executor:
            futures = {
                executor.submit(download_single_keyword, i, kw): (i, kw) 
                for i, kw in enumerate(keywords)
            }
            
            # Show progress bar with sleek styling
            with tqdm(
                total=len(keywords), 
                desc="Downloading videos",
                unit="clip",
                bar_format='{desc}: {percentage:3.0f}%|{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]',
                ncols=100,
                colour='cyan'
            ) as pbar:
                for future in as_completed(futures):
                    i, kw = futures[future]
                    try:
                        result = future.result()
                        if result:
                            paths.append(result)
                    except Exception as e:
                        pass
                    pbar.update(1)

        # Sort paths by clip number to maintain order
        paths.sort(key=lambda p: int(re.search(r'clip_(\d+)', p).group(1)) if 'clip_' in p else 999)
        
        if not paths:
            print("No videos could be downloaded from any source")
            return []
        
        print(f"Downloaded {len(paths)} videos")
        return paths

    # -----------------------------------------------------------------------
    # Step 4 — TTS via Xiaomi MiMo API (Dean voice)
    # -----------------------------------------------------------------------

    async def _generate_tts_async(self, script: str, output_path: str) -> str:
        loop = asyncio.get_event_loop()
        
        print("Generating TTS audio (MiMo Dean)...")
        
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
        print(f"TTS audio generated")
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
        Distribute audio_duration across subtitle phrases using word count
        as a proxy for spoken duration, with pause-weights for sentence endings.
        """
        if not subtitles:
            return ""

        PAUSE_BONUS = 0.15   # extra fraction added to pausing phrases

        # Compute raw word-count weights, boosted at sentence boundaries
        weights = []
        for phrase in subtitles:
            w = self._word_count(phrase)
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

    def _make_textclip(self, txt: str) -> TextClip:
        """Create styled subtitle text clip."""
        return TextClip(
            text=txt.upper(),
            font=FONT_PATH,
            font_size=50,  # Reduced from 80 to match original project
            color="#FFFF00",  # Yellow
            stroke_color="#000000",
            stroke_width=2,
            size=(960, None),
            method="caption",
        )

    def _overlay_subtitles(self, video_clip, srt_path: str):
        """Overlay SRT subtitles near the bottom of the frame."""
        try:
            subs = SubtitlesClip(srt_path, make_textclip=self._make_textclip)
            subs = subs.with_position(("center", 1750))  # Moved lower for better placement
            return CompositeVideoClip([video_clip, subs])
        except Exception as e:
            print(f"Subtitle overlay failed: {e}")
            return video_clip

    def _resize_to_portrait(self, clip: VideoFileClip) -> VideoFileClip:
        """Crop + resize to exactly 1080×1920 (9:16)."""
        w, h = clip.size
        target_ratio = 9 / 16
        if (w / h) > target_ratio:
            clip = clip.cropped(x_center=w / 2, width=int(h * target_ratio), height=h)
        else:
            clip = clip.cropped(y_center=h / 2, width=w, height=int(w / target_ratio))
        return clip.resized((1080, 1920))

    def composite_reel(
        self,
        video_paths: List[str],
        tts_path: str,
        output_path: str,
        subtitle_list: List[str],
        ambient_path: Optional[str] = None,
    ) -> str:
        print("Compositing final reel...")

        tts_audio = AudioFileClip(tts_path)
        duration  = tts_audio.duration

        # --- Video clips ---
        time_per_clip = duration / len(video_paths)
        clips = []
        
        print("Processing video clips...")
        with tqdm(
            total=len(video_paths), 
            desc="Processing clips",
            unit="clip",
            bar_format='{desc}: {percentage:3.0f}%|{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]',
            ncols=100,
            colour='green'
        ) as pbar:
            for i, path in enumerate(video_paths):
                c = VideoFileClip(path)
                c = self._resize_to_portrait(c)
                c = c.subclipped(0, min(c.duration, time_per_clip))
                c = c.with_duration(time_per_clip).with_fps(30)
                clips.append(c)
                pbar.update(1)

        video = concatenate_videoclips(clips, method="compose").with_duration(duration)

        # --- Audio (TTS + ambient) ---
        if ambient_path and os.path.exists(ambient_path):
            amb = AudioFileClip(ambient_path)
            if amb.duration < duration:
                amb = amb.with_effects([afx.AudioLoop(duration=duration)])
            else:
                amb = amb.subclipped(0, duration)
            amb   = amb.with_volume_scaled(0.12)  # 12% volume
            audio = CompositeAudioClip([tts_audio, amb])
            print("Ambient audio added")
        else:
            audio = tts_audio

        video = video.with_audio(audio)

        # --- Subtitles ---
        print("Adding subtitles...")
        srt_content = self.build_srt(subtitle_list, duration)
        srt_path    = tts_path.replace(".mp3", ".srt")
        with open(srt_path, "w", encoding="utf-8") as fh:
            fh.write(srt_content)
        video = self._overlay_subtitles(video, srt_path)

        # --- Export with progress indication ---
        print("Exporting final video (this may take a few minutes)...")
        
        # Use tqdm to show progress during export
        with tqdm(
            total=100,
            desc="Encoding video",
            unit="%",
            bar_format='{desc}: {percentage:3.0f}%|{bar}| [{elapsed}<{remaining}]',
            ncols=100,
            colour='magenta'
        ) as pbar:
            # We'll use a custom logger to track ffmpeg progress
            def progress_callback(t):
                if duration > 0:
                    progress = min(100, int((t / duration) * 100))
                    pbar.n = progress
                    pbar.refresh()
            
            video.write_videofile(
                output_path,
                fps=30,
                codec="libx264",
                audio_codec="aac",
                preset="ultrafast",
                threads=4,
                logger=None,  # Suppress MoviePy's verbose ffmpeg logs
            )
            pbar.n = 100
            pbar.refresh()

        # Cleanup
        tts_audio.close()
        for c in clips:
            c.close()
        video.close()

        print(f"Reel complete: {output_path}")
        return output_path

    # -----------------------------------------------------------------------
    # Main pipeline
    # -----------------------------------------------------------------------

    def generate_reel(self, job_id: str, emotion: str, context: Dict[str, Any]) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "success": False,
            "job_id": job_id,
            "reel_path": None,
            "script": None,
            "keywords": None,
            "error": None,
        }

        try:
            print(f"\nMINDSTREAM REEL — Job {job_id}")
            print(f"Emotion: {emotion} | User: {context.get('user_name', 'User')}\n")

            # 1. Script + subtitles
            print("[1/5] Generating script...")
            script_data   = self.generate_script(emotion, context)
            script        = script_data["script"]
            subtitle_list = script_data["subtitles"]
            result["script"] = script

            # 2. Video keywords
            print("\n[2/5] Extracting video keywords...")
            keywords          = self.extract_video_keywords(script, emotion)
            result["keywords"] = keywords
            if not keywords:
                raise RuntimeError("Could not extract video keywords from script")
            print(f"Keywords: {', '.join(keywords)}")

            # 3. Download videos
            print("\n[3/5] Downloading videos...")
            video_paths = self.download_videos_for_script(keywords, job_id)
            if not video_paths:
                raise RuntimeError("No videos could be downloaded")

            # 4. TTS
            print("\n[4/5] Generating TTS audio...")
            tts_path = os.path.join(self.output_dir, "audio", f"{job_id}.mp3")
            self.generate_tts(script, tts_path)

            # 5. Composite
            print("\n[5/5] Compositing reel...")
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

            print(f"\nCOMPLETE\n")

        except Exception as exc:
            result["error"] = str(exc)
            print(f"\nGeneration failed: {exc}")
            import traceback
            traceback.print_exc()

        return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> int:
    import sys
    import argparse

    parser = argparse.ArgumentParser(description="MindStream Reel Generator")
    parser.add_argument("--job-id",   required=False, help="Job ID")
    parser.add_argument("--emotion",  required=False, help="Emotion label")
    parser.add_argument("--context",  required=False, help="Context JSON string")
    args = parser.parse_args()

    gen = ReelGenerator()

    if args.job_id and args.emotion and args.context:
        try:
            ctx = json.loads(args.context)
        except json.JSONDecodeError as e:
            print(f"Invalid --context JSON: {e}", file=sys.stderr)
            return 1
        result = gen.generate_reel(job_id=args.job_id, emotion=args.emotion, context=ctx)
    else:
        sample = "data/sample_emotion_result.json"
        if not os.path.exists(sample):
            print(f"Sample file not found: {sample}", file=sys.stderr)
            return 1
        with open(sample) as fh:
            data = json.load(fh)
        result = gen.generate_reel(
            job_id=data["job_id"],
            emotion=data["emotion"]["label"],
            context=data["context"],
        )

    if result["success"]:
        print(f"\nReel saved to: {result['reel_path']}")
        return 0
    else:
        print(f"\nFailed: {result['error']}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
