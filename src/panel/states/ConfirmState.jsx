import Button from "../../components/ui/Button.jsx";

/**
 * Sits between "clip recorded" and "submit to backend". Nothing gets sent
 * anywhere until the user explicitly confirms here — declining discards
 * the clip outright.
 */
export default function ConfirmState({ blobUrl, onAccept, onDecline }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-teal mb-2">
        Got it
      </div>
      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Use this one?
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] border border-hairline relative mb-4 flex items-center justify-center overflow-hidden bg-[#12161A]">
        <video
          src={blobUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
        />
      </div>

      <p className="text-[13px] leading-relaxed text-fog mb-4">
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
