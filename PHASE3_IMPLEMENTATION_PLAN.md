# Phase 3 Implementation Plan: Reel Generation

## Overview
This document outlines the step-by-step plan for implementing Phase 3 (reel generation) of the MindStream project. Phase 1 (extension flow) is complete, and Phase 2 (emotion detection) is your friend's responsibility.

---

## What We Learned from MoneyPrinter V2

**Core takeaway:** MoneyPrinter generates YouTube Shorts from scratch (topic → script → images → TTS → video). We only need the **final assembly step**: TTS + MoviePy composition.

**What we're borrowing:**
- TTS generation approach (Edge TTS or KittenTTS)
- MoviePy video composition pipeline
- Audio mixing (TTS + background music)

**What we're NOT using:**
- Selenium/browser automation (we're not uploading anywhere)
- Image generation pipeline (we have pre-built video templates)
- Ollama/local LLM (we're using Gemini)
- Account management, CRON scheduling, Twitter/YouTube integration

---

## Development Approach: Milestones

### Milestone 1: Standalone Reel Generator (No Backend) 🎯 START HERE
**Goal:** Prove we can generate a reel from hardcoded inputs.

**What to build:**
1. Create `backend/test_reel_gen.py`
2. Hardcode:
   ```python
   emotion = "frustrated"
   script = "Take a deep breath. You've been working hard. Close the tabs, stand up, stretch for 30 seconds. You've got this."
   ```
3. Generate TTS → `test_audio.wav`
4. Load a test video asset (download from Pexels: https://www.pexels.com/search/videos/calm/)
5. Composite with MoviePy → `test_reel.mp4`

**Dependencies to install:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

pip install moviepy edge-tts pillow
```

**Success criteria:**
- Script runs without errors
- Outputs a 9:16 MP4 file
- Video plays correctly with audio

**Estimated time:** 2-3 hours

---

### Milestone 2: Gemini Script Generation
**Goal:** Test Gemini API integration.

**What to build:**
1. Create `backend/test_gemini.py`
2. Get Gemini API key from Google AI Studio (https://aistudio.google.com/app/apikey)
3. Install SDK: `pip install google-generativeai`
4. Send test prompt:
   ```python
   import google.generativeai as genai
   
   genai.configure(api_key="YOUR_API_KEY")
   model = genai.GenerativeModel("gemini-1.5-flash")
   
   prompt = """You are a mindfulness coach. Generate a brief, encouraging script 
   (30-40 seconds when spoken) for a focus reset video.
   
   User emotion: frustrated
   Context: It's evening, they've been browsing entertainment sites for 47 minutes.
   
   Be warm, concise, and actionable. Return only the script, no extra commentary."""
   
   response = model.generate_content(prompt)
   print(response.text)
   ```

**Success criteria:**
- Gemini returns a coherent ~30-40 second script
- Script is personalized based on emotion + context

**Estimated time:** 1 hour

---

### Milestone 3: Asset Library Setup
**Goal:** Gather background videos and ambient audio for each emotion.

**What to source:**

| Emotion      | Background Video Idea           | Ambient Audio Idea         |
|--------------|---------------------------------|----------------------------|
| frustrated   | Calming rain on leaves          | Rain sounds                |
| fatigued     | Slow sunset timelapse           | Soft piano                 |
| distracted   | Forest path, gentle camera pan  | Birds chirping             |
| anxious      | Ocean waves (calm, not stormy)  | Gentle waves + wind        |
| neutral      | Abstract slow motion (ink, etc) | White noise / ambient hum  |

**Free sources:**
- Videos: [Pexels Videos](https://www.pexels.com/videos/), [Pixabay Videos](https://pixabay.com/videos/)
- Audio: [Pixabay Music](https://pixabay.com/music/), [Freesound](https://freesound.org/)

**Requirements:**
- Videos: 9:16 aspect ratio (or croppable), 60+ seconds, loopable
- Audio: 60+ seconds, loopable, calm

**File structure:**
```
backend/
├─ assets/
│  ├─ backgrounds/
│  │  ├─ frustrated.mp4
│  │  ├─ fatigued.mp4
│  │  ├─ distracted.mp4
│  │  ├─ anxious.mp4
│  │  └─ neutral.mp4
│  └─ audio/
│     ├─ frustrated.mp3
│     ├─ fatigaged.mp3
│     ├─ distracted.mp3
│     ├─ anxious.mp3
│     └─ neutral.mp3
```

**Success criteria:**
- All 5 emotions have matching video + audio pairs
- Files play correctly in VLC or browser

**Estimated time:** 1-2 hours (mostly searching/downloading)

---

### Milestone 4: Express Backend Skeleton
**Goal:** Stub endpoints so the extension has something to call.

**What to build:**
1. Create `backend/server.js`:
   ```javascript
   const express = require('express');
   const cors = require('cors');
   const { v4: uuidv4 } = require('uuid');
   
   const app = express();
   app.use(cors());
   app.use(express.json());
   
   // In-memory job storage
   const jobs = {};
   
   // Stub: create a new job
   app.post('/check-in', (req, res) => {
     const jobId = uuidv4();
     jobs[jobId] = {
       status: 'processing',
       created_at: new Date().toISOString()
     };
     
     // Simulate processing (5 seconds later, mark as ready)
     setTimeout(() => {
       jobs[jobId].status = 'ready';
       jobs[jobId].reel_url = `http://localhost:4000/reels/${jobId}.mp4`;
     }, 5000);
     
     res.json({ job_id: jobId });
   });
   
   // Get job status
   app.get('/jobs/:id', (req, res) => {
     const job = jobs[req.params.id];
     if (!job) return res.status(404).json({ error: 'Job not found' });
     res.json(job);
   });
   
   // Serve static reel files
   app.use('/reels', express.static('output/reels'));
   
   app.listen(4000, () => {
     console.log('Backend running on http://localhost:4000');
   });
   ```

2. Install dependencies:
   ```bash
   cd backend
   npm init -y
   npm install express cors uuid
   ```

3. Test with curl:
   ```bash
   curl -X POST http://localhost:4000/check-in
   # Wait 5 seconds, then:
   curl http://localhost:4000/jobs/<job_id>
   ```

**Success criteria:**
- Extension can call `/check-in`, get a job_id
- Polling `/jobs/:id` returns "processing" then "ready"
- No CORS errors in browser console

**Estimated time:** 1 hour

---

### Milestone 5: Integrate Phase 3 Pipeline
**Goal:** Wire Gemini + TTS + MoviePy into the backend.

**What to build:**
1. Refactor `test_reel_gen.py` into a reusable function:
   ```python
   # backend/workers/reel_generator.py
   
   def generate_reel(job_id, emotion_label, script, bg_video_path, ambient_audio_path):
       # 1. Generate TTS
       tts_path = f"output/audio/{job_id}.mp3"
       asyncio.run(generate_tts(script, tts_path))
       
       # 2. Composite video
       output_path = f"output/reels/{job_id}.mp4"
       composite_video(tts_path, bg_video_path, ambient_audio_path, output_path)
       
       return output_path
   ```

2. Update `server.js` to spawn Python worker:
   ```javascript
   const { spawn } = require('child_process');
   
   app.post('/check-in', async (req, res) => {
     const jobId = uuidv4();
     jobs[jobId] = { status: 'processing', created_at: new Date().toISOString() };
     res.json({ job_id: jobId });
     
     // Spawn Python worker in background
     const worker = spawn('python', [
       'workers/reel_generator.py',
       '--job-id', jobId,
       '--emotion', 'frustrated',  // TODO: get from Phase 2 result
       '--script', 'Your personalized script here'
     ]);
     
     worker.on('close', (code) => {
       if (code === 0) {
         jobs[jobId].status = 'ready';
         jobs[jobId].reel_url = `http://localhost:4000/reels/${jobId}.mp4`;
       } else {
         jobs[jobId].status = 'failed';
         jobs[jobId].error = 'Reel generation failed';
       }
     });
   });
   ```

**Success criteria:**
- POST to `/check-in` triggers reel generation
- Python worker runs, outputs MP4 to `output/reels/`
- Job status updates to "ready" when complete

**Estimated time:** 2-3 hours

---

### Milestone 6: File Watcher for Phase 2 Integration
**Goal:** Backend detects new clips and emotion results automatically.

**What to build:**
1. Install `chokidar`:
   ```bash
   npm install chokidar
   ```

2. Add file watcher to `server.js`:
   ```javascript
   const chokidar = require('chokidar');
   const path = require('path');
   const fs = require('fs');
   const os = require('os');
   
   const CAPTURE_FOLDER = path.join(os.homedir(), 'Downloads', 'mindstream_captures');
   
   // Watch for new .webm files
   chokidar.watch(CAPTURE_FOLDER, { ignored: /_result\.json$/ }).on('add', (filePath) => {
     if (!filePath.endsWith('.webm')) return;
     
     console.log('New clip detected:', filePath);
     const jobId = uuidv4();
     jobs[jobId] = {
       status: 'processing_emotion',
       clip_path: filePath,
       created_at: new Date().toISOString()
     };
     
     // Watch for corresponding _result.json
     const baseName = path.basename(filePath, '.webm');
     const resultPath = path.join(CAPTURE_FOLDER, `${baseName}_result.json`);
     
     const resultWatcher = chokidar.watch(resultPath).on('add', () => {
       const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
       
       if (result.emotion) {
         // Move to Phase 3: generate reel
         generateReel(jobId, result.emotion.label);
       } else {
         // Emotion detection failed
         jobs[jobId].status = 'failed';
         jobs[jobId].error = result.error || 'Emotion detection failed';
       }
       
       resultWatcher.close();
     });
   });
   ```

**Success criteria:**
- Backend detects new clips automatically
- Waits for Phase 2 result file
- Triggers Phase 3 when result appears

**Estimated time:** 2 hours

---

### Milestone 7: End-to-End Test
**Goal:** Full flow from extension → backend → reel generation.

**Test steps:**
1. Start backend: `node backend/server.js`
2. Load extension in Chrome (unpacked mode)
3. Trigger check-in from notification
4. Capture clip → saves to `~/Downloads/mindstream_captures/`
5. Manually drop a fake `_result.json` file:
   ```json
   {
     "emotion": {"label": "frustrated", "confidence": 0.8},
     "metadata": {"faces_detected": 1}
   }
   ```
6. Backend detects result → generates reel
7. Extension polls → sees "ready" → shows notification
8. Click notification → side panel plays reel

**Success criteria:**
- Full flow works without manual intervention (except simulating Phase 2)
- Reel plays correctly in side panel
- No errors in browser or backend console

**Estimated time:** 1-2 hours (mostly testing/debugging)

---

## Recommended Order of Work

**Week 1:**
- [ ] Milestone 1: Standalone reel generator
- [ ] Milestone 2: Gemini integration
- [ ] Milestone 3: Asset library setup

**Week 2:**
- [ ] Milestone 4: Express backend skeleton
- [ ] Milestone 5: Integrate Phase 3 pipeline
- [ ] Milestone 6: File watcher (if Phase 2 is ready)

**Week 3:**
- [ ] Milestone 7: End-to-end testing
- [ ] Bug fixes, polish
- [ ] Demo prep

---

## Key Decisions Made

1. **TTS choice:** Edge TTS (free, online, good quality) — start here, migrate to KittenTTS if offline needed
2. **Subtitles:** Defer to post-MVP (adds complexity without proportional UX value)
3. **Backend language:** Node.js (Express) — matches your existing skillset, easier integration
4. **Phase 2 interface:** File-based (clip + result JSON) — simple, decouples your work from your friend's
5. **Asset approach:** Pre-built templates (5 emotions × 1 video + 1 audio each) — faster than generating on the fly

---

## Questions for You

1. **TTS preference:** Edge TTS (online, free) vs KittenTTS (offline, 500MB model)?
2. **Asset sourcing:** Should I help find specific videos/audio, or will you source them?
3. **Gemini API key:** Do you already have one, or need help setting up?
4. **Timeline:** Are you aiming to have this done in 1-2 weeks, or longer?

Let me know and I'll start with Milestone 1!
