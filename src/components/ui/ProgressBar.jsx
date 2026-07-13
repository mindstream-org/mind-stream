export default function ProgressBar({ percent = 0 }) {
  return (
    <div className="h-0.75 bg-white/15 rounded-full mx-3.5 mb-3.5 overflow-hidden">
      <div
        className="h-full bg-teal rounded-full transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
