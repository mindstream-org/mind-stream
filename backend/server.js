const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

// Load .env manually so the file watcher and spawned processes share the same keys.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const jobs = {};
let activeJobId = null;

const REEL_PRESET = process.env.MINDSTREAM_REEL_PRESET || 'normal';
if (!['normal', 'fast'].includes(REEL_PRESET)) {
  throw new Error("MINDSTREAM_REEL_PRESET must be 'normal' or 'fast'");
}

// Caches results that arrive before the matching check-in POST (race condition guard).
const pendingResults = {};

const CAPTURE_FOLDER = path.join(os.homedir(), 'Downloads', 'mindstream_captures');
console.log(`[server] Monitoring captures folder: ${CAPTURE_FOLDER}`);

try {
  fs.mkdirSync(CAPTURE_FOLDER, { recursive: true });
} catch (err) {
  console.error(`[server] Failed to create capture folder: ${err.message}`);
}

function cancelJob(jobId, reason = 'Job cancelled') {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') return;

  console.log(`[server] Cancelling job ${jobId}: ${reason}`);

  if (job.process) {
    try { job.process.kill('SIGTERM'); } catch (_) {}
    job.process = null;
  }

  job.status = 'cancelled';
  job.cancelled_at = new Date().toISOString();
  job.error = reason;

  if (activeJobId === jobId) activeJobId = null;
}

function triggerReelGeneration(jobId, emotion, context, preset) {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') return;

  // Cancel any other running job — only one reel generates at a time.
  if (activeJobId && activeJobId !== jobId && jobs[activeJobId] &&
      ['processing_emotion', 'processing_reel'].includes(jobs[activeJobId].status)) {
    cancelJob(activeJobId, 'Superseded by newer job');
  }

  activeJobId = jobId;
  const selectedPreset = preset || job.preset || REEL_PRESET;
  job.status = 'processing_reel';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const cleanFilename = `mindstream_${dateStr}_${timeStr}_${emotion.toLowerCase()}.mp4`;
  job.reel_filename = cleanFilename;

  console.log(`[server] Spawning ${selectedPreset} reel worker for job ${jobId} (emotion: ${emotion})`);

  const worker = spawn(
    path.join(__dirname, 'venv', 'bin', 'python'),
    [
      path.join(__dirname, 'reel_generator.py'),
      '--job-id', jobId,
      '--emotion', emotion,
      '--context', JSON.stringify(context),
      '--preset', selectedPreset,
      '--output-filename', cleanFilename,
    ],
    { cwd: __dirname, env: { ...process.env, PYTHONUNBUFFERED: '1' } }
  );

  job.process = worker;

  worker.stdout.on('data', (data) => { if (job.status !== 'cancelled') process.stdout.write(data); });

  let stderrBuf = '';
  worker.stderr.on('data', (data) => {
    if (job.status !== 'cancelled') { stderrBuf += data.toString(); process.stderr.write(data); }
  });

  worker.on('close', (code) => {
    job.process = null;
    if (job.status === 'cancelled') return;

    if (code === 0) {
      console.log(`[server] Reel ready for job ${jobId}: ${cleanFilename}`);
      jobs[jobId] = {
        ...jobs[jobId],
        status: 'ready',
        reel_url: `http://localhost:4000/reels/${cleanFilename}`,
        emotion_label: emotion,
        completed_at: new Date().toISOString(),
      };
    } else {
      console.error(`[server] Reel worker failed (exit ${code})`);
      jobs[jobId] = {
        ...jobs[jobId],
        status: 'failed',
        error: `Worker exited ${code}: ${stderrBuf.slice(-400)}`,
        completed_at: new Date().toISOString(),
      };
    }

    if (activeJobId === jobId) activeJobId = null;
  });
}

// Spawns predict_emotion.py. On completion it writes _result.json which
// the chokidar watcher picks up to trigger reel generation.
function spawnEmotionDetection(jobId, clipPath) {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') return;

  let absoluteClipPath = clipPath;
  if (!path.isAbsolute(clipPath)) {
    absoluteClipPath = path.join(CAPTURE_FOLDER, path.basename(clipPath));
  }

  console.log(`[server] Spawning emotion detection for job ${jobId}: ${path.basename(absoluteClipPath)}`);

  const worker = spawn(
    path.join(__dirname, 'venv', 'bin', 'python'),
    [path.join(__dirname, 'predict_emotion.py'), '--clip', absoluteClipPath],
    { cwd: __dirname, env: { ...process.env, PYTHONUNBUFFERED: '1' } }
  );

  job.process = worker;
  worker.stdout.on('data', (data) => process.stdout.write(data));
  worker.stderr.on('data', (data) => process.stderr.write(data));

  worker.on('close', (code) => {
    job.process = null;
    if (job.status === 'cancelled') return;
    if (code !== 0) {
      console.error(`[server] Emotion detection failed for job ${jobId} (exit ${code})`);
    }
  });
}

app.post('/check-in', (req, res) => {
  const { session_id, context, clip_path, preset } = req.body;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  if (activeJobId && activeJobId !== session_id && jobs[activeJobId] &&
      ['processing_emotion', 'processing_reel'].includes(jobs[activeJobId].status)) {
    cancelJob(activeJobId, 'Superseded by new check-in');
  }

  activeJobId = session_id;
  const selectedPreset = preset || REEL_PRESET;
  console.log(`[server] Check-in: session=${session_id}, preset=${selectedPreset}, clip=${clip_path}`);

  jobs[session_id] = {
    status: 'processing_emotion',
    context: context || {},
    clip_path: clip_path || null,
    preset: selectedPreset,
    created_at: new Date().toISOString(),
    process: null,
  };

  if (clip_path) {
    const baseName = path.basename(clip_path, '.webm');

    if (pendingResults[baseName]) {
      const result = pendingResults[baseName];
      delete pendingResults[baseName];
      if (result.emotion?.label) {
        triggerReelGeneration(session_id, result.emotion.label, context, selectedPreset);
      } else {
        jobs[session_id].status = 'failed';
        jobs[session_id].error = result.error || 'Emotion detection failed';
      }
    } else {
      spawnEmotionDetection(session_id, clip_path);
    }
  } else {
    console.warn(`[server] No clip_path for job ${session_id}`);
    jobs[session_id].status = 'failed';
    jobs[session_id].error = 'No clip path provided';
  }

  res.json({ job_id: session_id });
});

app.get('/jobs/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { process: _proc, ...jobData } = job;
  res.json(jobData);
});

app.post('/jobs/:id/cancel', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  cancelJob(req.params.id, 'Cancelled via API');
  res.json({ status: 'cancelled', job_id: req.params.id });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    keys: {
      gemini:  !!process.env.GEMINI_API_KEY,
      pexels:  !!process.env.PEXELS_API_KEY,
      mimo:    !!process.env.MIMO_API_KEY,
      groq:    !!process.env.GROQ_API_KEY,
      pixabay: !!process.env.PIXABAY_API_KEY,
    },
  });
});

app.use('/reels', express.static(path.join(__dirname, 'output', 'reels')));

chokidar.watch(CAPTURE_FOLDER, { ignored: /capture_.*\.webm$/ })
  .on('add', (filePath) => {
    if (!filePath.endsWith('_result.json')) return;

    const baseName = path.basename(filePath, '_result.json');
    console.log(`[server] Result JSON detected: ${path.basename(filePath)}`);

    try {
      const result = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const jobId = Object.keys(jobs).find((id) => {
        const job = jobs[id];
        return job.clip_path && job.clip_path.includes(baseName);
      });

      if (jobId) {
        const job = jobs[jobId];
        if (job && job.status !== 'cancelled') {
          if (result.emotion?.label) {
            triggerReelGeneration(jobId, result.emotion.label, job.context, job.preset);
          } else {
            job.status = 'failed';
            job.error = result.error || 'Emotion detection failed';
          }
        }
      } else {
        pendingResults[baseName] = result;
      }
    } catch (err) {
      console.error(`[server] Failed to process result JSON: ${err.message}`);
    }
  });

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`[server] MindStream backend running on http://localhost:${PORT}`);
});
