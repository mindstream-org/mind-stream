import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import { COUNTDOWN_SECONDS } from "../../lib/constants.js";

export default function CountdownState({ status, error, onProgress, onDone }) {
  const started = status === "started";

  // Held in a ref, not the deps: onProgress re-renders the parent 60x a second,
  // and the new callback identity would restart the interval forever.
  const callbacks = useRef({ onProgress, onDone });
  useEffect(() => {
    callbacks.current = { onProgress, onDone };
  });

  useEffect(() => {
    if (!started) return;
    const totalMs = COUNTDOWN_SECONDS * 1000;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const remaining = Math.max(0, totalMs - (Date.now() - startTime));
      callbacks.current.onProgress?.((remaining / totalMs) * 100);

      if (remaining <= 0) {
        clearInterval(interval);
        callbacks.current.onDone?.();
      }
    }, 16);

    return () => clearInterval(interval);
  }, [started]);

  if (status === "sending") {
    return (
      <div className="flex flex-col h-full animate-fadein">
        <div
          data-ambient
          className="w-10 h-10 rounded-full border border-border bg-surface-raised mb-4 animate-breathe"
        />
        <h1 className="text-[21px] font-bold leading-tight tracking-[-0.02em]">
          Sending your check-in.
        </h1>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col h-full animate-fadein">
        <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
          Couldn't start your reel.
        </h1>
        <p className="text-[13px] leading-relaxed text-fg-muted mb-2">{error}</p>
        <p className="text-[12px] leading-relaxed text-fg-subtle">
          Your clip is saved, so nothing was lost.
        </p>

        <div className="mt-auto">
          <Button variant="primary" className="w-full" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="w-10 h-10 rounded-full bg-surface-raised border border-border text-fg flex items-center justify-center mb-4">
        <Check size={15} strokeWidth={2.5} />
      </div>

      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Your reel is on its way.
      </h1>

      <p className="text-[13px] leading-relaxed text-fg-muted mb-6">
        We'll notify you when it's ready.
      </p>

      <div className="mt-auto">
        <Button variant="primary" className="w-full" onClick={onDone}>
          Okay
        </Button>
      </div>
    </div>
  );
}
