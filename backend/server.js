const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

// Load environment variables from backend/.env if present so process.env has keys
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

// In-memory job state tracker
const jobs = {};

// Active single job tracking
let activeJobId = null;

const REEL_PRESET = process.env.MINDSTREAM_REEL_PRESET || 'normal';
if (!['normal', 'fast'].includes(REEL_PRESET)) {
  throw new Error("MINDSTREAM_REEL_PRESET must be 'normal' or 'fast'");
}

// Cache for results written before check-in call finishes (to avoid race conditions)
const pendingResults = {};

// Watcher directory (Download directory for captured clips)
const CAPTURE_FOLDER = path.join(os.homedir(), 'Downloads', 'mindstream_captures');
console.log(`[server] Monitoring captures folder: ${CAPTURE_FOLDER}`);

// Ensure capture directory exists defensively
try {
  fs.mkdirSync(CAPTURE_FOLDER, { recursive: true });
} catch (err) {
  console.error(`[server] Failed to create capture folder: ${err.message}`);
}

/**
 * Safely cancels a running or pending job and terminates its spawned Python process.
 */
function cancelJob(jobId, reason = 'Job cancelled by user') {
  const job = jobs[jobId];
  if (!job) return;

  if (job.status === 'cancelled') return;

  console.log(`[server] Cancelling Job ${jobId}: ${reason}`);

  if (job.process) {
    try {
      job.process.kill('SIGTERM');
    } catch (err) {
      console.error(`[server] Error killing process for Job ${jobId}: ${err.message}`);
    }
    job.process = null;
  }

  job.status = 'cancelled';
  job.cancelled_at = new Date().toISOString();
  job.error = reason;

  if (activeJobId === jobId) {
    activeJobId = null;
  }
}

// Helper to run reel generator Python script
function triggerReelGeneration(jobId, emotion, context, preset) {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') {
    console.log(`[server] Skipping generation for cancelled/missing Job ${jobId}`);
    return;
  }

  // Enforce single active job: cancel any other running job
  if (activeJobId && activeJobId !== jobId && jobs[activeJobId] && ['processing_emotion', 'processing_reel'].includes(jobs[activeJobId].status)) {
    cancelJob(activeJobId, 'Superseded by new job generation');
  }

  activeJobId = jobId;
  const selectedPreset = preset || job.preset || REEL_PRESET;
  console.log(`[server] Spawning ${selectedPreset} reel worker for Job ${jobId} (Emotion: ${emotion})...`);
  job.status = 'processing_reel';

  // Construct clean, human-readable reel filename
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const cleanFilename = `mindstream_${dateStr}_${timeStr}_${emotion.toLowerCase()}.mp4`;
  job.reel_filename = cleanFilename;

  const contextStr = JSON.stringify(context);
  const pythonPath = path.join(__dirname, 'venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'reel_generator.py');

  const worker = spawn(pythonPath, [
    scriptPath,
    '--job-id', jobId,
    '--emotion', emotion,
    '--context', contextStr,
    '--preset', selectedPreset,
    '--output-filename', cleanFilename
  ], {
    cwd: __dirname,
    // PYTHONUNBUFFERED=1 forces Python stdout/stderr to flush immediately line-by-line
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  job.process = worker;

  // Stream python stdout directly to terminal without prepending [reel:xxxx]
  worker.stdout.on('data', (data) => {
    if (job.status === 'cancelled') return;
    process.stdout.write(data);
  });

  let stderrBuf = '';
  worker.stderr.on('data', (data) => {
    if (job.status === 'cancelled') return;
    stderrBuf += data.toString();
    process.stderr.write(data);
  });

  worker.on('close', (code) => {
    job.process = null;

    if (job.status === 'cancelled') {
      console.log(`[server] Job ${jobId} worker process terminated (cancelled).`);
      return;
    }

    if (code === 0) {
      console.log(`[server] ✓ Reel ready for Job ${jobId} -> ${cleanFilename}`);
      jobs[jobId] = {
        ...jobs[jobId],
        status: 'ready',
        reel_url: `http://localhost:4000/reels/${cleanFilename}`,
        emotion_label: emotion,
        completed_at: new Date().toISOString()
      };
    } else {
      const snippet = stderrBuf.slice(-400);
      console.error(`[server] ✗ Reel worker exited with code ${code}`);
      jobs[jobId] = {
        ...jobs[jobId],
        status: 'failed',
        error: `Worker exited ${code}: ${snippet}`,
        completed_at: new Date().toISOString()
      };
    }

    if (activeJobId === jobId) {
      activeJobId = null;
    }
  });
}

/**
 * Spawns predict_emotion.py for the given clip path.
 * The script writes a _result.json file which the chokidar watcher picks up
 * and calls triggerReelGeneration automatically.
 */
function spawnEmotionDetection(jobId, clipPath) {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') return;

  const pythonPath = path.join(__dirname, 'venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'predict_emotion.py');

  // Resolve clip path: if relative, resolve from Downloads/mindstream_captures
  let absoluteClipPath = clipPath;
  if (!path.isAbsolute(clipPath)) {
    absoluteClipPath = path.join(CAPTURE_FOLDER, path.basename(clipPath));
  }

  console.log(`[server] Spawning emotion detection for Job ${jobId}: ${path.basename(absoluteClipPath)}`);

  const worker = spawn(pythonPath, [scriptPath, '--clip', absoluteClipPath], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  job.process = worker;

  worker.stdout.on('data', (data) => {
    process.stdout.write(data);
  });

  worker.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  worker.on('close', (code) => {
    job.process = null;
    if (job.status === 'cancelled') return;

    if (code !== 0) {
      console.error(`[server] Emotion detection failed for Job ${jobId} (exit ${code})`);
      // chokidar will still pick up the error JSON written by predict_emotion.py
      // and mark the job as failed via the watcher handler below.
    }
  });
}

// POST /check-in
app.post('/check-in', (req, res) => {
  const { session_id, context, clip_path, preset } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  // Cancel any existing running job to ensure single active generation session
  if (activeJobId && activeJobId !== session_id && jobs[activeJobId] && ['processing_emotion', 'processing_reel'].includes(jobs[activeJobId].status)) {
    cancelJob(activeJobId, 'Superseded by new check-in session');
  }

  activeJobId = session_id;
  const selectedPreset = preset || REEL_PRESET;
  console.log(`[server] New check-in request. Session ID: ${session_id}, Preset: ${selectedPreset}, Clip: ${clip_path}`);

  jobs[session_id] = {
    status: 'processing_emotion',
    context: context || {},
    clip_path: clip_path || null,
    preset: selectedPreset,
    created_at: new Date().toISOString(),
    process: null
  };

  // Check if we already received the emotion detection result for this clip file
  // (race condition guard: result JSON arrived before check-in POST)
  if (clip_path) {
    const baseName = path.basename(clip_path, '.webm');
    if (pendingResults[baseName]) {
      console.log(`[server] Consuming pre-cached result for: ${baseName}`);
      const result = pendingResults[baseName];
      delete pendingResults[baseName];

      if (result.emotion && result.emotion.label) {
        triggerReelGeneration(session_id, result.emotion.label, context, selectedPreset);
      } else {
        jobs[session_id].status = 'failed';
        jobs[session_id].error = result.error || 'Emotion detection failed';
      }
      res.json({ job_id: session_id });
      return;
    }

    // Spawn Phase 2 inference — predict_emotion.py writes _result.json
    // which the chokidar watcher below picks up and calls triggerReelGeneration.
    spawnEmotionDetection(session_id, clip_path);
  } else {
    console.warn(`[server] check-in received without clip_path for Job ${session_id} — cannot run emotion detection`);
    jobs[session_id].status = 'failed';
    jobs[session_id].error = 'No clip path provided';
  }

  res.json({ job_id: session_id });
});

// GET /jobs/:id
app.get('/jobs/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const { process: _proc, ...jobData } = job;
  res.json(jobData);
});

// POST /jobs/:id/cancel
app.post('/jobs/:id/cancel', (req, res) => {
  const jobId = req.params.id;
  const job = jobs[jobId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  cancelJob(jobId, 'Cancelled via API request');
  res.json({ status: 'cancelled', job_id: jobId });
});

// GET /health — returns server status and which required API keys are configured.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    keys: {
      gemini:  !!process.env.GEMINI_API_KEY,
      pexels:  !!process.env.PEXELS_API_KEY,
      mimo:    !!process.env.MIMO_API_KEY,
      groq:    !!process.env.GROQ_API_KEY,     // optional
      pixabay: !!process.env.PIXABAY_API_KEY,  // optional
    },
  });
});

app.use('/reels', express.static(path.join(__dirname, 'output', 'reels')));

// Start the Chokidar directory watcher (watching for Phase 2 result JSON files)
chokidar.watch(CAPTURE_FOLDER, { ignored: /capture_.*\.webm$/ })
  .on('add', (filePath) => {
    if (!filePath.endsWith('_result.json')) return;

    console.log(`[server] Detected new result JSON file: ${filePath}`);
    const baseName = path.basename(filePath, '_result.json');

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const result = JSON.parse(fileContent);

      const jobId = Object.keys(jobs).find(id => {
        const job = jobs[id];
        return job.clip_path && job.clip_path.includes(baseName);
      });

      if (jobId) {
        const job = jobs[jobId];
        if (job && job.status !== 'cancelled') {
          console.log(`[server] Found matching job ${jobId} for result: ${baseName}`);
          if (result.emotion && result.emotion.label) {
            triggerReelGeneration(jobId, result.emotion.label, job.context, job.preset);
          } else {
            job.status = 'failed';
            job.error = result.error || 'Emotion detection failed';
          }
        }
      } else {
        console.log(`[server] Job not found for result: ${baseName}. Pre-caching result...`);
        pendingResults[baseName] = result;
      }
    } catch (err) {
      console.error(`[server] Error processing result JSON: ${err.message}`);
    }
  });

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`[server] MindStream backend running on http://localhost:${PORT}`);
});
