import Button from "../../components/ui/Button.jsx";

/**
 * Sits between "clip recorded" and "submit to backend". Nothing gets sent
 * anywhere until the user explicitly confirms here — declining discards
 * the clip outright.
 */
export default function ConfirmState({ blobUrl, onAccept, onDecline }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-fog-dim mb-2.5">
        Got it
      </div>
      <h1 className="text-[22px] font-bold leading-tight mb-2.5 tracking-[-0.01em]">
        Use this one?
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] border border-hairline relative mb-4 flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#2A3138,#171B1E_75%)]">
        <video
          src={blobUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
        />
      </div>

      <p className="text-[13.5px] leading-relaxed text-fog mb-2">
        Nothing's been sent yet. Say the word and we'll turn this into your reel.
      </p>

      {/* Declining discards the clip — nothing gets submitted */}
      <div className="flex gap-2.5 mt-auto">
        <Button variant="primary" className="flex-1" onClick={onAccept}>
          Let's go!
        </Button>
        <Button variant="ghost" onClick={onDecline}>
          Not now
        </Button>
      </div>
    </div>
  );
}
