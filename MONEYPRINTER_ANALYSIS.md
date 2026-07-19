# MoneyPrinter V2 Analysis for MindStream

## What MoneyPrinter Does (High-Level)

MoneyPrinter V2 is an automated YouTube Shorts generator that:
1. Uses an LLM to generate a topic and script for a given niche
2. Generates image prompts from the script
3. Creates/downloads images based on those prompts
4. Converts script to speech using TTS (KittenTTS)
5. Generates subtitles from the audio
6. Combines images + TTS + background music + subtitles into a final 9:16 vertical video using MoviePy

---

## What We DON'T Need from MoneyPrinter

**We can skip entirely:**
- ❌ Firefox automation / Selenium (for uploading to YouTube)
- ❌ Twitter bot functionality
- ❌ Affiliate marketing / outreach modules
- ❌ CRON job scheduling
- ❌ Account management system
- ❌ Topic/script generation (we already have emotion + context from Phase 1 & 2)
- ❌ Image generation pipeline (we're using pre-built templates)
- ❌ Complex subtitle generation with AssemblyAI (we can use simpler alternatives or skip initially)

**Dependencies we don't need:**
- Selenium, webdriver_manager, undetected_chromedriver
- schedule (for cron)
- yagmail (email)
- assemblyai (we can use local Whisper if needed, or skip subtitles initially)
- ollama (we're using Gemini)

---

## What We DO Need from MoneyPrinter

### Core Components:

#### 1. **TTS (Text-to-Speech) Generation**
**File:** `src/classes/Tts.py`

```python
from kittentts import KittenTTS

class TTS:
    def __init__(self):
        self._model = KittenTTS("KittenML/kitten-tts-mini-0.8")
        
    def synthesize(self, text, output_file):
        audio = self._model.generate(text, voice=self._voice)
        sf.write(output_file, audio, 24000)  # 24kHz sample rate
        return output_file
```

**What we need:** A function that takes a script (string) and returns an audio file (WAV).

**Alternative:** We could also use:
- Google Cloud TTS
- Edge TTS (Microsoft, free)
- gTTS (Google, simpler but lower quality)

---

#### 2. **Video Composition with MoviePy**
**File:** `src/classes/YouTube.py` → `combine()` method (lines 552+)

**Core pipeline:**
1. Load TTS audio → get duration
2. Load background video/images
3. Calculate how long each image should display (duration / num_images)
4. Resize/crop images to 9:16 (1080x1920)
5. Concatenate images into a video clip
6. Add background music (lowered volume)
7. Composite audio: TTS + background music
8. Optionally add subtitles overlay
9. Export final video

**Key MoviePy operations:**
```python
from moviepy.editor import *

# Load audio
tts_clip = AudioFileClip("script.wav")

# Load background video (or images)
bg_clip = VideoFileClip("background.mp4").loop(duration=tts_clip.duration)

# Resize to 9:16
bg_clip = bg_clip.resize((1080, 1920))

# Add background music
bg_music = AudioFileClip("ambient.mp3").volumex(0.2)
final_audio = CompositeAudioClip([tts_clip, bg_music])

# Combine
final = bg_clip.set_audio(final_audio).set_duration(tts_clip.duration)
final.write_videofile("output.mp4", fps=30)
```

---

#### 3. **Optional: Subtitle Generation**
**File:** `src/classes/YouTube.py` → `generate_subtitles()` method

MoneyPrinter uses:
- **AssemblyAI** (paid API) or
- **Faster-Whisper** (local, free)

For MindStream, we can:
- Use `faster-whisper` (local STT)
- Or skip subtitles initially and add later if needed

---

## Minimal Dependencies for MindStream Phase 3

```txt
# Core video processing
moviepy>=1.0.3
Pillow>=10.0.0

# TTS - pick ONE:
# Option 1: KittenTTS (what MoneyPrinter uses)
kittentts @ https://github.com/KittenML/KittenTTS/releases/download/0.8.1/kittentts-0.8.1-py3-none-any.whl
soundfile

# Option 2: Edge TTS (simpler, no model download)
edge-tts

# Option 3: gTTS (simplest, but robotic)
gtts

# Optional: Subtitles
faster-whisper  # Local STT, ~500MB model
srt_equalizer   # For subtitle timing

# Backend
flask  # or express in Node, your choice
requests  # For Gemini API calls
```

---

## Simplified Architecture for MindStream

### Phase 3 Pipeline (Your Part):

```
Input (from Phase 2):
  ├─ emotion_label (e.g., "frustrated")
  ├─ confidence (e.g., 0.82)
  └─ context (tab category, time of day, session duration)

Step 1: Generate Script (Gemini API)
  └─ Send: emotion + context
  └─ Receive: personalized script (JSON)

Step 2: Text-to-Speech
  └─ Input: script text
  └─ Output: audio.wav

Step 3: Asset Selection
  └─ Map emotion → background video + ambient audio
  └─ E.g., "frustrated" → calm_forest.mp4 + rain_ambience.mp3

Step 4: Video Composition (MoviePy)
  ├─ Load background video (loop to match TTS duration)
  ├─ Resize to 9:16 (1080x1920)
  ├─ Add TTS audio
  ├─ Mix in background music (low volume)
  └─ Export final reel

Step 5: Return URL
  └─ Save to /output/reels/<job_id>.mp4
  └─ Update job status: "ready"
```

---

## Recommended File Structure

```
mind-stream/
├─ backend/              # NEW: Local Express/Flask server
│  ├─ server.js          # Main entry point
│  ├─ routes/
│  │  ├─ check-in.js     # POST /check-in
│  │  └─ jobs.js         # GET /jobs/:id
│  ├─ workers/
│  │  ├─ emotion.py      # Phase 2 (your friend's part)
│  │  └─ reel-gen.py     # Phase 3 (your part)
│  └─ jobs.json          # In-memory job tracker
│
├─ assets/               # Pre-built templates
│  ├─ backgrounds/
│  │  ├─ frustrated.mp4
│  │  ├─ fatigued.mp4
│  │  ├─ distracted.mp4
│  │  ├─ anxious.mp4
│  │  └─ neutral.mp4
│  └─ audio/
│     ├─ frustrated.mp3  # Ambient audio per emotion
│     ├─ fatigued.mp3
│     └─ ...
│
├─ output/
│  ├─ clips/             # Captured webcam clips (temp)
│  └─ reels/             # Generated reels
│
└─ src/                  # Extension (existing)
```

---

## What You Should Build First

### Milestone 1: Basic Reel Generator (No Backend Yet)
**Goal:** Prove you can generate a reel from a hardcoded emotion + script.

**Steps:**
1. Create a Python script: `test_reel_gen.py`
2. Hardcode:
   - emotion = "frustrated"
   - script = "Take a deep breath. You've been working hard..."
3. Generate TTS from script
4. Load `assets/backgrounds/frustrated.mp4`
5. Composite with MoviePy
6. Output: `test_reel.mp4`

**Dependencies:**
- `moviepy`
- `edge-tts` (or `kittentts`)

**No backend, no Gemini, no emotion detection yet.**

---

### Milestone 2: Gemini Script Generation
**Goal:** Test Gemini API integration.

**Steps:**
1. Create `test_gemini.py`
2. Send prompt:
   ```json
   {
     "emotion": "frustrated",
     "context": {
       "time_of_day": "evening",
       "active_tab_category": "entertainment",
       "session_duration_minutes": 47
     }
   }
   ```
3. Receive structured script from Gemini
4. Print the result

---

### Milestone 3: Express Backend Skeleton
**Goal:** Stubbed endpoints that return fake data.

**Routes:**
- `POST /check-in` → returns `{ "job_id": "123" }`
- `GET /jobs/123` → returns `{ "status": "processing" }` (after 5s, return `"ready"`)

---

### Milestone 4: Full Integration
**Goal:** Wire everything together.

1. Extension captures clip → saves to disk
2. Backend spawns Python worker for emotion detection (Phase 2, friend's part)
3. Backend spawns Python worker for reel generation (Phase 3, your part)
4. Backend updates job status
5. Extension polls and shows notification

---

## Privacy Assessment: What's Acceptable?

### ✅ Safe for Portfolio:
- Emotion detection from webcam (with explicit consent)
- High-level tab category ("work", "social", "entertainment")
- Time of day, session duration, idle time (aggregated)
- Everything local, no cloud storage except Gemini API call

### ⚠️ Questionable:
- Full tab URLs (use categories instead)
- Tab title text
- Detailed browsing history

### ❌ Avoid:
- Keylogging
- Mouse tracking
- Persistent user profiles
- Sharing data with third parties

**Recommendation:** Keep the current `buildCheckInPayload()` approach. It's minimal and defensible.

---

## Next Steps (In Order)

1. ✅ **Analyze MoneyPrinter** (DONE)
2. **Update project summary** with refined Phase 3 approach
3. **Milestone 1:** Build standalone reel generator script
4. **Milestone 2:** Test Gemini integration
5. **Assemble asset library** (5 background videos + audio)
6. **Milestone 3:** Build Express backend skeleton
7. **Milestone 4:** Full end-to-end integration

---

## Questions to Resolve

1. **TTS choice:** KittenTTS (offline, large model) vs Edge TTS (online, free) vs gTTS (simple but robotic)?
2. **Subtitles:** Include in MVP or defer?
3. **Background music:** Single track for all emotions, or per-emotion ambient audio?
4. **Asset library:** Will you create/source the background videos, or should I suggest free stock sources?

Let me know your preferences and I'll update the project summary accordingly!
