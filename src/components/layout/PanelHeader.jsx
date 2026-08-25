import { motion } from "motion/react";
import Logo from "../ui/Logo.jsx";
import { LOGO_MORPH } from "../../lib/constants.js";

export default function PanelHeader({
  title = "mindstream",
  progress,
  isOnboarding = false,
  onboardingStep = 1,
}) {
  return (
    <header className="shrink-0 px-5 pt-5 pb-6">
      <div className="flex items-center gap-2.5 h-6">
        {isOnboarding && onboardingStep > 1 && (
          <Logo size="small" layoutId="onboarding-logo" />
        )}
        <motion.span
          layout
          transition={LOGO_MORPH}
          className="font-mono text-[15px] font-semibold tracking-tight"
        >
          {title}
        </motion.span>
      </div>

      {progress != null && (
        <div className="mt-5 h-[2px] rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </header>
  );
}
