import { ArrowRight, Camera, Play, ScanFace } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Logo from "../../components/ui/Logo.jsx";

const FLOW = [
  { Icon: Camera, label: "Capture", note: "3s clip" },
  { Icon: ScanFace, label: "Understand", note: "on device" },
  { Icon: Play, label: "Reset", note: "short reel" },
];

export default function IdleState({ onAccept, onDismiss, reelCount = 0, onOpenCollection }) {
  return (
    <div className="flex flex-col h-full justify-between animate-fadein py-4 px-2">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-7">
        <Logo size="medium" />

        <div className="space-y-2 max-w-[280px]">
          <h1 className="text-2xl font-bold tracking-tight text-fg">
            Time for a check-in
          </h1>
          <p className="text-[13px] text-fg-muted leading-relaxed">
            A quick snapshot reads how you're doing, then builds a focus reset
            while you keep working.
          </p>
        </div>

        <div className="grid w-full max-w-[280px] grid-cols-3">
          {FLOW.map(({ Icon, label, note }, i) => (
            <div key={label} className="relative flex flex-col items-center gap-2">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 right-[calc(50%+22px)] left-[calc(-50%+22px)] h-px bg-border"
                />
              )}
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg-muted">
                <Icon size={14} />
              </span>
              <span className="text-[11px] font-medium leading-none text-fg">{label}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider leading-none text-fg-subtle">
                {note}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 space-y-3 pt-2">
        <Button
k          variant="primary"
          className="w-full py-3 text-sm font-semibold rounded-xl group"
          onClick={onAccept}
        >
          <span>Start check-in</span>
          <ArrowRight
            size={16}
            className="transition-transform duration-300 ease-out group-hover:translate-x-1"
          />
        </Button>

        <div className="flex items-center justify-center gap-3 text-xs font-medium text-fg-subtle">
          <button
            onClick={onDismiss}
            className="py-1 transition-colors hover:text-fg cursor-pointer"
          >
            Not right now
          </button>
          {reelCount > 0 && (
            <>
              <span className="h-3 w-px bg-border" aria-hidden="true" />
              <button
                onClick={onOpenCollection}
                className="py-1 transition-colors hover:text-fg cursor-pointer"
              >
                Saved reels ({reelCount})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
