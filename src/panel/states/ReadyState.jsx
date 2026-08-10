import { Play, X } from "lucide-react";
import { motion } from "motion/react";
import { EyesGaze } from "../../components/ui/eyes-gaze.jsx";

const EMOTION_TONE = {
  happy:    "Uplifting",
  sad:      "Calming",
  angry:    "Grounding",
  fearful:  "Soothing",
  disgusted:"Resetting",
  surprised:"Centering",
  neutral:  "Balancing",
};

export default function ReadyState({ emotionLabel = "neutral", onPlay, onDismiss }) {
  const tone = EMOTION_TONE[emotionLabel.toLowerCase()] ?? "Balancing";

  return (
    <motion.div
      className="flex flex-col h-full gap-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      
      <div>
        <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.03em] text-fg">
          Your reel is ready.
        </h1>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
          {emotionLabel} · {tone} focus reset
        </p>
      </div>

      
      <motion.div
        className="flex justify-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
      >
        <EyesGaze size="xl" showSmile={true} />
      </motion.div>

      
      <motion.div
        onClick={onPlay}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onPlay()}
        aria-label="Play your focus reset reel"
        className="relative flex-1 rounded-2xl overflow-hidden cursor-pointer group bg-surface-raised border border-border min-h-0"
        whileHover={{ scale: 1.005 }}
        transition={{ duration: 0.2 }}
      >
        {/* Gradient vignette */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none z-10" />

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="absolute top-3 right-3 z-30 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/50 transition-all cursor-pointer"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>

        {/* Center play button */}
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col items-center gap-2.5"
          >
            <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:bg-white/20 transition-all duration-200">
              <Play size={18} className="text-white fill-white ml-0.5" />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/40 group-hover:text-white/60 transition-colors">
              Tap to play
            </span>
          </motion.div>
        </div>

        {/* Bottom label */}
        <div className="absolute bottom-0 inset-x-0 px-4 py-3 z-20 pointer-events-none">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/25">
            Focus Reel
          </span>
        </div>
      </motion.div>

      
      <button
        onClick={onDismiss}
        className="w-full text-xs font-medium text-fg-subtle hover:text-fg transition-colors text-center py-1 cursor-pointer shrink-0"
      >
        Dismiss
      </button>
    </motion.div>
  );
}
