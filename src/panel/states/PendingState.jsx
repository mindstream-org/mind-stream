import Button from "../../components/ui/Button.jsx";

/**
 * Shown in the side panel when cycle_status is "pending". Three sub-states:
 *
 * 1. Capture window is still open → brief "look for the window" hint.
 * 2. Clip saved, emotion detection running (friend's workflow) → show
 *    animated progress and a cancel/redo button.
 * 3. Job submitted, reel generation running → show animated progress and
 *    a cancel/redo button. (Future — once backend exists.)
 */
export default function PendingState({ hasJobId, hasClipSaved, onCancel }) {
  if (hasJobId) {
    // Generation is in progress — the capture window has already closed.
    return (
      <div className="flex flex-col h-full animate-fadein">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-amber mb-2.5">
          Generating
        </div>
        <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
          Your reel is being put together.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-fog mb-6">
          We'll notify you the moment it's ready. Go ahead and get back to
          what you were doing — no need to keep this open.
        </p>

        {/* Animated generating indicator */}
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-panel-raised border border-hairline mb-6">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-amber animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-amber animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[13px] text-fog">Processing your check-in…</span>
        </div>

        <div className="mt-auto">
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Cancel &amp; redo
          </Button>
        </div>
      </div>
    );
  }

  if (hasClipSaved) {
    // Clip saved to disk — emotion detection (friend's workflow) picks it up.
    return (
      <div className="flex flex-col h-full animate-fadein">
        <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-teal mb-2.5">
          Processing
        </div>
        <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
          Your clip has been saved.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-fog mb-6">
          Emotion detection is running on your snapshot. Once it finishes,
          we'll start assembling your reel. You can close this panel —
          we'll notify you when it's ready.
        </p>

        {/* Animated processing indicator */}
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-panel-raised border border-hairline mb-6">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-1.5 h-1.5 rounded-full bg-teal animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[13px] text-fog">Analyzing your check-in…</span>
        </div>

        <div className="mt-auto">
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            Cancel &amp; redo
          </Button>
        </div>
      </div>
    );
  }

  // Capture window is still open — just a brief hint.
  return (
    <div className="flex flex-col animate-fadein">
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog-dim mb-2.5">
        Check-in in progress
      </div>
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
        Look for the check-in window.
      </h1>
      <p className="text-[13.5px] leading-relaxed text-fog">
        A small window opened for your snap — allow camera access there. This panel will switch over
        automatically once your reel is ready.
      </p>
    </div>
  );
}
