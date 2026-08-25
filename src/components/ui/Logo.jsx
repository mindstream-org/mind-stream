import { motion } from "motion/react";
import { LOGO_MORPH } from "../../lib/constants.js";

export default function Logo({ size = "medium", layoutId, className = "" }) {
  const sizeClasses = {
    small: "w-6 aspect-square",
    medium: "w-29 aspect-square",
  };

  return (
    <motion.img
      layoutId={layoutId}
      transition={LOGO_MORPH}
      src="/assets/logo.png"
      alt="MindStream"
      className={`select-none ${sizeClasses[size]} ${className}`}
      draggable={false}
    />
  );
}
