import React from "react";

/**
 * EyesGaze — Animated eyes gaze loader component.
 *
 * Props:
 *   - size: "sm" | "md" | "lg" | "xl" (default: "lg")
 *   - className: string
 */
export function EyesGaze({ size = "lg", className = "", showSmile = false }) {
  const sizeMap = {
    sm: "w-10 h-5",
    md: "w-14 h-7",
    lg: "w-20 h-10",
    xl: "w-24 h-12",
  };

  const currentSizeClass = sizeMap[size] || sizeMap.lg;

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${currentSizeClass} ${className}`}>
      <svg
        className="w-full h-full"
        viewBox="0 0 100 50"
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <style>{`
          @keyframes gaze-drift {
            0%, 100% { transform: translate(0px, 0px); }
            25%  { transform: translate(4px, -2px); }
            50%  { transform: translate(-3px, 2px); }
            75%  { transform: translate(3px, 1px); }
          }
          @keyframes left-blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.06); }
          }
          @keyframes right-blink {
            0%, 88%, 100% { transform: scaleY(1); }
            93% { transform: scaleY(0.06); }
          }
          .eye-left-gaze { animation: gaze-drift 5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
          .eye-right-gaze { animation: gaze-drift 5s cubic-bezier(0.4, 0, 0.6, 1) 0.6s infinite; }
          .eye-left-socket {
            animation: left-blink 4.5s ease-in-out infinite;
            transform-origin: 25px 25px;
            transform-box: fill-box;
          }
          .eye-right-socket {
            animation: right-blink 4.5s ease-in-out 0.5s infinite;
            transform-origin: 75px 25px;
            transform-box: fill-box;
          }
        `}</style>

        {/* ── LEFT EYE — thin white line-art ── */}
        <g className="eye-left-socket">
          <ellipse cx="25" cy="25" rx="18" ry="14" stroke="#fafafa" strokeWidth="1.5" />
          <g className="eye-left-gaze">
            {/* Iris ring */}
            <circle cx="25" cy="25" r="6" stroke="#fafafa" strokeWidth="1.5" />
            {/* Pupil dot */}
            <circle cx="25" cy="25" r="2.5" fill="#fafafa" />
          </g>
        </g>

        {/* ── RIGHT EYE — thin white line-art ── */}
        <g className="eye-right-socket">
          <ellipse cx="75" cy="25" rx="18" ry="14" stroke="#fafafa" strokeWidth="1.5" />
          <g className="eye-right-gaze">
            {/* Iris ring */}
            <circle cx="75" cy="25" r="6" stroke="#fafafa" strokeWidth="1.5" />
            {/* Pupil dot */}
            <circle cx="75" cy="25" r="2.5" fill="#fafafa" />
          </g>
        </g>

        {/* ── SMILE ── */}
        {showSmile && (
          <path
            d="M 42 42 Q 50 48 58 42"
            stroke="#fafafa"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>
    </div>
  );
}

export default EyesGaze;
