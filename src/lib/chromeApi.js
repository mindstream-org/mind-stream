// Chrome API wrappers with dev-mode fallbacks.
// When running via `npm run dev` (no extension context), these use an in-memory store
// instead of chrome.storage so the UI still works in a plain browser tab.

export const isExtensionContext = () =>
  typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;

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

// Mirrors chrome.storage.onChanged for a single key. Returns an unsubscribe function.
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

// chrome.sidePanel.close() requires Chrome 141+. Silently returns false on older versions.
export async function closeSidePanel() {
  if (!isExtensionContext() || !chrome.sidePanel?.close) {
    console.info("[dev] would close side panel here");
    return false;
  }
  try {
    const window = await chrome.windows.getCurrent();
    if (window?.id == null) return false;
    await chrome.sidePanel.close({ windowId: window.id });
    return true;
  } catch (err) {
    console.warn("chrome.sidePanel.close failed:", err);
    return false;
  }
}

// Returns null instead of throwing when there is no background to talk to.
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
