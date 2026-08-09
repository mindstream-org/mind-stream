import Button from "../../components/ui/Button.jsx";
import TagPill from "../../components/ui/TagPill.jsx";

export default function ReadyState({ emotionLabel = "neutral", onPlay, onLater }) {
  return (
    <div className="flex flex-col animate-fadein">
      <TagPill>● {emotionLabel} → reset</TagPill>
      <div className="w-full aspect-[9/13] rounded-[14px] border border-teal bg-[linear-gradient(160deg,#2A4B47,#14201E)] relative overflow-hidden flex items-center justify-center my-4">
        <div className="w-12 h-12 rounded-full bg-black/35 border border-white/25 flex items-center justify-center text-lg">
          ▶
        </div>
      </div>
      <h1 className="text-[18px] font-bold leading-tight mb-4">Ready when you are.</h1>
      <div className="flex gap-2.5 mt-auto">
        <Button variant="primary" className="flex-1" onClick={onPlay}>
          Play reel
        </Button>
        <Button variant="ghost" onClick={onLater}>
          Later
        </Button>
      </div>
    </div>
  );
}
