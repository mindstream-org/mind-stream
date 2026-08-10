// Central constants shared by the panel UI, background worker, and hooks.

export const PANEL_STATE = {
  IDLE: "idle",
  PENDING: "pending",
  SKELETON: "skeleton",
  CAPTURE: "capture",
  CONFIRM: "confirm",
  COUNTDOWN: "countdown",
  READY: "ready",
  PLAYER: "player",
  ERROR: "error",
};

// Persisted in chrome.storage.local. The panel UI is derived from this.
export const CYCLE_STATUS = {
  IDLE: "idle",
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
};

export const STORAGE_KEYS = {
  CYCLE: "mindstream_cycle",
  SETTINGS: "mindstream_settings",
};

export const GENERATION_PRESETS = {
  NORMAL: "normal",
  FAST: "fast",
};

export const DEFAULT_SETTINGS = {
  preset: GENERATION_PRESETS.NORMAL,
  user_name: "Friend",
  onboarding_complete: false,
};

export const MESSAGE_TYPES = {
  START_CHECKIN: "START_CHECKIN",
  CANCEL_CHECKIN: "CANCEL_CHECKIN",
  CANCEL_GENERATION: "CANCEL_GENERATION",
  CLIP_SAVED: "CLIP_SAVED",
};

export const CAPTURE_WINDOW = {
  URL: "src/capture/capture.html",
  WIDTH: 440,
  HEIGHT: 720,
};

export const ALARM_NAMES = {
  PULSE: "mindstream-pulse-timer",
  JOB_POLL: "mindstream-job-poll",
};

export const NOTIFICATION_IDS = {
  PULSE_PROMPT: "mindstream-pulse-prompt",
  REEL_READY: "mindstream-reel-ready",
  REEL_ERROR: "mindstream-reel-error",
};

export const CAPTURE_DURATION_MS = 3000;
export const COUNTDOWN_SECONDS = 4;
export const PULSE_THRESHOLD_MINUTES = 25;
// chrome.alarms enforces a minimum repeat period of ~1 minute.
export const JOB_POLL_INTERVAL_MINUTES = 1;

export const API_BASE = "http://localhost:4000";

export const API_ROUTES = {
  CHECK_IN: `${API_BASE}/check-in`,
  JOB_STATUS: (jobId) => `${API_BASE}/jobs/${jobId}`,
  CANCEL_JOB: (jobId) => `${API_BASE}/jobs/${jobId}/cancel`,
  HEALTH: `${API_BASE}/health`,
};

// Clips are saved to ~/Downloads/mindstream_captures/ via chrome.downloads.
export const CAPTURE_FOLDER = "mindstream_captures";

// 8 FER+ class labels, passed as-is to Phase 3 (reel_generator.py).
export const EMOTION_CATEGORIES = [
  "angry",
  "contempt",
  "disgust",
  "fear",
  "happy",
  "neutral",
  "sad",
  "surprise",
];
