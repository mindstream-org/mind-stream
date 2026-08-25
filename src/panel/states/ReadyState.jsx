import { Play } from "lucide-react";
import { motion } from "motion/react";
import Face from "../../components/ui/Face.jsx";
import { EMOTION_TONE } from "../../lib/constants.js";

export default function ReadyState({ emotionLabel = "neutral", reelUrl, onPlay, onDismiss }) {
  const tone = EMOTION_TONE[emotionLabel.toLowerCase()] ?? "Balancing";

  return (
    <motion.div
      className="flex flex-col h-full gap-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="pt-1">
        <Face mood="happy" size={76} className="-ml-1 mb-2" />
        <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.03em] text-fg">
          Your reel is ready.
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          {tone} reset
        </p>
      </div>

      <button
        type="button"
        onClick={onPlay}
        aria-label="Play your reel"
        className="group relative flex-1 min-h-0 cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface-raised"
      >
        {reelUrl && (
          <video
            src={`${reelUrl}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-zinc-950 transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95">
            <Play size={16} className="translate-x-px fill-current" />
          </span>
        </span>
      </button>

      <button
        onClick={onDismiss}
        className="w-full shrink-0 cursor-pointer py-1 text-center text-xs font-medium text-fg-subtle transition-colors hover:text-fg"
      >
        Dismiss
      </button>
    </motion.div>
  );
}
