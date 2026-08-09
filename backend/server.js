const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const chokidar = require('chokidar');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory job state tracker
const jobs = {};

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

// Helper to run reel generator Python script
function triggerReelGeneration(jobId, emotion, context) {
  console.log(`[server] Spawning reel worker for Job ${jobId} (Emotion: ${emotion})...`);
  jobs[jobId].status = 'processing_reel';

  const contextStr = JSON.stringify(context);
  const pythonPath = path.join(__dirname, 'venv', 'bin', 'python');
  const scriptPath = path.join(__dirname, 'reel_generator.py');

  const worker = spawn(pythonPath, [
    scriptPath,
    '--job-id', jobId,
    '--emotion', emotion,
    '--context', contextStr
  ], {
    cwd: __dirname
  });

  // Pipe Python stdout straight to the server terminal so you can follow progress
  worker.stdout.on('data', (data) => {
    process.stdout.write(`[reel:${jobId.slice(0,8)}] ${data}`);
  });

  let stderrBuf = '';
  worker.stderr.on('data', (data) => {
    stderrBuf += data.toString();
    // Also print stderr live so tracebacks appear immediately
    process.stderr.write(`[reel:${jobId.slice(0,8)}:ERR] ${data}`);
  });

  worker.on('close', (code) => {
    if (code === 0) {
      console.log(`[server] ✓ Reel ready for Job ${jobId}`);
      jobs[jobId] = {
        status: 'ready',
        reel_url: `http://localhost:4000/reels/${jobId}.mp4`,
        emotion_label: emotion,
        completed_at: new Date().toISOString()
      };
    } else {
      const snippet = stderrBuf.slice(-400);
      console.error(`[server] ✗ Reel worker exited with code ${code}`);
      jobs[jobId] = {
        status: 'failed',
        error: `Worker exited ${code}: ${snippet}`,
        completed_at: new Date().toISOString()
      };
    }
  });
}

// POST /check-in
app.post('/check-in', (req, res) => {
  const { session_id, context, clip_path } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  console.log(`[server] New check-in request. Session ID: ${session_id}, Clip: ${clip_path}`);

  // Create job entry
  jobs[session_id] = {
    status: 'processing_emotion',
    context: context || {},
    clip_path: clip_path || null,
    created_at: new Date().toISOString()
  };

  // Check if we already received the emotion detection result for this clip file
  if (clip_path) {
    const baseName = path.basename(clip_path, '.webm');
    if (pendingResults[baseName]) {
      console.log(`[server] Consuming pre-cached result for: ${baseName}`);
      const result = pendingResults[baseName];
      delete pendingResults[baseName];

      if (result.emotion && result.emotion.label) {
        triggerReelGeneration(session_id, result.emotion.label, context);
      } else {
        jobs[session_id].status = 'failed';
        jobs[session_id].error = result.error || 'Emotion detection failed';
      }
    }
  }

  res.json({ job_id: session_id });
});

// GET /jobs/:id
app.get('/jobs/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Serve compiled reel assets
app.use('/reels', express.static(path.join(__dirname, 'output', 'reels')));

// Start the Chokidar directory watcher (watching for Phase 2 result JSON files)
chokidar.watch(CAPTURE_FOLDER, { ignored: /capture_.*\.webm$/ })
  .on('add', (filePath) => {
    if (!filePath.endsWith('_result.json')) return;

    console.log(`[server] Detected new result JSON file: ${filePath}`);
    const baseName = path.basename(filePath, '_result.json'); // e.g. capture_2026-07-18T10-45-00

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const result = JSON.parse(fileContent);

      // Find the corresponding check-in job
      const jobId = Object.keys(jobs).find(id => {
        const job = jobs[id];
        return job.clip_path && job.clip_path.includes(baseName);
      });

      if (jobId) {
        console.log(`[server] Found matching job ${jobId} for result: ${baseName}`);
        if (result.emotion && result.emotion.label) {
          triggerReelGeneration(jobId, result.emotion.label, jobs[jobId].context);
        } else {
          jobs[jobId].status = 'failed';
          jobs[jobId].error = result.error || 'Emotion detection failed';
        }
      } else {
        // Cache it, in case the extension check-in payload POST hasn't completed yet
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
