import { useEffect } from "react";
import { motion } from "motion/react";
import Logo from "../../components/ui/Logo.jsx";

const AUTO_ADVANCE_MS = 800;

export default function OnboardingComplete({ onContinue }) {
  useEffect(() => {
    const timer = setTimeout(onContinue, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9 }}
      className="flex flex-col h-full items-center justify-center text-center cursor-pointer"
      onClick={onContinue}
    >
      <div className="mb-8">
        <Logo size="medium" />
      </div>

      <h1 className="text-[22px] font-semibold leading-snug tracking-[-0.025em] mb-2">
        MindStream is ready.
      </h1>
      <p className="text-[13px] text-fg-muted leading-relaxed">
        Your workspace is set. Focus sessions can now generate reflection reels.
      </p>

      <span className="mt-8 text-[11px] text-fg-subtle">
        Continuing…
      </span>
    </motion.div>
  );
}
