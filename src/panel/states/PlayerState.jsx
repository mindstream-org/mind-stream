import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function PlayerState({ reelUrl, onDone }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  const handleMouseMove = () => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
  };

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(false), 2500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <div
      className="relative w-full h-full bg-black flex flex-col overflow-hidden animate-fadein"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseMove}
    >
      {reelUrl ? (
        <video
          src={reelUrl}
          controls
          autoPlay
          playsInline
          loop
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg z-0">
          <p className="text-[12px] text-fg-subtle font-mono text-center px-6">
            Video unavailable: make sure backend is running
          </p>
        </div>
      )}

      {/* Top overlay */}
      <div
        className={`relative z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300 ${
          visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <span className="font-mono text-[11px] font-medium text-white/80 tracking-wide">
          mindstream
        </span>
        <button
          onClick={onDone}
          className="w-8 h-8 rounded-full bg-black/50 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
          aria-label="Close player"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
