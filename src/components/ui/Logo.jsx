import { motion } from "motion/react";

export default function Logo({ size = "medium", layoutId, className = "" }) {
  const sizeClasses = {
    small: "w-6 aspect-square",
    medium: "w-29 aspect-square",
  };

  return (
    <motion.img
      layoutId={layoutId}
      src="/assets/logo.png"
      alt="MindStream"
      className={`select-none ${sizeClasses[size]} ${className}`}
      draggable={false}
    />
  );
}
