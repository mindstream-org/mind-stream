import Button from "../../components/ui/Button.jsx";
import TagPill from "../../components/ui/TagPill.jsx";

export default function ReadyState({ emotionLabel = "neutral", onPlay, onLater }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <TagPill>● {emotionLabel} → reset</TagPill>
      <div
        onClick={onPlay}
        className="w-full aspect-[9/16] rounded-[14px] border border-teal bg-[linear-gradient(160deg,#2A4B47,#14201E)] relative overflow-hidden flex items-center justify-center my-4 cursor-pointer group hover:border-paper/40 transition-colors shadow-md"
      >
        <div className="w-14 h-14 rounded-full bg-black/40 border border-white/30 flex items-center justify-center text-xl text-paper group-hover:scale-110 transition-transform">
          ▶
        </div>
      </div>
      <h1 className="text-[18px] font-bold leading-tight mb-2">Ready when you are.</h1>
      <p className="text-[13px] text-fog leading-relaxed mb-4">
        Your personalized focus reset reel has been generated.
      </p>
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
