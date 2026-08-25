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
const REEL_FOLDER = path.join(__dirname, 'output', 'reels');
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
    try { job.process.kill('SIGTERM'); } catch { /* already exited */ }
    job.process = null;
  }

  job.status = 'cancelled';
  job.cancelled_at = new Date().toISOString();
  job.error = reason;

  if (activeJobId === jobId) activeJobId = null;
}

function reelTimestamp(filename) {
  const match = filename.match(/^mindstream_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  return new Date(y, m - 1, d, hh, mm, ss).getTime();
}

function listReels() {
  let entries;

  try {
    entries = fs.readdirSync(REEL_FOLDER, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && /^mindstream_.+\.mp4$/.test(entry.name))
    .map((entry) => {
      const timestamp = reelTimestamp(entry.name);
      const emotionMatch = entry.name.match(/_([a-z]+)\.mp4$/);

      return {
        filename: entry.name,
        emotion: emotionMatch ? emotionMatch[1] : 'neutral',
        created_at: timestamp ? new Date(timestamp).toISOString() : null,
        url: `http://127.0.0.1:${PORT}/reels/${encodeURIComponent(entry.name)}`,
      };
    })
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

function clipTimestamp(filename) {
  const match = filename.match(/^capture_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, date, hh, mm, ss] = match;
  return new Date(`${date}T${hh}:${mm}:${ss}Z`).getTime();
}

// Clips precede generation, so the reel's own timestamp finds its clip: nearest
// match inside a window wide enough to allow for generation time.
function deleteReel(filename) {
  const reelPath = path.join(REEL_FOLDER, path.basename(filename));
  let deleted = 0;
  let failed = 0;

  try {
    fs.unlinkSync(reelPath);
    deleted += 1;
  } catch (error) {
    if (error.code === 'ENOENT') return { deleted: 0, failed: 0, reel: false };
    failed += 1;
  }

  const reelTime = reelTimestamp(filename);
  if (reelTime != null) {
    let clipEntries = [];
    try {
      clipEntries = fs.readdirSync(CAPTURE_FOLDER, { withFileTypes: true });
    } catch { /* no captures folder yet */ }

    const closest = clipEntries
      .filter((entry) => entry.isFile())
      .map((entry) => ({ name: entry.name, time: clipTimestamp(entry.name) }))
      .filter((entry) => entry.time != null && Math.abs(entry.time - reelTime) <= 15 * 60 * 1000)
      .sort((a, b) => Math.abs(a.time - reelTime) - Math.abs(b.time - reelTime))[0];

    if (closest) {
      const clipBase = closest.name.replace(/\.webm$/, '');
      for (const target of [closest.name, `${clipBase}_result.json`]) {
        try {
          fs.unlinkSync(path.join(CAPTURE_FOLDER, target));
          deleted += 1;
        } catch (error) {
          if (error.code !== 'ENOENT') failed += 1;
        }
      }
    }
  }

  return { deleted, failed, reel: true };
}

function triggerReelGeneration(jobId, emotion, context, preset) {
  const job = jobs[jobId];
  if (!job || job.status === 'cancelled') return;

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
        reel_url: `http://127.0.0.1:${PORT}/reels/${cleanFilename}`,
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

app.get('/saved-data/reels', (_req, res) => {
  try {
    res.json({ reels: listReels() });
  } catch (error) {
    console.error(`[server] Failed to list saved reels: ${error.message}`);
    res.status(500).json({ error: 'Could not list saved reels.' });
  }
});

app.delete('/saved-data/reels/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^mindstream_.+\.mp4$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid reel filename.' });
  }

  try {
    const result = deleteReel(filename);
    if (!result.reel) {
      return res.status(404).json({ error: 'Reel not found.' });
    }
    res.status(result.failed ? 207 : 200).json({
      status: result.failed ? 'partially_deleted' : 'deleted',
      deleted: result.deleted,
      failed: result.failed,
    });
  } catch (error) {
    console.error(`[server] Failed to delete reel ${filename}: ${error.message}`);
    res.status(500).json({ error: 'Could not delete the reel.' });
  }
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
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] MindStream backend running on http://127.0.0.1:${PORT}`);
});
