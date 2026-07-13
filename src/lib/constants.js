// Central place for every "magic string" the extension uses.
// Keeping these here means the panel UI, the background worker, and the
// hooks all agree on the same vocabulary without importing each other.

/** Visual states the side panel can render. Maps ~1:1 to design states. */
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

/**
 * Persisted check-in cycle status (see MINDSTREAM_PROJECT_SUMMARY.md §4a).
 * This is the source of truth in chrome.storage.local — the panel UI is a
 * function of this, not the other way around.
 */
export const CYCLE_STATUS = {
  IDLE: "idle",
  PENDING: "pending",
  READY: "ready",
  FAILED: "failed",
};

export const STORAGE_KEYS = {
  CYCLE: "mindstream_cycle",
};

export const MESSAGE_TYPES = {
  START_CHECKIN: "START_CHECKIN",
  CANCEL_CHECKIN: "CANCEL_CHECKIN",
  CANCEL_GENERATION: "CANCEL_GENERATION",
};

export const CAPTURE_WINDOW = {
  URL: "src/capture/capture.html",
  // Portrait, matching the 9:16 reel/film-strip visual language used
  // everywhere else — the old 480x400 landscape window is what was
  // cropping the camera preview.
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

// --- Timings -----------------------------------------------------------
export const CAPTURE_DURATION_MS = 3000;
export const COUNTDOWN_SECONDS = 4;

/** How long the user needs to be active before the next pulse prompt. */
export const PULSE_THRESHOLD_MINUTES = 25;

/**
 * chrome.alarms enforces a practical minimum period of ~1 minute for
 * repeating alarms. Poll at that floor; the backend job usually finishes
 * well under a minute anyway per the latency budget in the project summary.
 */
export const JOB_POLL_INTERVAL_MINUTES = 1;

// --- Backend -------------------------------------------------------------
// TODO: confirm this against whatever port the local Express server binds.
export const API_BASE = "http://localhost:4000";

export const API_ROUTES = {
  CHECK_IN: `${API_BASE}/check-in`,
  JOB_STATUS: (jobId) => `${API_BASE}/jobs/${jobId}`,
};

// --- Emotion categories ---------------------------------------------------
// Keep this small and high-confidence per the open question in the project
// summary — this list is the contract between the inference step and the
// asset library (background clip + audio pairs keyed by these labels).
export const EMOTION_CATEGORIES = [
  "frustrated",
  "fatigued",
  "distracted",
  "anxious",
  "neutral",
];
