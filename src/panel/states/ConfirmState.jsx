import Button from "../../components/ui/Button.jsx";

export default function ConfirmState({ blobUrl, onAccept, onDecline }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Use this one?
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] border border-border relative mb-4 flex items-center justify-center overflow-hidden bg-surface">
        <video
          src={blobUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
        />
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted mb-4">
        The clip stays on this device. Only your name, detected mood and activity
        are sent to generate the reel.
      </p>

      <div className="flex gap-2.5 mt-auto">
        <Button variant="primary" className="flex-1" onClick={onAccept}>
          Create my reel
        </Button>
        <Button variant="ghost" onClick={onDecline}>
          Discard
        </Button>
      </div>
    </div>
  );
}
