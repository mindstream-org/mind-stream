import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet, storageSubscribe } from "../lib/chromeApi.js";
import { DEFAULT_SETTINGS, STORAGE_KEYS } from "../lib/constants.js";

/**
 * Custom React hook for accessing and updating user settings stored in chrome.storage.local.
 */
export function useSettings() {
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    storageGet(STORAGE_KEYS.SETTINGS).then((stored) => {
      if (!mounted) return;
      setSettingsState({ ...DEFAULT_SETTINGS, ...(stored ?? {}) });
      setLoaded(true);
    });

    const unsubscribe = storageSubscribe(STORAGE_KEYS.SETTINGS, (next) => {
      setSettingsState({ ...DEFAULT_SETTINGS, ...(next ?? {}) });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = useCallback(async (patch) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      storageSet(STORAGE_KEYS.SETTINGS, next);
      return next;
    });
  }, []);

  return { settings, updateSettings, loaded };
}
