import { CAPTURE_FOLDER } from "./constants.js";
import { isExtensionContext } from "./chromeApi.js";

/** Builds the extension → backend payload per the project summary's contract. */
export function buildCheckInPayload({ tabInfo, settings } = {}) {
  const preset = settings?.preset ?? "normal";
  const userName = settings?.user_name ?? tabInfo?.userName ?? "friend";

  return {
    session_id: crypto.randomUUID(),
    captured_at: new Date().toISOString(),
    preset,
    emotion: {
      source: "server", // client-side inference is still an open question (§8)
      confidence: null,
    },
    context: {
      active_tab_category: tabInfo?.category ?? "unknown",
      active_tab_domain: tabInfo?.domain ?? "unknown",
      active_tab_title: tabInfo?.title ?? "unknown",
      user_name: userName,
      local_weather: tabInfo?.weather ?? "calm",
      time_of_day: new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening",
      session_duration_minutes: tabInfo?.sessionDurationMinutes ?? 0,
      idle_minutes_since_last_activity: tabInfo?.idleMinutes ?? 0,
    },
  };
}

/**
 * Generates a timestamped filename for the capture clip.
 * Goes inside CAPTURE_FOLDER, which ends up as a subfolder of the user's
 * default Downloads directory (e.g. ~/Downloads/mindstream_captures/).
 */
function generateCapturePath() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${CAPTURE_FOLDER}/capture_${ts}.webm`;
}

/**
 * Saves the captured webcam clip to a known local folder using
 * chrome.downloads — silently (the download shelf/bubble is suppressed via
 * `setUiOptions`) — so the friend's AI/ML emotion-detection workflow can
 * pick it up from disk.
 *
 * Returns the relative file path on success, null on failure.
 */
export async function saveCapture(blob) {
  if (!isExtensionContext() || !chrome.downloads) {
    console.info("[dev] would save capture to disk:", blob);
    return `dev_mode/${CAPTURE_FOLDER}/capture_dev.webm`;
  }

  // Suppress the download shelf/bubble so the save is invisible to the user.
  // setUiOptions is available from Chrome 117+; we require 141+.
  try {
    await chrome.downloads.setUiOptions({ enabled: false });
  } catch (e) {
    console.warn("[mindstream] could not suppress download UI:", e);
  }

  const blobUrl = URL.createObjectURL(blob);
  const filename = generateCapturePath();

  try {
    // Start the download -----------------------------------------------
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: blobUrl,
          filename,
          saveAs: false,
          conflictAction: "uniquify",
        },
        (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(id);
          }
        },
      );
    });

    // Wait for the download to actually finish -------------------------
    await new Promise((resolve, reject) => {
      function onChanged(delta) {
        if (delta.id !== downloadId) return;
        if (delta.state?.current === "complete") {
          chrome.downloads.onChanged.removeListener(onChanged);
          resolve();
        } else if (delta.state?.current === "interrupted") {
          chrome.downloads.onChanged.removeListener(onChanged);
          reject(new Error(delta.error?.current ?? "Download interrupted"));
        }
      }
      chrome.downloads.onChanged.addListener(onChanged);
    });

    URL.revokeObjectURL(blobUrl);
    console.log("[mindstream] clip saved to:", filename);
    return filename;
  } catch (err) {
    console.error("[mindstream] saveCapture failed:", err);
    URL.revokeObjectURL(blobUrl);
    return null;
  } finally {
    // Re-enable the download UI so normal user downloads aren't affected.
    try {
      await chrome.downloads.setUiOptions({ enabled: true });
    } catch { /* best-effort */ }
  }
}
