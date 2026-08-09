export default function PanelHeader({ progress }) {
  const hasProgress = progress != null && progress >= 0;

  return (
    <div className={`px-5 pt-4.5 pb-3.5 shrink-0 relative ${hasProgress ? '' : 'border-b border-hairline'}`}>
      <div className="font-mono text-[13px] tracking-wide font-semibold text-paper">
        mindstream
      </div>
      <svg
        className="w-full h-5.5 block"
        viewBox="0 0 340 22"
        preserveAspectRatio="none"
      >
        <path
          d="M0,11 L80,11 L92,2 L104,20 L116,11 L340,11"
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
      {/* Thin progress bar that replaces the bottom border during countdown */}
      {hasProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-hairline">
          <div
            className="h-full bg-fog-dim transition-all duration-75 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
