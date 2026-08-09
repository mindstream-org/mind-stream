import { motion } from "motion/react";

export default function Logo({ size = "medium", className = "" }) {
  const sizeClasses = {
    small: "w-6",
    medium: "w-29",
  };

  return (
    <motion.img
      layoutId="onboarding-logo"
      src="/assets/logo.png"
      alt="MindStream"
      className={`select-none ${sizeClasses[size]} ${className}`}
      draggable={false}
    />
  );
}
