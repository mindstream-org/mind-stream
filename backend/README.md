# MindStream Reel Generator - Dynamic Video Approach

**Dynamic video generation:** Every reel is unique. Script → keywords → Pexels search → download clips → compose.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## API Keys Required

### 1. Gemini API (Script Generation)
- Get free key: https://aistudio.google.com/app/apikey
- ```bash
  export GEMINI_API_KEY='your-key-here'
  ```

### 2. Pexels API (Video Search & Download)
- Get free key: https://www.pexels.com/api/
- Free tier: 200 requests/hour (plenty for testing)
- ```bash
  export PEXELS_API_KEY='your-key-here'
  ```

## Add Ambient Audio (Optional but Recommended)

Pre-download calm background music for each emotion:

```
assets/audio/
├── frustrated.mp3    # Rain sounds, calm music
├── fatigued.mp3      # Soft piano, ambient
├── distracted.mp3    # Nature sounds, birds
├── anxious.mp3       # Gentle waves, wind
└── neutral.mp3       # Minimal ambient
```

Download from: [Pixabay Music](https://pixabay.com/music/) (search "ambient", "calm", "nature")

**If missing:** Generator still works, just without background music.

## Test

```bash
export GEMINI_API_KEY='...'
export PEXELS_API_KEY='...'

python reel_generator.py
```

### Render presets

`normal` is the default and is intended for background generation while the
browser and desktop remain responsive. It renders at 720x1280/24fps with the
balanced encoder setting. On Linux, it also runs in a hardware-aware CPU cgroup
and at a lower scheduling priority. A four-physical-core machine receives a
150% aggregate budget (up to one and a half CPUs), which leaves substantial
desktop capacity without throttling the compositor and encoder into a long
serial export.

Normal intentionally uses one MovieLite worker. Its aggregate CPU quota and lower
scheduling priority keep it background-friendly, while Linux is free to place
that work on any available CPU rather than pinning it to CPU 0. On the
reference laptop, two- and three-worker exports were slower under moderate
aggregate CPU quotas and increased peak memory substantially because MovieLite
renders and merges one encoded part per worker.

`fast` starts with up to two workers when current RAM headroom permits it.
MovieLite renders one encoded part per process and then merges them, so the
calibration reserves a physical core for the desktop and only accepts
additional workers when they make a meaningful measured improvement. Linux
places the selected workers naturally; no preset pins them to particular CPU
IDs.
It keeps the same 720x1280/24fps output as Normal but uses MovieLite's faster
x264 profile and up to two measured-useful encoder threads. That is a modest
compression trade-off for faster generation, not a resolution or frame-rate
reduction.
On its first Fast reel, MindStream benchmarks safe worker counts against a
short sample of the downloaded footage, caches the fastest meaningful result,
and reuses it until the hardware or output profile changes.

```bash
./test.sh --preset normal
./test.sh --preset fast
./test.sh --preset fast --recalibrate-presets

# When using the Express server, Normal remains the default.
MINDSTREAM_REEL_PRESET=fast npm start
```

**What happens:**
1. Loads `data/sample_emotion_result.json` (frustrated emotion)
2. Generates philosophical script with Gemini
3. Extracts 3-5 visual keywords from script (e.g., "rain falling", "storm passing")
4. Searches Pexels for each keyword
5. Downloads video clips (portrait/9:16)
6. Generates deep voice TTS
7. Composites: clips → TTS → ambient audio → final 9:16 MP4

**Output:** `output/reels/sample-job-001.mp4`

**Play:**
```bash
mpv output/reels/sample-job-001.mp4
```

## How It Works

### Script Generation (Deep & Philosophical)
```python
# Generates elder mentor voice script
script = generator.generate_script("frustrated", context)
# e.g., "There's a heaviness settling in. That particular kind..."
```

### Keyword Extraction
```python
# Gemini extracts visual search terms from script
keywords = generator.extract_video_keywords(script, "frustrated")
# e.g., ["rain falling", "storm passing", "water flowing"]
```

### Video Search & Download
```python
# Searches Pexels for each keyword, downloads HD clips
video_paths = generator.download_videos_for_script(keywords, job_id)
# Downloads 3-5 clips to temp/
```

### TTS Generation
```python
# Deep male voice, -15% slower
await generator.generate_tts(script, output_path, emotion="frustrated")
# Voice: en-US-GuyNeural (deep, calm)
```

### Composition
```python
# Concatenates clips, adds TTS + ambient audio
generator.composite_reel(video_paths, tts_path, ambient_path, output_path)
# Result: 9:16 MP4, ~45-60 seconds
```

## Every Reel Is Unique

**Same emotion, different reels:**
- Script varies based on context (time, activity, duration)
- Keywords extracted from unique script
- Different videos downloaded each time
- Same emotion = similar theme, different execution

**Example (frustrated):**
- Run 1: "rain falling", "storm clouds", "water drops" → rainy reels
- Run 2: "breaking waves", "ocean storm", "crashing water" → ocean reels
- Run 3: "wind through trees", "rustling leaves", "forest" → forest reels

All match "frustrated" theme, all different visuals.

## Project Structure

```
backend/
├── reel_generator.py       # Complete pipeline (single file)
├── requirements.txt        # Dependencies
├── README.md              # This file
│
├── data/
│   └── sample_emotion_result.json  # Test input
│
├── assets/audio/          # Pre-downloaded ambient music
│   ├── frustrated.mp3
│   └── ...
│
└── output/
    ├── audio/             # Generated TTS files
    ├── reels/             # Final MP4s
    └── temp/              # Downloaded clips (auto-deleted)
```

## Troubleshooting

### "PEXELS_API_KEY required"
Get free key: https://www.pexels.com/api/

### "No videos downloaded"
- Pexels might not have results for those keywords
- Generator will retry with fallback keywords
- Check internet connection

### "Ambient audio missing"
- Download ambient music to `assets/audio/`
- OR generator continues without it (TTS only)

### Videos look weird/stretched
- Pexels returns portrait videos
- Generator crops/resizes to 9:16
- Some videos might not be perfectly vertical (rare)

## Rate Limits

**Pexels Free Tier:**
- 200 requests/hour
- Each reel = 3-5 requests (one per clip)
- ~40-60 reels/hour max

**Gemini Free Tier:**
- 15 requests/minute
- Each reel = 2 requests (script + keywords)
- More than enough for testing

## Next Steps

Once this works:
1. Build Express backend (calls this Python script)
2. Add file watcher for Phase 2 integration
3. Connect to browser extension

## Differences from Static Approach

| Static (Old) | Dynamic (New) |
|--------------|---------------|
| Pre-selected 5 videos | Searches Pexels per script |
| Same video per emotion | Unique videos every time |
| Manually curated | AI-generated keywords |
| Fast (no download) | ~10-20s download time |
| Boring after 2nd use | Always fresh |

Dynamic is the whole point of this project!
