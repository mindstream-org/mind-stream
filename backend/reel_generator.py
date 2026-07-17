"""
MindStream Reel Generator - Dynamic Video Approach
Generates unique reels by searching & downloading videos from Pexels based on script keywords.
"""

import os
import json
import asyncio
import requests
from uuid import uuid4
from typing import List, Dict, Any, Optional

try:
    from google import genai
    import edge_tts
    from moviepy import VideoFileClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips, afx
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install google-generativeai edge-tts moviepy")
    exit(1)


class ReelGenerator:
    """Complete reel generation pipeline with dynamic video search."""
    
    def __init__(self, gemini_key: str = None, pexels_key: str = None):
        """
        Initialize generator with API keys.
        
        Args:
            gemini_key: Gemini API key (or reads from GEMINI_API_KEY env)
            pexels_key: Pexels API key (or reads from PEXELS_API_KEY env)
        """
        self.gemini_key = gemini_key or os.getenv("GEMINI_API_KEY")
        self.pexels_key = pexels_key or os.getenv("PEXELS_API_KEY")
        
        if not self.gemini_key:
            raise ValueError("GEMINI_API_KEY required")
        if not self.pexels_key:
            raise ValueError("PEXELS_API_KEY required. Get free key at: https://www.pexels.com/api/")
        
        self.client = genai.Client(api_key=self.gemini_key)
        self.model = self.client.models
        
        # Output directories
        self.output_dir = "output"
        self.temp_dir = os.path.join(self.output_dir, "temp")
        os.makedirs(os.path.join(self.output_dir, "audio"), exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "reels"), exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)
        
        # Default ambient music (pre-downloaded, emotion-specific)
        self.ambient_music = {
            "frustrated": "assets/audio/frustrated.mp3",
            "fatigued": "assets/audio/fatigued.mp3",
            "distracted": "assets/audio/distracted.mp3",
            "anxious": "assets/audio/anxious.mp3",
            "neutral": "assets/audio/neutral.mp3",
        }
    
    def generate_script(self, emotion: str, context: Dict[str, Any]) -> str:
        """Generate deep philosophical script."""
        activity = context.get("active_tab_category", "browsing")
        time = context.get("time_of_day", "now")
        duration = context.get("session_duration_minutes", 0)
        
        prompt = f"""You are a wise elder speaking to someone feeling {emotion}.
They've been {activity} for {duration} minutes during {time}.

Write a 45-60 second spoken reflection that:
1. Acknowledges the emotion deeply (use metaphor, nature)
2. Connects to universal human experience
3. Gives a grounding physical action
4. Ends with permission to be human

Voice: Slow, contemplative, like a grandfather. NO corporate wellness language.

Return ONLY the script."""

        try:
            response = self.model.generate_content(
                model='gemini-1.5-flash',
                contents=prompt
            )
            # Handle both old and new API response formats
            if hasattr(response, 'text'):
                script = response.text.strip().replace('"', '')
            elif hasattr(response, 'candidates') and response.candidates:
                script = response.candidates[0].content.parts[0].text.strip().replace('"', '')
            return script if len(script) > 100 else self._fallback_script(emotion)
        except:
            return self._fallback_script(emotion)
    
    def _fallback_script(self, emotion: str) -> str:
        """Fallback scripts if Gemini fails."""
        scripts = {
            "frustrated": "There's a heaviness settling in. That particular kind of frustration that comes from wanting things to be different. You've been here a while. Somewhere inside, you know. This isn't giving you what you need. Stand up. Walk to the window. Feel your feet on the ground. The frustration will pass, like weather. This moment - this choice to step away - this is yours.",
            "fatigued": "Exhaustion has its own language. Not just tiredness, but something deeper. Your body's been trying to tell you something. It's okay to be tired. Our ancestors knew rest as sacred. Close what you're doing. Stand up slowly. Walk somewhere else. You don't have to fight the tiredness. Just be tired for a moment.",
            "distracted": "Your attention is scattered like leaves in wind. Tab after tab, seeking something you can't name. This is the modern condition. But underneath, there's still you. Whole. Capable of choosing where your gaze falls. Close everything but one thing. Just one. Not as punishment, but as kindness to your weary mind.",
            "anxious": "There's a tightness. Chest, shoulders, jaw. The world feels too much, too fast. Anxiety is ancient - it kept our ancestors alive. But right now, you're safe. Place your hand on your chest. Feel the rise and fall. You've survived every difficult moment until now. This one will pass too. Rivers flow. Seasons change. You're still here.",
            "neutral": "Sometimes there's no crisis. Just the quiet hum of existence. You're here, doing what needs to be done. There's steadiness in that. Most of life is ordinary moments, strung together. Take a pause anyway. Roll your shoulders back. Breathe once, slowly. You're doing fine. You're here.",
        }
        return scripts.get(emotion, scripts["neutral"])
    
    def extract_video_keywords(self, script: str, emotion: str) -> List[str]:
        """Extract 3-5 visual keywords from script for video search."""
        prompt = f"""From this mindfulness script about {emotion}, extract 3-5 SHORT visual search terms for calm stock footage.

Script: {script}

Return a JSON array of 3-5 search terms. Each term should be 1-3 words, visual, calming, nature-focused.

Examples: ["rain falling", "sunset", "ocean waves", "forest", "flowing water"]

Return ONLY the JSON array, nothing else."""

        try:
            response = self.model.generate_content(
                model='gemini-1.5-flash',
                contents=prompt
            )
            # Handle both old and new API response formats
            if hasattr(response, 'text'):
                text = response.text.strip().replace("```json", "").replace("```", "")
            elif hasattr(response, 'candidates') and response.candidates:
                text = response.candidates[0].content.parts[0].text.strip().replace("```json", "").replace("```", "")
            keywords = json.loads(text)
            return keywords[:5] if isinstance(keywords, list) else self._fallback_keywords(emotion)
        except:
            return self._fallback_keywords(emotion)
    
    def _fallback_keywords(self, emotion: str) -> List[str]:
        """Fallback keywords if extraction fails."""
        keywords = {
            "frustrated": ["rain falling", "storm passing", "water flowing", "clouds moving"],
            "fatigued": ["sunset", "slow clouds", "dimming light", "peaceful evening"],
            "distracted": ["forest path", "trees swaying", "nature walk", "green leaves"],
            "anxious": ["calm ocean", "gentle waves", "still water", "peaceful lake"],
            "neutral": ["abstract motion", "slow movement", "minimal patterns", "calm background"],
        }
        return keywords.get(emotion, ["nature", "calm", "peaceful"])
    
    def search_pexels_videos(self, keyword: str, orientation: str = "portrait") -> Optional[str]:
        """
        Search Pexels for a video and return direct download URL.
        
        Args:
            keyword: Search term
            orientation: portrait (9:16) or landscape
            
        Returns:
            Direct video file URL or None
        """
        url = "https://api.pexels.com/videos/search"
        headers = {"Authorization": self.pexels_key}
        params = {
            "query": keyword,
            "orientation": orientation,
            "size": "medium",
            "per_page": 5
        }
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            videos = data.get("videos", [])
            if not videos:
                return None
            
            # Get first video, find HD portrait file
            video = videos[0]
            for file in video.get("video_files", []):
                if file.get("height", 0) >= 1080:  # HD quality
                    return file.get("link")
            
            # Fallback to any available file
            files = video.get("video_files", [])
            return files[0].get("link") if files else None
        
        except Exception as e:
            print(f"Pexels search failed for '{keyword}': {e}")
            return None
    
    def download_video(self, url: str, output_path: str) -> bool:
        """Download video from URL."""
        try:
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return True
        except Exception as e:
            print(f"Download failed: {e}")
            return False
    
    def download_videos_for_script(self, keywords: List[str], job_id: str) -> List[str]:
        """Download 3-5 video clips based on keywords."""
        video_paths = []
        
        for i, keyword in enumerate(keywords):
            print(f"[{i+1}/{len(keywords)}] Searching Pexels for: {keyword}")
            
            video_url = self.search_pexels_videos(keyword)
            if not video_url:
                print(f"  No results for '{keyword}', skipping")
                continue
            
            output_path = os.path.join(self.temp_dir, f"{job_id}_clip_{i}.mp4")
            
            print(f"  Downloading...")
            if self.download_video(video_url, output_path):
                video_paths.append(output_path)
                print(f"  ✓ Saved to {output_path}")
            else:
                print(f"  ✗ Download failed")
        
        return video_paths
    
    async def generate_tts(self, script: str, output_path: str, emotion: str) -> str:
        """Generate TTS with deep voice."""
        voices = {
            "frustrated": "en-US-GuyNeural",
            "fatigued": "en-US-DavisNeural",
            "distracted": "en-US-AndrewNeural",
            "anxious": "en-US-GuyNeural",
            "neutral": "en-GB-RyanNeural",
        }
        voice = voices.get(emotion, "en-US-GuyNeural")
        
        communicate = edge_tts.Communicate(script, voice, rate="-15%")
        await communicate.save(output_path)
        return output_path
    
    def composite_reel(
        self,
        video_paths: List[str],
        tts_path: str,
        ambient_path: str,
        output_path: str
    ) -> str:
        """Composite videos + TTS + ambient audio into final reel."""
        print("\n[COMPOSITING] Starting video composition...")
        
        # Load TTS to get duration
        tts_clip = AudioFileClip(tts_path)
        duration = tts_clip.duration
        print(f"  TTS duration: {duration:.1f}s")
        
        # Load video clips
        clips = []
        time_per_clip = duration / len(video_paths)
        
        print(f"  Loading {len(video_paths)} video clips...")
        for i, path in enumerate(video_paths):
            clip = VideoFileClip(path)
            
            # Resize to 9:16 (1080x1920)
            clip = self._resize_to_portrait(clip)
            
            # Set duration
            clip = clip.subclipped(0, min(clip.duration, time_per_clip))
            clip = clip.with_duration(time_per_clip)
            clip = clip.with_fps(30)
            
            clips.append(clip)
            print(f"    [{i+1}] {os.path.basename(path)} - {time_per_clip:.1f}s")
        
        # Concatenate clips
        print("  Concatenating clips...")
        final_video = concatenate_videoclips(clips, method="compose")
        final_video = final_video.with_duration(duration)
        
        # Load ambient audio
        print("  Adding ambient audio...")
        ambient = AudioFileClip(ambient_path)
        if ambient.duration < duration:
            ambient = ambient.with_effects([afx.AudioLoop(duration=duration)])
        else:
            ambient = ambient.subclipped(0, duration)
        ambient = ambient.with_volume_scaled(0.15)  # 15% volume
        
        # Composite audio
        final_audio = CompositeAudioClip([tts_clip, ambient])
        final_video = final_video.with_audio(final_audio)
        
        # Export
        print(f"  Exporting to {output_path}...")
        final_video.write_videofile(
            output_path,
            fps=30,
            codec="libx264",
            audio_codec="aac",
            logger=None
        )
        
        # Cleanup
        tts_clip.close()
        ambient.close()
        for clip in clips:
            clip.close()
        final_video.close()
        
        print(f"✓ Reel complete: {output_path}")
        return output_path
    
    def _resize_to_portrait(self, clip: VideoFileClip) -> VideoFileClip:
        """Resize and crop to 9:16 portrait."""
        w, h = clip.size
        target_aspect = 9 / 16
        current_aspect = w / h
        
        if current_aspect > target_aspect:
            # Crop width
            new_w = int(h * target_aspect)
            clip = clip.cropped(x_center=w/2, width=new_w, height=h)
        else:
            # Crop height
            new_h = int(w / target_aspect)
            clip = clip.cropped(y_center=h/2, width=w, height=new_h)
        
        return clip.resized((1080, 1920))
    
    def generate_reel(self, job_id: str, emotion: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main pipeline: Generate complete dynamic reel.
        
        Returns dict with:
            - success: bool
            - reel_path: str
            - script: str
            - keywords: list
            - error: str (if failed)
        """
        result = {
            "success": False,
            "job_id": job_id,
            "reel_path": None,
            "script": None,
            "keywords": None,
            "error": None
        }
        
        try:
            print(f"\n{'='*70}")
            print(f"REEL GENERATOR - Job {job_id}")
            print(f"Emotion: {emotion} | Context: {context['active_tab_category']}, {context['time_of_day']}")
            print(f"{'='*70}\n")
            
            # Step 1: Generate script
            print("[1/6] Generating script...")
            script = self.generate_script(emotion, context)
            result["script"] = script
            print(f"✓ Script ({len(script)} chars)\n")
            
            # Step 2: Extract video keywords
            print("[2/6] Extracting video keywords...")
            keywords = self.extract_video_keywords(script, emotion)
            result["keywords"] = keywords
            print(f"✓ Keywords: {keywords}\n")
            
            # Step 3: Search & download videos
            print("[3/6] Downloading videos from Pexels...")
            video_paths = self.download_videos_for_script(keywords, job_id)
            if not video_paths:
                raise RuntimeError("No videos downloaded")
            print(f"✓ Downloaded {len(video_paths)} clips\n")
            
            # Step 4: Generate TTS
            print("[4/6] Generating TTS...")
            tts_path = os.path.join(self.output_dir, "audio", f"{job_id}.mp3")
            asyncio.run(self.generate_tts(script, tts_path, emotion))
            print(f"✓ TTS saved to {tts_path}\n")
            
            # Step 5: Get ambient audio
            print("[5/6] Loading ambient audio...")
            ambient_path = self.ambient_music.get(emotion, self.ambient_music["neutral"])
            if not os.path.exists(ambient_path):
                print(f"⚠️  Ambient audio missing: {ambient_path}, continuing without it")
                ambient_path = None
            else:
                print(f"✓ Using {ambient_path}\n")
            
            # Step 6: Composite
            print("[6/6] Compositing final reel...")
            reel_path = os.path.join(self.output_dir, "reels", f"{job_id}.mp4")
            
            if ambient_path:
                self.composite_reel(video_paths, tts_path, ambient_path, reel_path)
            else:
                # Without ambient, just use TTS
                self.composite_reel_no_ambient(video_paths, tts_path, reel_path)
            
            result["reel_path"] = reel_path
            result["success"] = True
            
            # Cleanup temp files
            for path in video_paths:
                try:
                    os.remove(path)
                except:
                    pass
            
            print(f"\n{'='*70}")
            print(f"✓ GENERATION COMPLETE")
            print(f"  Reel: {reel_path}")
            print(f"  Clips used: {len(video_paths)}")
            print(f"{'='*70}\n")
            
            return result
        
        except Exception as e:
            result["error"] = str(e)
            print(f"\n✗ Generation failed: {e}")
            import traceback
            traceback.print_exc()
            return result
    
    def composite_reel_no_ambient(self, video_paths: List[str], tts_path: str, output_path: str):
        """Fallback compositor without ambient audio."""
        tts_clip = AudioFileClip(tts_path)
        duration = tts_clip.duration
        
        clips = []
        time_per_clip = duration / len(video_paths)
        
        for path in video_paths:
            clip = VideoFileClip(path)
            clip = self._resize_to_portrait(clip)
            clip = clip.subclipped(0, min(clip.duration, time_per_clip))
            clip = clip.with_duration(time_per_clip).with_fps(30)
            clips.append(clip)
        
        final_video = concatenate_videoclips(clips, method="compose")
        final_video = final_video.with_audio(tts_clip).with_duration(duration)
        
        final_video.write_videofile(output_path, fps=30, codec="libx264", audio_codec="aac", logger=None)
        
        tts_clip.close()
        for clip in clips:
            clip.close()
        final_video.close()


def main():
    """Test with sample data."""
    import sys
    
    # Load sample data
    with open("data/sample_emotion_result.json", "r") as f:
        data = json.load(f)
    
    # Initialize
    generator = ReelGenerator()
    
    # Generate
    result = generator.generate_reel(
        job_id=data["job_id"],
        emotion=data["emotion"]["label"],
        context=data["context"]
    )
    
    if result["success"]:
        print(f"\n✓ SUCCESS! Play with: mpv {result['reel_path']}")
        return 0
    else:
        print(f"\n✗ FAILED: {result['error']}")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
