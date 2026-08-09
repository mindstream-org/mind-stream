import Button from "../../components/ui/Button.jsx";

export default function ErrorState({ message, onRetry, onDismiss }) {
  return (
    <div className="flex flex-col animate-fadein">
      <div className="w-11 h-11 rounded-full bg-coral-soft border border-coral text-coral flex items-center justify-center font-mono font-bold mb-4.5">
        !
      </div>
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog-dim mb-2.5">
        Something went wrong
      </div>
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 -tracking-[0.01em]">
        That one didn't come together.
      </h1>
      <p className="text-[13.5px] leading-relaxed text-fog mb-5">
        {message ??
          "We hit an error while putting your reel together. You can try again now, or we'll pick it up at the next check-in."}
      </p>
      <div className="flex gap-2.5 mt-auto">
        <Button variant="primary" className="flex-1" onClick={onRetry}>
          Retry now
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
