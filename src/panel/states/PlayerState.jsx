import Button from "../../components/ui/Button.jsx";
import ProgressBar from "../../components/ui/ProgressBar.jsx";

export default function PlayerState({ reelUrl, caption, onDone }) {
  return (
    <div className="flex flex-col animate-fadein">
      <div className="w-full aspect-[9/13] rounded-[14px] border border-hairline bg-[linear-gradient(200deg,#233A38,#101615)] relative overflow-hidden flex flex-col justify-end mb-3.5">
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className="font-mono text-[11px] text-white/75">0:04 / 0:11</span>
          <button onClick={onDone} className="font-mono text-[11px] text-white/75" aria-label="Close">
            ✕
          </button>
        </div>

        {reelUrl ? (
          <video src={reelUrl} controls autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <>
            <div className="p-3.5 bg-[linear-gradient(to_top,rgba(0,0,0,0.6),transparent)]">
              <p className="text-[13px] text-paper leading-snug">
                {caption ?? '"Two minutes. Look away from the screen and just breathe."'}
              </p>
            </div>
            <ProgressBar percent={38} />
          </>
        )}
      </div>
      <Button variant="primary" onClick={onDone}>
        Done — mark as viewed
      </Button>
    </div>
  );
}
