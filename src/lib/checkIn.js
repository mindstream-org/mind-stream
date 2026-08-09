import { CAPTURE_FOLDER } from "./constants.js";
import { isExtensionContext } from "./chromeApi.js";

/** Builds the extension → backend payload per the project summary's contract. */
export function buildCheckInPayload({ tabInfo, settings } = {}) {
  const preset = settings?.preset ?? "normal";
  const userName = settings?.user_name ?? "friend";

  const hour = new Date().getHours();
  const time_of_day = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return {
    session_id: crypto.randomUUID(),
    captured_at: new Date().toISOString(),
    preset,
    context: {
      user_name: userName,
      active_tab_category: tabInfo?.category ?? "browsing",
      time_of_day,
    },
  };
}

/**
 * Generates a timestamped filename for the capture clip inside CAPTURE_FOLDER.
 */
function generateCapturePath() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${CAPTURE_FOLDER}/capture_${ts}.webm`;
}

/**
 * Saves the captured webcam clip to disk using chrome.downloads (silently —
 * download shelf suppressed via setUiOptions) so the backend can pick it up.
 * Returns the relative file path on success, null on failure.
 */
export async function saveCapture(blob) {
  if (!isExtensionContext() || !chrome.downloads) {
    console.info("[dev] would save capture to disk:", blob);
    return `dev_mode/${CAPTURE_FOLDER}/capture_dev.webm`;
  }

  // Suppress the download shelf/bubble. setUiOptions requires Chrome 117+; we require 141+.
  try {
    await chrome.downloads.setUiOptions({ enabled: false });
  } catch (e) {
    console.warn("[mindstream] could not suppress download UI:", e);
  }

  const blobUrl = URL.createObjectURL(blob);
  const filename = generateCapturePath();

  try {
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download(
        { url: blobUrl, filename, saveAs: false, conflictAction: "uniquify" },
        (id) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(id);
        },
      );
    });

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
