// Every chrome.* call funnels through here. Two reasons:
//   1. `npm run dev` opens the panel in a plain browser tab (no `chrome`
//      global with extension APIs), so components would crash immediately
//      without a fallback — this makes local UI development possible.
//   2. One place to swap implementations later instead of hunting through
//      every component for a raw `chrome.storage.local.get(...)` call.

export const isExtensionContext = () =>
  typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;

/** In-memory fallback store, used only outside the extension context. */
const memoryStore = new Map();
const memoryListeners = new Set();

export async function storageGet(key) {
  if (isExtensionContext()) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }
  return memoryStore.get(key);
}

export async function storageSet(key, value) {
  if (isExtensionContext()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  memoryStore.set(key, value);
  memoryListeners.forEach((fn) => fn(key, value));
}

/**
 * Subscribes to changes for a single key. Returns an unsubscribe function.
 * Mirrors chrome.storage.onChanged but works in the dev-mode fallback too.
 */
export function storageSubscribe(key, callback) {
  if (isExtensionContext()) {
    const listener = (changes, area) => {
      if (area === "local" && Object.prototype.hasOwnProperty.call(changes, key)) {
        callback(changes[key].newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  const listener = (changedKey, value) => {
    if (changedKey === key) callback(value);
  };
  memoryListeners.add(listener);
  return () => memoryListeners.delete(listener);
}

/**
 * Attempts to close the side panel after the countdown (see project summary
 * §4 step 5 and §8). `chrome.sidePanel.close({ tabId })` only exists from
 * Chrome 141 onward — on older versions this silently does nothing, and the
 * caller should fall back to just leaving the panel in an idle-looking
 * state rather than treating this as a hard failure.
 */
export async function closeSidePanel() {
  if (!isExtensionContext() || !chrome.sidePanel?.close) {
    console.info("[dev] would close side panel here");
    return false;
  }
  try {
    const window = await chrome.windows.getCurrent();
    if (window?.id == null) return false;
    // windowId, not tabId: this panel is the global default panel (opened
    // via openPanelOnActionClick or chrome.sidePanel.open({ windowId })),
    // not a tab-specific one, so tabId-based close has nothing to match.
    await chrome.sidePanel.close({ windowId: window.id });
    return true;
  } catch (err) {
    console.warn("chrome.sidePanel.close failed (needs Chrome 141+, and only works if something's actually open):", err);
    return false;
  }
}

/**
 * Sends a message to the background service worker. Returns null (rather
 * than throwing) when there's no background to talk to — e.g. during
 * `npm run dev` in a plain tab — so callers can fall back to local state.
 */
export async function sendMessage(message) {
  if (!isExtensionContext() || !chrome.runtime?.sendMessage) {
    console.info("[dev] would message background:", message);
    return null;
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.warn("sendMessage failed:", err);
    return null;
  }
}

/** No-op outside the extension context, so panel components can call this freely. */
export function createNotification(id, options) {
  if (!isExtensionContext() || !chrome.notifications) {
    console.info("[dev] notification:", id, options);
    return;
  }
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    ...options,
  });
}
