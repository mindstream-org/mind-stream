import Button from "../../components/ui/Button.jsx";

export default function IdleState({ onAccept, onDismiss }) {
  return (
    <div className="flex flex-col h-full justify-between animate-fadein py-4 px-2">
      
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
        {/* Logo */}
        <div className="py-2">
          <img
            src="/assets/logo.png"
            alt="MindStream"
            className="w-20 select-none mx-auto"
            draggable={false}
          />
        </div>

        {/* Headline & Description */}
        <div className="space-y-2 max-w-[280px]">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Time for a Check-in
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Take a 3-second camera snapshot to analyze your mood and generate a personalized focus-reset reel.
          </p>
        </div>

        {/* Feature Highlights (Clean unboxed inline list) */}
        <div className="flex items-center justify-center gap-6 pt-4 text-zinc-400">
          <div className="flex flex-col items-center gap-1.5">
            <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            </svg>
            <span className="text-[11px] font-medium text-zinc-300">3s Snap</span>
          </div>

          <div className="w-px h-6 bg-zinc-800" />

          <div className="flex flex-col items-center gap-1.5">
            <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] font-medium text-zinc-300">AI Emotion</span>
          </div>

          <div className="w-px h-6 bg-zinc-800" />

          <div className="flex flex-col items-center gap-1.5">
            <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[11px] font-medium text-zinc-300">Reset Reel</span>
          </div>
        </div>
      </div>

      
      <div className="shrink-0 space-y-3 pt-2">
        <Button
          variant="primary"
          className="w-full py-3 text-sm font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2 group transition-all"
          onClick={onAccept}
        >
          <span>Start Check-in</span>
          <svg
            className="w-4 h-4 transition-transform group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Button>

        <button
          onClick={onDismiss}
          className="w-full text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors text-center py-1 cursor-pointer"
        >
          Not right now
        </button>
      </div>
    </div>
  );
}
