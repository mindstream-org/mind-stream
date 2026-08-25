import Face from "../../components/ui/Face.jsx";

export default function PendingState({ generating, onCancel }) {
  return (
    <div className="flex h-full flex-col justify-between animate-fadein py-4 px-2">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Face mood="searching" />

        <div className="max-w-[280px] space-y-2" aria-live="polite">
          <h2 className="text-2xl font-bold tracking-tight text-fg">
            {generating ? "Building your reel" : "Saving your check-in"}
          </h2>
          <p className="text-[13px] leading-relaxed text-fg-muted">
            {generating
              ? "Keep working. We'll notify you when it's ready."
              : "This only takes a second."}
          </p>
        </div>
      </div>

      {generating && (
        <div className="shrink-0 pt-2">
          <button
            onClick={onCancel}
            className="w-full cursor-pointer py-1 text-xs font-medium text-fg-subtle transition-colors hover:text-fg"
          >
            Cancel and discard
          </button>
        </div>
      )}
    </div>
  );
}
