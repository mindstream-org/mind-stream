export default function SkeletonState() {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Waiting on camera access.
      </h1>

      <div className="w-full flex-1 min-h-0 rounded-[14px] bg-surface-raised border border-border overflow-hidden relative">
        <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.05)_50%,transparent_70%)] bg-[length:200%_100%]" />
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted mt-4">
        Allow the browser's camera prompt to continue.
      </p>
    </div>
  );
}
