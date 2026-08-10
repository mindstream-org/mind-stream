# MindStream Backend

Express server + Python pipeline. Runs locally on port 4000.

## Pipeline

```
Extension (WebM clip) -> predict_emotion.py (FER+ model) -> reel_generator.py (Gemini/Groq + Pexels + MiMo TTS) -> MP4 reel
```

1. Extension POSTs `/check-in` with `clip_path`, `context`, `preset`
2. Server spawns `predict_emotion.py` -> writes `capture_<id>_result.json`
3. Chokidar watcher picks up the JSON -> spawns `reel_generator.py`
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
| `GEMINI_API_KEY` | ✓ (Default) | Script generation (Gemini 2.0 Flash) |
| `PEXELS_API_KEY` | ✓ | Background video clips |
| `MIMO_API_KEY` | ✓ | TTS narration (Dean voice) |
| `GROQ_API_KEY` | optional | Alternative script provider (Llama 3.3 70B) |
| `PIXABAY_API_KEY` | optional | Fallback video source |

By default, MindStream uses Google Gemini for script generation. If you prefer to use Groq, set `SCRIPT_MODEL_PROVIDER=groq` and `SCRIPT_MODEL_NAME=llama-3.3-70b-versatile` in your `.env` and supply `GROQ_API_KEY`.

Get keys: [Gemini](https://aistudio.google.com/app/apikey) · [Pexels](https://www.pexels.com/api/) · [MiMo](https://platform.xiaomimimo.com/console/api-keys) · [Groq](https://console.groq.com/keys)

## Emotion Model

- **File:** `core_ai/MODELS/CV/best_ferplus_emotion.keras`
- **Architecture:** MobileNetV2 + classification head, trained on FER+
- **Input:** 128x128 RGB, MobileNetV2 `preprocess_input` (-> [-1, 1])
- **Output:** softmax over 8 classes: `angry · contempt · disgust · fear · happy · neutral · sad · surprise`
- **Face detection:** OpenCV Haar cascade (frontal face), falls back to full frame

## Ambient Audio

One MP3 per emotion goes in `assets/audio/`.

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

Reel generation continues gracefully if audio files are missing, playing TTS narration.

## Render Presets

```bash
npm start                          # normal preset (default)
MINDSTREAM_REEL_PRESET=fast npm start
```

| Preset | Description |
|--------|-------------|
| `normal` | Background-friendly. Single worker, CPU-quota limited on Linux, niceness 10. |
| `fast` | Multi-core. Calibrates worker count on first run and caches it. Uses x264 ultrafast. |

Both output 720x1280 @ 24fps portrait MP4.

## Test from CLI

```bash
source venv/bin/activate
python reel_generator.py   # uses inline sample parameters
python predict_emotion.py --clip /path/to/capture.webm
```

## Output

```
output/
├── reels/    # Final MP4s -- served at http://localhost:4000/reels/<filename>
├── audio/    # TTS files (auto-generated, auto-cleaned)
└── temp/     # Downloaded stock clips (auto-deleted after compositing)
```
