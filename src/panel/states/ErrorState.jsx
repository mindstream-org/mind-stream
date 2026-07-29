import Button from "../../components/ui/Button.jsx";

export default function ErrorState({ message, onRetry, onDismiss }) {
  const isBackendError = message?.includes("port 4000");

  return (
    <div className="flex flex-col h-full animate-fadein">
      <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-4 mt-1">
        Error
      </p>
      <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.025em] mb-2">
        Didn't come together.
      </h1>
      <p className="text-[13px] text-fg-muted leading-relaxed mb-5">
        {message && !isBackendError
          ? message
          : "An error occurred while generating your reel."}
      </p>

      {isBackendError && (
        <div className="bg-surface-raised border border-border rounded-[8px] px-4 py-3 mb-5">
          <p className="text-[12px] text-fg-muted leading-relaxed">
            Make sure the backend is running:{" "}
            <code className="font-mono text-[11px] bg-bg px-1.5 py-0.5 rounded text-fg">
              cd backend &amp;&amp; npm start
            </code>
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 mt-auto">
        <Button variant="primary" className="flex-1" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="subtle" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
