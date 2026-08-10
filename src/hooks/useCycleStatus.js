import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet, storageSubscribe } from "../lib/chromeApi.js";
import { CYCLE_STATUS, STORAGE_KEYS } from "../lib/constants.js";

const DEFAULT_CYCLE = {
  cycle_status: CYCLE_STATUS.IDLE,
  cycle_started_at: null,
  job_id: null,
  clip_path: null,
  reel_url: null,
  emotion_label: null,
  error_message: null,
};

// Keeps the panel UI in sync with the cycle state written by background/index.js.
export function useCycleStatus() {
  const [cycle, setCycleState] = useState(DEFAULT_CYCLE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    storageGet(STORAGE_KEYS.CYCLE).then((stored) => {
      if (!mounted) return;
      setCycleState({ ...DEFAULT_CYCLE, ...(stored ?? {}) });
      setLoaded(true);
    });

    const unsubscribe = storageSubscribe(STORAGE_KEYS.CYCLE, (next) => {
      setCycleState({ ...DEFAULT_CYCLE, ...(next ?? {}) });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const setCycle = useCallback(async (patch) => {
    setCycleState((prev) => {
      const next = { ...prev, ...patch };
      storageSet(STORAGE_KEYS.CYCLE, next);
      return next;
    });
  }, []);

  return { cycle, setCycle, loaded };
}
