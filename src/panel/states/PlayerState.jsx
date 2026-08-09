import Button from "../../components/ui/Button.jsx";
import ProgressBar from "../../components/ui/ProgressBar.jsx";

export default function PlayerState({ reelUrl, caption, onDone }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="w-full aspect-[9/16] rounded-[14px] border border-hairline bg-[linear-gradient(200deg,#233A38,#101615)] relative overflow-hidden flex flex-col justify-end mb-3.5 shadow-lg">
        <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-auto">
          <span className="font-mono text-[11px] text-white/90 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
            Focus Reset Reel
          </span>
          <button
            onClick={onDone}
            className="w-6 h-6 rounded-full bg-black/50 text-white/80 hover:text-white flex items-center justify-center font-mono text-[11px] transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {reelUrl ? (
          <video
            src={reelUrl}
            controls
            autoPlay
            playsInline
            loop
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <div className="p-3.5 bg-[linear-gradient(to_top,rgba(0,0,0,0.6),transparent)] z-10">
              <p className="text-[13px] text-paper leading-snug">
                {caption ?? '"Two minutes. Look away from the screen and just breathe."'}
              </p>
            </div>
            <ProgressBar percent={38} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        <Button variant="primary" onClick={onDone}>
          Done — mark as viewed
        </Button>

        {reelUrl && (
          <a
            href={reelUrl}
            download={`mindstream_reel_${Date.now()}.mp4`}
            target="_blank"
            rel="noreferrer"
            className="w-full"
          >
            <Button variant="ghost" className="w-full">
              Download Reel (MP4)
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
