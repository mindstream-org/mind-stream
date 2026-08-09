import { Play, X } from "lucide-react";
import Button from "../../components/ui/Button.jsx";

export default function ReadyState({ emotionLabel = "neutral", onPlay, onDismiss }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.025em] mb-1 mt-1">
        Your reel is ready.
      </h1>
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-5">
        {emotionLabel} · focus reset
      </p>

      {/* 9:16 thumbnail — full tappable area */}
      <div
        onClick={onPlay}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onPlay()}
        aria-label="Play your focus reset reel"
        className="w-full aspect-[9/16] rounded-xl bg-surface-raised border border-border relative overflow-hidden flex items-center justify-center mb-5 cursor-pointer group hover:border-fg-subtle transition-all duration-200"
      >
        {/* Dismiss — top-right of thumbnail */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-bg/80 border border-border backdrop-blur-sm flex items-center justify-center text-fg-subtle hover:text-fg transition-colors cursor-pointer"
          aria-label="Dismiss reel"
        >
          <X size={12} />
        </button>

        {/* Play button */}
        <div className="flex flex-col items-center gap-3 group-hover:scale-105 transition-transform duration-200">
          <div className="w-14 h-14 rounded-full border border-fg/20 bg-fg/5 backdrop-blur-sm flex items-center justify-center">
            <Play size={18} className="text-fg fill-fg ml-0.5" />
          </div>
        </div>
      </div>

      <Button variant="primary" className="w-full" onClick={onPlay}>
        Play reel
      </Button>
    </div>
  );
}
