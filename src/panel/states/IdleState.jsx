import Button from "../../components/ui/Button.jsx";

export default function IdleState({ onAccept, onDismiss }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      {/* TODO(prash): Hero illustration
          Asset: Lottie / SVG, ~200×140px
          Style: white line art on transparent bg, matching logo aesthetic
          Insert above h1 when ready */}

      <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.025em] mb-2 mt-2">
        Time for a check-in.
      </h1>
      <p className="text-[13px] text-fg-muted leading-relaxed">
        A 3-second snapshot, turned into a personalised reel.
      </p>

      <div className="mt-auto flex flex-col gap-3">
        <Button variant="primary" className="w-full" onClick={onAccept}>
          Check in
        </Button>
        <button
          onClick={onDismiss}
          className="text-[12.5px] text-fg-subtle hover:text-fg-muted transition-colors text-center py-1 cursor-pointer"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
