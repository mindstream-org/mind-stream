import {
  ALARM_NAMES,
  CYCLE_STATUS,
  MESSAGE_TYPES,
  NOTIFICATION_IDS,
  PULSE_THRESHOLD_MINUTES,
  JOB_POLL_INTERVAL_MINUTES,
  STORAGE_KEYS,
  API_ROUTES,
  CAPTURE_WINDOW,
} from "../lib/constants.js";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// --- Storage helpers (background always runs in the extension context,
// so this can talk to chrome.storage.local directly). ------------------
const DEFAULT_CYCLE = {
  cycle_status: CYCLE_STATUS.IDLE,
  cycle_started_at: null,
  job_id: null,
  reel_url: null,
  emotion_label: null,
  error_message: null,
  // Persisted (not an in-memory module variable!) specifically so this
  // survives the service worker being unloaded and restarted, which
  // happens constantly in MV3 — an in-memory tracker would silently
  // forget about an open capture window and let a second one spawn.
  capture_window_id: null,
};

async function getCycle() {
  const { [STORAGE_KEYS.CYCLE]: cycle } = await chrome.storage.local.get(STORAGE_KEYS.CYCLE);
  return { ...DEFAULT_CYCLE, ...(cycle ?? {}) };
}

async function setCycle(patch) {
  const current = await getCycle();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.CYCLE]: next });
  return next;
}

async function openSidePanel() {
  const window = await chrome.windows.getCurrent();
  if (window?.id != null) {
    await chrome.sidePanel.open({ windowId: window.id });
  }
}

/** True only if a window with this id genuinely still exists. */
async function windowStillExists(windowId) {
  if (windowId == null) return false;
  try {
    await chrome.windows.get(windowId);
    return true;
  } catch {
    return false; // closed, or the id is stale from a previous session
  }
}

/**
 * Moves a fresh cycle into "pending" and opens the capture window — or, if
 * one's already open for the current cycle, just focuses it instead of
 * spawning a second one. Shared by every entry point that can start a
 * check-in: the pulse notification, and the panel's own "Yes" button.
 */
async function startCheckInCycle() {
  const cycle = await getCycle();

  // Don't allow starting a new check-in if one is already in progress or ready to view
  if (cycle.cycle_status === CYCLE_STATUS.PENDING) {
    // If the capture window is still open, just focus it
    if (await windowStillExists(cycle.capture_window_id)) {
      console.log("[mindstream] capture window already open, focusing it instead of opening another");
      await chrome.windows.update(cycle.capture_window_id, { focused: true });
      return;
    }
    // If a job is already submitted (capture window closed, generation running),
    // block new check-ins and show the side panel's "generating" view instead.
    if (cycle.job_id) {
      console.log("[mindstream] generation already in progress (job_id:", cycle.job_id, ") — opening side panel");
      await openSidePanel();
      return;
    }
  }

  if (cycle.cycle_status === CYCLE_STATUS.READY) {
    console.log("[mindstream] previous reel not viewed yet, opening side panel instead of starting new check-in");
    await openSidePanel();
    return;
  }

  await setCycle({
    cycle_status: CYCLE_STATUS.PENDING,
    cycle_started_at: new Date().toISOString(),
    job_id: null,
    error_message: null,
  });

  const window = await chrome.windows.create({
    url: chrome.runtime.getURL(CAPTURE_WINDOW.URL),
    type: "popup",
    width: CAPTURE_WINDOW.WIDTH,
    height: CAPTURE_WINDOW.HEIGHT,
    focused: true,
  });

  await setCycle({ capture_window_id: window.id });
  chrome.alarms.create(ALARM_NAMES.JOB_POLL, { periodInMinutes: JOB_POLL_INTERVAL_MINUTES });
}

/**
 * Registered once, at module scope — not inside startCheckInCycle, which
 * was adding a fresh duplicate listener on every single check-in.
 *
 * Self-heals the "user just clicked the window's close button" case: if
 * the capture window disappears before anything was ever submitted, the
 * cycle would otherwise be stuck showing "pending" forever with no way to
 * start over. If it closes *after* submission (job_id is set), that's the
 * normal/expected close — leave the cycle alone and let job polling continue.
 */
chrome.windows.onRemoved.addListener(async (windowId) => {
  const cycle = await getCycle();
  if (cycle.capture_window_id !== windowId) return;

  if (cycle.cycle_status === CYCLE_STATUS.PENDING && !cycle.job_id) {
    console.log("[mindstream] capture window closed before submitting anything — resetting to idle");
    await setCycle({ cycle_status: CYCLE_STATUS.IDLE, capture_window_id: null, cycle_started_at: null });
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
  } else {
    await setCycle({ capture_window_id: null });
  }
});

// --- Lifecycle: set up the recurring pulse alarm on install -----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAMES.PULSE, { periodInMinutes: PULSE_THRESHOLD_MINUTES });
});

// --- Alarms --------------------------------------------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAMES.PULSE) {
    await handlePulseTick();
  } else if (alarm.name === ALARM_NAMES.JOB_POLL) {
    await handleJobPoll();
  }
});

/**
 * Implements the "prevent stacked/duplicate check-ins" logic from
 * MINDSTREAM_PROJECT_SUMMARY.md §4a.
 */
async function handlePulseTick() {
  const cycle = await getCycle();

  switch (cycle.cycle_status) {
    case CYCLE_STATUS.PENDING:
      // Already in flight — do nothing, let the alarm fire again later.
      return;

    case CYCLE_STATUS.READY:
      // Finished but unviewed — nudge again rather than starting a new cycle.
      createReadyNotification();
      return;

    case CYCLE_STATUS.IDLE:
    case CYCLE_STATUS.FAILED:
    default:
      chrome.notifications.create(NOTIFICATION_IDS.PULSE_PROMPT, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Quick check-in?",
        message: "Want a quick snap check-in to reset your focus?",
        priority: 1,
      });
  }
}

function createReadyNotification() {
  chrome.notifications.create(NOTIFICATION_IDS.REEL_READY, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "Your snap is ready",
    message: "Wanna have a look?",
    priority: 1,
  });
}

/** Polls the local backend for job completion (project summary §7, Phase 3). */
async function handleJobPoll() {
  const cycle = await getCycle();
  if (cycle.cycle_status !== CYCLE_STATUS.PENDING || !cycle.job_id) {
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
    return;
  }

  try {
    const response = await fetch(API_ROUTES.JOB_STATUS(cycle.job_id));
    if (!response.ok) throw new Error(`job status request failed: ${response.status}`);
    const data = await response.json(); // expected: { status, reel_url?, emotion_label?, error? }

    if (data.status === "ready") {
      chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
      await setCycle({
        cycle_status: CYCLE_STATUS.READY,
        reel_url: data.reel_url ?? null,
        emotion_label: data.emotion_label ?? null,
        capture_window_id: null,
      });
      createReadyNotification();
    } else if (data.status === "failed") {
      chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
      await setCycle({
        cycle_status: CYCLE_STATUS.FAILED,
        error_message: data.error ?? "Something went wrong while generating your reel.",
        capture_window_id: null,
      });
      chrome.notifications.create(NOTIFICATION_IDS.REEL_ERROR, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "That one didn't come together",
        message: "We hit an error putting your reel together.",
        priority: 1,
      });
    }
    // status === "processing" -> nothing to do, poll again next tick.
  } catch (err) {
    // Backend not reachable (e.g. local server isn't running yet during dev).
    // Don't fail the cycle over a transient network error — just try again.
    console.warn("job poll failed:", err);
  }
}

// --- Notification clicks --------------------------------------------------
chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);

  if (notificationId === NOTIFICATION_IDS.PULSE_PROMPT) {
    await startCheckInCycle();
    return;
  }

  if (notificationId === NOTIFICATION_IDS.REEL_READY || notificationId === NOTIFICATION_IDS.REEL_ERROR) {
    await openSidePanel();
  }
});

// --- Messages from the panel and the capture window -----------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.START_CHECKIN) {
    startCheckInCycle().then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }

  if (message?.type === MESSAGE_TYPES.CANCEL_CHECKIN) {
    // The confirm step's "Not now" — discard the clip, reset the cycle.
    // The window closes itself; onRemoved above is a no-op by the time it
    // fires since capture_window_id is already cleared here.
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
    setCycle({
      cycle_status: CYCLE_STATUS.IDLE,
      capture_window_id: null,
      cycle_started_at: null,
      job_id: null,
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.CANCEL_GENERATION) {
    // User wants to abort the in-progress generation and start over.
    // Reset the cycle to idle so a new check-in can begin.
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
    setCycle({
      cycle_status: CYCLE_STATUS.IDLE,
      capture_window_id: null,
      cycle_started_at: null,
      job_id: null,
      error_message: null,
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
