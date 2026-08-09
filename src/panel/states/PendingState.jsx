/**
 * PendingState — shown while the check-in cycle is in progress.
 *
 * Three sub-states, single unified layout:
 *   1. Capture window open (no clip yet)
 *   2. Clip saved, emotion detection running
 *   3. Job submitted, reel generation running
 */
export default function PendingState({ hasJobId, hasClipSaved, onCancel }) {
  const label = hasJobId ? "Generating" : hasClipSaved ? "Analysing" : "Capturing";
  const activeStep = hasJobId ? 2 : hasClipSaved ? 1 : 0;

  const steps = [
    "Snapshot captured",
    "Emotion detected",
    "Assembling reel",
  ];

  return (
    <div className="flex flex-col h-full animate-fadein">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-8">
        {label}
      </p>

      {/* TODO(prash): Processing animation
          Asset: Lottie, ~80×80px, white line art on transparent bg
          Show during generation sub-state (hasJobId) */}

      <div className="flex flex-col gap-4">
        {steps.map((step, i) => (
          <Step
            key={step}
            label={step}
            done={i < activeStep}
            active={i === activeStep}
          />
        ))}
      </div>

      {(hasJobId || hasClipSaved) && (
        <div className="mt-auto">
          <button
            onClick={onCancel}
            className="text-[12.5px] text-fg-subtle hover:text-fg-muted transition-colors cursor-pointer"
          >
            Cancel &amp; redo
          </button>
        </div>
      )}
    </div>
  );
}

function Step({ label, done, active }) {
  return (
    <div className="flex items-center gap-3.5">
      <div
        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 ${
          done
            ? "border-fg-subtle bg-fg-subtle"
            : active
            ? "border-fg-muted"
            : "border-border"
        }`}
      >
        {done && (
          <svg width="7" height="6" viewBox="0 0 7 6" fill="none">
            <path
              d="M1 3l1.8 2L6 1"
              stroke="#09090b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {active && (
          <span className="w-1.5 h-1.5 rounded-full bg-fg-muted animate-pulse block" />
        )}
      </div>
      <span
        className={`text-[13px] leading-none transition-colors ${
          done
            ? "text-fg-subtle line-through"
            : active
            ? "text-fg"
            : "text-fg-subtle"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
