import { useEffect, useState } from "react";
import { CAPTURE_DURATION_MS } from "../../lib/constants.js";

/**
 * `videoRef` is provided by useCameraCapture() in the parent — this
 * component is purely presentational so it can also be exercised in
 * isolation (e.g. Storybook-style preview) without a real camera.
 */
export default function CaptureState({ videoRef, durationMs = CAPTURE_DURATION_MS }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(durationMs / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [durationMs]);

  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog-dim mb-2.5">
        Recording
      </div>
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
        Hold still for a second.
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] border border-teal shadow-[0_0_0_4px_var(--color-teal-soft)] relative mb-4 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#2A3138,#171B1E_75%)]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
        />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-full font-mono text-[11px] tracking-wide z-10">
          <div className="w-1.5 h-1.5 rounded-full bg-coral animate-blink" />
          REC · 0:0{secondsLeft}
        </div>
      </div>

      <p className="text-[13.5px] leading-relaxed text-fog shrink-0 pb-1">
        This stays on your device. Nothing is uploaded anywhere.
      </p>
    </div>
  );
}
