const DURATION = {
  idle:    "4s",
  pending: "1.6s",
  ready:   "2.4s",
  error:   "0s",
  player:  "4s",
};

export default function BreathingDot({ state = "idle" }) {
  const duration = DURATION[state] ?? "4s";
  return (
    <div
      className="w-1.5 h-1.5 rounded-full bg-fg-subtle animate-breathe shrink-0"
      style={{
        animationDuration: duration,
        opacity: state === "error" ? 0.15 : undefined,
      }}
    />
  );
}
