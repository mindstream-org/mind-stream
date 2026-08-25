import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Play, Trash2 } from "lucide-react";
import PlayerState from "../../panel/states/PlayerState.jsx";
import { API_ROUTES, EMOTION_TONE } from "../../lib/constants.js";

const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const daysAgo = Math.round((midnight(new Date()) - midnight(date)) / 86_400_000);

  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

export default function ReelCollection({ onClose }) {
  const [reels, setReels] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [durations, setDurations] = useState({});
  const [reloadTick, setReloadTick] = useState(0);
  const [active, setActive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(API_ROUTES.SAVED_REELS);
        if (cancelled) return;
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const payload = await response.json();
        if (cancelled) return;
        setReels(Array.isArray(payload.reels) ? payload.reels : []);
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load saved reels.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (active) setActive(null);
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose]);

  const handleDelete = async (reel) => {
    setDeleting(reel.filename);
    setError("");
    try {
      const response = await fetch(API_ROUTES.SAVED_REEL(reel.filename), { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not delete the reel.");
      setReels((prev) => (prev ?? []).filter((item) => item.filename !== reel.filename));
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the reel.");
    } finally {
      setDeleting(null);
    }
  };

  if (active) {
    return (
      <div className="w-full h-screen bg-black">
        <PlayerState reelUrl={active.url} onDone={() => setActive(null)} />
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-bg flex flex-col text-fg font-sans">
      <header className="shrink-0 px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 -ml-1 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg cursor-pointer"
            aria-label="Back to check-in"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight leading-tight">Saved reels</h1>
            {reels && reels.length > 0 && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle">
                {reels.length} {reels.length === 1 ? "reel" : "reels"}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {reels === null && !error && (
          <div className="flex h-full items-center justify-center text-fg-subtle">
            <LoaderCircle size={16} className="animate-spin" />
          </div>
        )}

        {error && !reels && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-[220px] text-[13px] leading-relaxed text-fg-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError("");
                setReloadTick((tick) => tick + 1);
              }}
              className="rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-medium text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        {reels && reels.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[14px] font-medium text-fg">No saved reels yet</p>
            <p className="max-w-[220px] text-[12px] leading-relaxed text-fg-muted">
              Your finished focus resets will show up here.
            </p>
          </div>
        )}

        {reels && reels.length > 0 && (
          <div className="space-y-2">
            {error && (
              <p className="text-[12px] leading-relaxed text-destructive" role="alert">
                {error}
              </p>
            )}
            {reels.map((reel) => {
              const isDeleting = deleting === reel.filename;
              const tone = EMOTION_TONE[reel.emotion?.toLowerCase()] ?? "Balancing";
              const when = formatWhen(reel.created_at);
              const length = formatDuration(durations[reel.filename]);

              return (
                <div
                  key={reel.filename}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:border-fg-subtle/40"
                >
                  <button
                    type="button"
                    onClick={() => setActive(reel)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    <span className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-bg">
                      {/* #t=0.5 makes Chrome paint a real frame as the poster,
                          and the metadata gives us the length for free. */}
                      <video
                        src={`${reel.url}#t=0.5`}
                        muted
                        playsInline
                        preload="metadata"
                        tabIndex={-1}
                        onLoadedMetadata={(event) => {
                          // Read before setState: React clears currentTarget
                          // as soon as the handler returns.
                          const { duration } = event.currentTarget;
                          setDurations((prev) => ({ ...prev, [reel.filename]: duration }));
                        }}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play size={13} className="fill-white text-white" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-fg">
                        {when}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                        {tone}
                        {length ? ` · ${length}` : ""}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(reel)}
                    disabled={isDeleting}
                    className="shrink-0 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-raised hover:text-destructive disabled:opacity-40 cursor-pointer"
                    aria-label={`Delete ${tone.toLowerCase()} reset${when ? ` from ${when}` : ""}`}
                  >
                    {isDeleting ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
