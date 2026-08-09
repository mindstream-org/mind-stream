import React from "react";
import { EyesGaze } from "../../components/ui/eyes-gaze.jsx";

export default function PendingState({ hasJobId, hasClipSaved, onCancel }) {
  const activeStep = hasJobId ? 2 : hasClipSaved ? 1 : 0;

  const steps = [
    { label: "Snapshot captured", hint: "3-second camera clip saved" },
    { label: "Reading your mood", hint: "Running FER+ emotion model" },
    { label: "Assembling focus reel", hint: "Synthesizing AI script & media" },
  ];

  const headline = [
    "Capturing snapshot",
    "Reading the room",
    "Crafting your reel",
  ][activeStep];

  const sub = [
    "Hold still for just a moment.",
    "Analyzing your facial expression.",
    "Combining voice, music & visuals.",
  ][activeStep];

  const phaseLabel = [
    "Phase 1 • Camera Capture",
    "Phase 2 • Emotion Model",
    "Phase 3 • Reel Compositor",
  ][activeStep];

  return (
    <div className="flex flex-col h-full justify-between animate-fadein py-4 px-2">
      {/* ── Center Content — mirrors IdleState rhythm ── */}
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">

        {/* EyesGaze — same role as the logo on home screen */}
        <div className="py-2">
          <EyesGaze size="xl" />
        </div>

        {/* Headline & Description — identical scale to home */}
        <div className="space-y-2 max-w-[280px]">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            {headline}
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {sub}
          </p>
        </div>

        {/* Phase badge + Step list — replaces the icon row from home */}
        <div className="w-full max-w-[280px] space-y-3 pt-2 border-t border-zinc-800/60">
          <p className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase text-left">
            {phaseLabel}
          </p>
          {steps.map((step, i) => (
            <StepRow
              key={step.label}
              label={step.label}
              hint={step.hint}
              done={i < activeStep}
              active={i === activeStep}
              stepNumber={i + 1}
            />
          ))}
        </div>
      </div>

      {/* ── Footer — same slot as the button on home ── */}
      {(hasJobId || hasClipSaved) && (
        <div className="shrink-0 text-center pt-2">
          <button
            onClick={onCancel}
            className="w-full text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors text-center py-1 cursor-pointer"
          >
            Cancel &amp; redo
          </button>
        </div>
      )}
    </div>
  );
}

function StepRow({ label, hint, done, active, stepNumber }) {
  return (
    <div className="flex items-start gap-3 text-left">
      {/* Dot indicator */}
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all ${
          done
            ? "bg-zinc-700 text-zinc-400"
            : active
            ? "bg-zinc-100 text-zinc-950"
            : "bg-zinc-900 border border-zinc-800 text-zinc-600"
        }`}
      >
        {done ? (
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : active ? (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 block" />
        ) : (
          <span className="text-[9px] font-mono">{stepNumber}</span>
        )}
      </div>

      {/* Label & hint */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              done
                ? "text-zinc-500 line-through"
                : active
                ? "text-zinc-100 font-medium"
                : "text-zinc-500"
            }`}
          >
            {label}
          </span>
          {active && (
            <span className="text-[10px] font-mono text-zinc-400">Running</span>
          )}
        </div>
        {active && (
          <p className="text-[11px] text-zinc-500 mt-0.5 animate-fadein">{hint}</p>
        )}
      </div>
    </div>
  );
}
