import { useEffect, useState } from "react";
import { COUNTDOWN_SECONDS } from "../../lib/constants.js";

/**
 * Shown after "Let's go!" — a compact confirmation that the reel is being
 * generated. The decreasing progress is rendered via `onProgress` so the
 * parent can feed it into the header's bottom border instead of drawing a
 * separate bar. The large "Processing" box is gone — just title + subtitle.
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
    <div className="flex flex-col animate-fadein">
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
        Your reel is on its way.
      </h1>

      <p className="text-[13.5px] leading-relaxed text-fog">
        We'll let you know the moment it's ready. Go ahead and get back to it.
      </p>
    </div>
  );
}
