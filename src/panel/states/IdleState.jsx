import Button from "../../components/ui/Button.jsx";

export default function IdleState({ onAccept, onDismiss }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      {/* <div className="w-[52px] h-[52px] rounded-full bg-panel-raised border border-hairline flex items-center justify-center mb-5">
        <div className="w-2 h-2 rounded-full bg-teal animate-breathe" style={{ animationDuration: "3.2s" }} />
      </div> */}
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog-dim mb-2.5">
        Quick check-in?
      </div>
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
        Want a quick snap check-in?
      </h1>
      <p className="text-[13.5px] leading-relaxed text-fog mb-6">
        {/* A 3-second snapshot, just for you — nothing leaves your device. We'll turn it into a short reel to help you reset. */}
        Record a 3-second moment. It stays on your device, and we'll turn it
        into a short reflection reel.
      </p>
      <div className="flex gap-2.5 mt-auto">
        <Button
          variant="primary"
          className="flex-1 cursor-pointer"
          onClick={onAccept}
        >
          Yes, check in
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
