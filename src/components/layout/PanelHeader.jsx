import { motion } from "motion/react";
import Logo from "../ui/Logo.jsx";

export default function PanelHeader({
  title = "mindstream",
  progress,
  showStep = false,
  step = 1,
  totalSteps = 4,
  showLogo = false,
  isOnboarding = false,
  onboardingStep = 1,
}) {
  const shouldShowLogo = isOnboarding || showLogo;
  const showLogoInHeader =
    shouldShowLogo && (!isOnboarding || onboardingStep > 1);

  return (
    <header className="shrink-0 px-5 pt-5 pb-6 ">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {showLogoInHeader && <Logo size="small" />}
          <motion.span
            layout
            className="font-mono text-[15px] font-semibold tracking-tight"
          >
            {title}
          </motion.span>
        </div>

        {showStep && (
          <span className="text-[11px] text-fg-muted">
            {step}/{totalSteps}
          </span>
        )}
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
