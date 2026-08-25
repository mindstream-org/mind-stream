import { useEffect, useState } from "react";
import { CAPTURE_DURATION_MS } from "../../lib/constants.js";

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
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-destructive mb-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
        Recording
      </div>
      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Hold still.
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] border border-border relative flex items-center justify-center overflow-hidden bg-surface">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
        />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm border border-white/10 px-2.5 py-1 rounded-full font-mono text-[11px] text-white tracking-wide z-10">
          0:0{secondsLeft}
        </div>
      </div>
    </div>
  );
}
