export default function PanelHeader({
  title = "mindstream",
  progress,
  showStep = false,
  step = 1,
  totalSteps = 4,
}) {
  return (
    <header className="shrink-0 px-5 pt-5 pb-6 ">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[13px] font-semibold tracking-tight">
          {title}
        </span>

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
