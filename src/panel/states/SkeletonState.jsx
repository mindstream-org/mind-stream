function ShimmerLine({ width }) {
  return (
    <div
      className="h-[8px] rounded-[4px] bg-panel-raised mb-2 overflow-hidden relative"
      style={{ width }}
    >
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.06)_50%,transparent_70%)] bg-[length:200%_100%]" />
    </div>
  );
}

export default function SkeletonState() {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <div className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-fog-dim mb-2">
        Getting ready
      </div>
      <h1 className="text-[21px] font-bold leading-tight mb-3 tracking-[-0.02em]">
        Waiting on camera access.
      </h1>
      
      <div className="w-full flex-1 min-h-0 rounded-[14px] bg-panel-raised border border-hairline overflow-hidden relative mb-4">
        <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.05)_50%,transparent_70%)] bg-[length:200%_100%]" />
      </div>
      
      <ShimmerLine width="60%" />
      <ShimmerLine width="40%" />
      
      <p className="text-[13px] leading-relaxed text-fog mt-4">
        Allow the browser's camera prompt to continue.
      </p>
    </div>
  );
}
