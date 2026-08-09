const SPEED_BY_STATE = {
  idle: "3.2s",
  skeleton: "2s",
  capture: "0.6s",
  countdown: "0.4s",
  ready: "1.6s",
  player: "3.2s",
  error: "0s",
};

export default function BreathingDot({ state = "idle" }) {
  const duration = SPEED_BY_STATE[state] ?? "3.2s";
  return (
    <div
      className="w-1.75 h-1.75 rounded-full bg-teal animate-breathe"
      style={{
        animationDuration: duration,
        opacity: state === "error" ? 0.3 : undefined,
      }}
    />
  );
}
