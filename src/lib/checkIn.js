import { API_ROUTES } from "./constants.js";

/** Builds the extension -> backend payload per the project summary's contract. */
export function buildCheckInPayload({ tabInfo } = {}) {
  return {
    session_id: crypto.randomUUID(),
    captured_at: new Date().toISOString(),
    emotion: {
      source: "server", // client-side inference is still an open question (§8)
      confidence: null,
    },
    context: {
      active_tab_category: tabInfo?.category ?? "unknown",
      active_tab_domain: tabInfo?.domain ?? "unknown",
      time_of_day: new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening",
      session_duration_minutes: tabInfo?.sessionDurationMinutes ?? 0,
      idle_minutes_since_last_activity: tabInfo?.idleMinutes ?? 0,
    },
  };
}

/** POSTs the confirmed capture to the local backend. Backend isn't built yet, so this fails soft. */
export async function submitCheckIn(blob) {
  try {
    const form = new FormData();
    form.append("clip", blob, "capture.webm");
    form.append("payload", JSON.stringify(buildCheckInPayload()));

    const response = await fetch(API_ROUTES.CHECK_IN, { method: "POST", body: form });
    if (!response.ok) throw new Error(`check-in failed: ${response.status}`);
    return await response.json(); // expected: { job_id }
  } catch (err) {
    console.warn("check-in submission failed (backend not running yet?):", err);
    return null;
  }
}
