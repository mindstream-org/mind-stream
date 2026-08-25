export default function Face({ mood = "searching", size = 152, className = "" }) {
  const happy = mood === "happy";

  return (
    <svg
      data-ambient={happy ? undefined : true}
      viewBox="0 0 76 48"
      width={size}
      height={(size * 48) / 76}
      fill="none"
      aria-hidden="true"
      className={`text-fg ${className}`}
    >
      <g
        className={happy ? "" : "animate-blink"}
        style={happy ? undefined : { transformBox: "view-box", transformOrigin: "0 17px" }}
      >
        {[20, 56].map((cx) => (
          <g key={cx}>
            <ellipse
              cx={cx}
              cy="17"
              rx="15"
              ry="11.5"
              stroke="currentColor"
              strokeWidth="1.25"
              opacity="0.45"
            />
            <circle
              cx={cx}
              cy="17"
              r="3.4"
              fill="currentColor"
              className={happy ? "" : "animate-gaze"}
            />
          </g>
        ))}
      </g>

      {happy && (
        <path
          d="M27 39 Q38 47 49 39"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          pathLength="1"
          className="animate-smile [stroke-dasharray:1]"
        />
      )}
    </svg>
  );
}
