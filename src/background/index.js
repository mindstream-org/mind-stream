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
import { buildCheckInPayload } from "../lib/checkIn.js";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// capture_window_id is persisted (not in-memory) so it survives MV3 service worker restarts.
const DEFAULT_CYCLE = {
  cycle_status: CYCLE_STATUS.IDLE,
  cycle_started_at: null,
  job_id: null,
  clip_path: null,
  reel_url: null,
  emotion_label: null,
  error_message: null,
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

async function windowStillExists(windowId) {
  if (windowId == null) return false;
  try {
    await chrome.windows.get(windowId);
    return true;
  } catch {
    return false;
  }
}

async function startCheckInCycle() {
  const cycle = await getCycle();

  if (cycle.cycle_status === CYCLE_STATUS.PENDING) {
    if (await windowStillExists(cycle.capture_window_id)) {
      await chrome.windows.update(cycle.capture_window_id, { focused: true });
      return;
    }
    if (cycle.job_id || cycle.clip_path) {
      await openSidePanel();
      return;
    }
  }

  if (cycle.cycle_status === CYCLE_STATUS.READY) {
    await openSidePanel();
    return;
  }

  await setCycle({
    cycle_status: CYCLE_STATUS.PENDING,
    cycle_started_at: new Date().toISOString(),
    job_id: null,
    clip_path: null,
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

// If the capture window closes before the user submits anything, reset to idle.
// If it closes after a clip was saved or job submitted, that's the normal flow.
chrome.windows.onRemoved.addListener(async (windowId) => {
  const cycle = await getCycle();
  if (cycle.capture_window_id !== windowId) return;

  if (cycle.cycle_status === CYCLE_STATUS.PENDING && !cycle.job_id && !cycle.clip_path) {
    await setCycle({ cycle_status: CYCLE_STATUS.IDLE, capture_window_id: null, cycle_started_at: null });
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
  } else {
    await setCycle({ capture_window_id: null });
  }
});

async function ensurePulseAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAMES.PULSE);
  if (!alarm) {
    chrome.alarms.create(ALARM_NAMES.PULSE, { periodInMinutes: PULSE_THRESHOLD_MINUTES });
  }
}

chrome.runtime.onInstalled.addListener(() => ensurePulseAlarm());
chrome.runtime.onStartup?.addListener(() => ensurePulseAlarm());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAMES.PULSE) await handlePulseTick();
  else if (alarm.name === ALARM_NAMES.JOB_POLL) await handleJobPoll();
});

async function handlePulseTick() {
  const cycle = await getCycle();

  switch (cycle.cycle_status) {
    case CYCLE_STATUS.PENDING:
      return; // already in flight

    case CYCLE_STATUS.READY:
      createReadyNotification(); // nudge without starting a new cycle
      return;

    case CYCLE_STATUS.IDLE:
    case CYCLE_STATUS.FAILED:
    default:
      chrome.notifications.create(NOTIFICATION_IDS.PULSE_PROMPT, {
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "Quick check-in?",
        message: "Want a quick snap check-in to reset your focus?",
        buttons: [{ title: "Start Check-in" }, { title: "Not Now" }],
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
    buttons: [{ title: "Watch Reel" }, { title: "Later" }],
    priority: 1,
  });
}

let activePollTimeout = null;

async function pollActiveJob() {
  if (activePollTimeout) {
    clearTimeout(activePollTimeout);
    activePollTimeout = null;
  }

  const cycle = await getCycle();
  if (cycle.cycle_status !== CYCLE_STATUS.PENDING || !cycle.job_id) return;

  await handleJobPoll();

  const nextCycle = await getCycle();
  if (nextCycle.cycle_status === CYCLE_STATUS.PENDING && nextCycle.job_id) {
    activePollTimeout = setTimeout(pollActiveJob, 3000);
  }
}

async function handleJobPoll() {
  const cycle = await getCycle();
  if (cycle.cycle_status !== CYCLE_STATUS.PENDING || !cycle.job_id) {
    if (!cycle.job_id) return;
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
    return;
  }

  try {
    const response = await fetch(API_ROUTES.JOB_STATUS(cycle.job_id));
    if (!response.ok) throw new Error(`job status ${response.status}`);
    const data = await response.json();

    if (data.status === "ready") {
      chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
      if (activePollTimeout) { clearTimeout(activePollTimeout); activePollTimeout = null; }
      await setCycle({
        cycle_status: CYCLE_STATUS.READY,
        reel_url: data.reel_url ?? null,
        emotion_label: data.emotion_label ?? null,
        capture_window_id: null,
      });
      createReadyNotification();
    } else if (data.status === "failed") {
      chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
      if (activePollTimeout) { clearTimeout(activePollTimeout); activePollTimeout = null; }
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
    // status === "processing": wait for next poll
  } catch (err) {
    console.warn("job poll failed:", err);
  }
}

// Resume polling if the service worker restarts mid-job.
getCycle().then((cycle) => {
  if (cycle.cycle_status === CYCLE_STATUS.PENDING && cycle.job_id) {
    pollActiveJob();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);
  if (notificationId === NOTIFICATION_IDS.PULSE_PROMPT) {
    await startCheckInCycle();
  } else if (notificationId === NOTIFICATION_IDS.REEL_READY || notificationId === NOTIFICATION_IDS.REEL_ERROR) {
    await openSidePanel();
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  chrome.notifications.clear(notificationId);
  if (notificationId === NOTIFICATION_IDS.PULSE_PROMPT && buttonIndex === 0) {
    await startCheckInCycle();
  } else if (notificationId === NOTIFICATION_IDS.REEL_READY && buttonIndex === 0) {
    await openSidePanel();
  }
});

// Classifies the active tab domain into a broad activity category.
async function getActiveTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) return null;

    const domain = new URL(tab.url).hostname;
    let category = "browsing";

    if (domain.includes("youtube.com") || domain.includes("netflix.com") || domain.includes("twitch.tv") || domain.includes("tiktok.com")) {
      category = "entertainment";
    } else if (domain.includes("github.com") || domain.includes("stackoverflow.com") || domain.includes("developer") || domain.includes("localhost")) {
      category = "coding";
    } else if (domain.includes("linkedin.com") || domain.includes("twitter.com") || domain.includes("facebook.com") || domain.includes("instagram.com") || domain.includes("reddit.com")) {
      category = "social_media";
    } else if (domain.includes("google.com") || domain.includes("wikipedia.org") || domain.includes("medium.com")) {
      category = "research";
    } else if (domain.includes("amazon.com") || domain.includes("ebay.com") || domain.includes("shopify")) {
      category = "shopping";
    }

    return { category, domain, title: tab.title ?? "unknown" };
  } catch (e) {
    console.error("Failed to get active tab info:", e);
    return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.START_CHECKIN) {
    startCheckInCycle().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === MESSAGE_TYPES.CANCEL_CHECKIN || message?.type === MESSAGE_TYPES.CANCEL_GENERATION) {
    chrome.alarms.clear(ALARM_NAMES.JOB_POLL);
    getCycle().then((cycle) => {
      if (cycle.job_id) {
        fetch(API_ROUTES.CANCEL_JOB(cycle.job_id), { method: "POST" }).catch((err) =>
          console.warn("[background] Failed to cancel job:", err)
        );
      }
      setCycle({
        cycle_status: CYCLE_STATUS.IDLE,
        capture_window_id: null,
        cycle_started_at: null,
        job_id: null,
        clip_path: null,
        error_message: null,
      }).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message?.type === MESSAGE_TYPES.CLIP_SAVED) {
    setCycle({ clip_path: message.clipPath });

    Promise.all([
      getActiveTabInfo(),
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS),
    ]).then(async ([tabInfo, { [STORAGE_KEYS.SETTINGS]: settings }]) => {
      const payload = buildCheckInPayload({ tabInfo, settings });
      payload.clip_path = message.clipPath;

      try {
        const response = await fetch(API_ROUTES.CHECK_IN, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(`Check-in failed: ${response.status}`);
        const data = await response.json();

        await setCycle({ clip_path: message.clipPath, job_id: data.job_id });
        pollActiveJob();
      } catch (err) {
        console.error("[background] Check-in failed:", err);
        await setCycle({
          cycle_status: CYCLE_STATUS.FAILED,
          error_message: "Could not connect to the local server on port 4000. Run 'npm start' in the backend directory.",
        });
      }
    });

    sendResponse({ ok: true });
    return true;
  }
});
