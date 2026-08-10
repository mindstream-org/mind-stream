import { useEffect, useState } from "react";
import Button from "../../components/ui/Button.jsx";
import { COUNTDOWN_SECONDS } from "../../lib/constants.js";

/**
 * Shown after "Let's go!" -- a compact confirmation that the reel is being
 * generated. The decreasing progress is rendered via `onProgress` so the
 * parent can feed it into the header's bottom border instead of drawing a
 * separate bar.
 */
export default function CountdownState({ onComplete, onProgress }) {
  const [, setTick] = useState(0); // force re-render for the progress calc

  useEffect(() => {
    const totalMs = COUNTDOWN_SECONDS * 1000;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, totalMs - elapsed);
      const progressPercent = (remaining / totalMs) * 100;

      // Push progress up to the parent (PanelShell → PanelHeader)
      onProgress?.(progressPercent);
      setTick((t) => t + 1);

      if (remaining <= 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 16); // ~60fps for smooth animation

    return () => clearInterval(interval);
  }, [onComplete, onProgress]);

  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="w-10 h-10 rounded-full bg-teal-soft border border-teal text-teal flex items-center justify-center mb-4">
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <path d="M1.5 6L5.5 10L12.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Your reel is on its way.
      </h1>

      <p className="text-[13px] leading-relaxed text-fog mb-6">
        Snapshot saved locally. We'll notify you the moment your focus reset
        reel is ready.
      </p>

      <div className="mt-auto">
        <Button variant="primary" className="w-full" onClick={onComplete}>
          Okay
        </Button>
      </div>
    </div>
  );
}
