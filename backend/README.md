# MindStream Backend

Express server + Python pipeline. Runs locally on port 4000.

## Pipeline

```
Extension (WebM clip) → predict_emotion.py (FER+ model) → reel_generator.py (Llama 3.3 70B via Groq + Pexels + MiMo TTS) → MP4 reel
```

1. Extension POSTs `/check-in` with `clip_path`, `context`, `preset`
2. Server spawns `predict_emotion.py` → writes `capture_<id>_result.json`
3. Chokidar watcher picks up the JSON → spawns `reel_generator.py`
4. Extension polls `/jobs/:id` until `status: "ready"`

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in API keys
npm install
npm start
```

## API Keys

| Key | Required | Purpose |
|-----|----------|---------|
| `GROQ_API_KEY` | ✓ | Script generation (Llama 3.3 70B) |
| `PEXELS_API_KEY` | ✓ | Background video clips |
| `MIMO_API_KEY` | ✓ | TTS narration (Dean voice) |
| `GEMINI_API_KEY` | optional | Alternative LLM provider |
| `PIXABAY_API_KEY` | optional | Fallback video source |

Set `SCRIPT_MODEL_PROVIDER=groq` and `SCRIPT_MODEL_NAME=llama-3.3-70b-versatile` in `.env` (already the default in `.env.example`).

Get keys: [Groq](https://console.groq.com/keys) · [Pexels](https://www.pexels.com/api/) · [MiMo](https://platform.xiaomimimo.com/console/api-keys)

## Emotion Model

- **File:** `core_ai/MODELS/CV/best_ferplus_emotion.keras`
- **Architecture:** MobileNetV2 + classification head, trained on FER+
- **Input:** 128×128 RGB, MobileNetV2 `preprocess_input` (→ [-1, 1])
- **Output:** softmax over 8 classes: `angry · contempt · disgust · fear · happy · neutral · sad · surprise`
- **Face detection:** OpenCV Haar cascade (frontal face), falls back to full frame

## Ambient Audio

One MP3 per emotion goes in `assets/audio/`. See `assets/audio/README.md` for AI generation prompts.

```
assets/audio/
├── angry.mp3
├── contempt.mp3
├── disgust.mp3
├── fear.mp3
├── happy.mp3
├── neutral.mp3
├── sad.mp3
└── surprise.mp3
```

Reel generation continues without audio files — TTS narration still plays.

## Render Presets

```bash
npm start                          # normal preset (default)
MINDSTREAM_REEL_PRESET=fast npm start
```

| Preset | Description |
|--------|-------------|
| `normal` | Background-friendly. Single worker, CPU-quota limited on Linux, niceness 10. |
| `fast` | Multi-core. Calibrates worker count on first run and caches it. Uses x264 ultrafast. |

Both output 720×1280 @ 24fps portrait MP4.

## Test from CLI

```bash
source venv/bin/activate
python reel_generator.py   # uses data/sample_emotion_result.json
python predict_emotion.py --clip /path/to/capture.webm
```

## Output

```
output/
├── reels/    # Final MP4s — served at http://localhost:4000/reels/<filename>
├── audio/    # TTS files (auto-generated, auto-cleaned)
└── temp/     # Downloaded stock clips (auto-deleted after compositing)
```
