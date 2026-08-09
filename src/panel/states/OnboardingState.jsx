import { useState, useEffect, useCallback, useRef } from "react";
import { Gauge, Zap, RefreshCw } from "lucide-react";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import Button from "../../components/ui/Button.jsx";
import Logo from "../../components/ui/Logo.jsx";
import { GENERATION_PRESETS, API_ROUTES } from "../../lib/constants.js";

const TOTAL_STEPS = 4;

const REQUIRED_KEYS = [
  {
    id: "gemini",
    name: "Google Gemini",
    purpose: "Script & narration generation",
    url: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "pexels",
    name: "Pexels",
    purpose: "Background video clips",
    url: "https://www.pexels.com/api/",
  },
  {
    id: "mimo",
    name: "Mimo TTS",
    purpose: "Text-to-speech narration",
    url: "https://platform.xiaomimimo.com/console/api-keys",
  },
];

const OPTIONAL_KEYS = [
  {
    id: "groq",
    name: "Groq",
    purpose: "Alternative LLM (faster inference)",
    url: "https://console.groq.com/keys",
  },
  {
    id: "pixabay",
    name: "Pixabay",
    purpose: "Additional royalty-free assets",
    url: "https://pixabay.com/api/docs/",
  },
];

export default function OnboardingState({
  settings,
  updateSettings,
  onComplete,
  onStepChange,
}) {
  const [step, setStep] = useState(1);
  const prevStepRef = useRef(1);
  const [name, setName] = useState(
    settings?.user_name && settings.user_name !== "friend"
      ? settings.user_name
      : "",
  );
  const [preset, setPreset] = useState(
    settings?.preset ?? GENERATION_PRESETS.NORMAL,
  );
  const [keyStatus, setKeyStatus] = useState(null);
  const [backendReachable, setBackendReachable] = useState(null);
  const [checking, setChecking] = useState(false);
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Track previous step for conditional animation
  useEffect(() => {
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    // After first render, disable initial mount flag
    if (isInitialMount) {
      setIsInitialMount(false);
    }
  }, [isInitialMount]);

  // Notify parent of step changes for header animation
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Check backend health and key status
  const checkBackend = useCallback(() => {
    setChecking(true);
    const startedAt = Date.now();

    return fetch(API_ROUTES.HEALTH, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json())
      .then((data) => {
        setKeyStatus(data.keys ?? {});
        setBackendReachable(true);
      })
      .catch(() => {
        setKeyStatus({});
        setBackendReachable(false);
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, 500 - elapsed);
        setTimeout(() => setChecking(false), remaining);
      });
  }, []);

  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const missingRequired = keyStatus
    ? REQUIRED_KEYS.filter((k) => keyStatus[k.id] === false)
    : [];

  // Prevent progress indicator flicker by assuming TOTAL_STEPS until we know otherwise
  const needsConfigStep =
    backendReachable === null
      ? true // default to showing config step during initial load
      : backendReachable === false || missingRequired.length > 0;
  const visibleSteps = needsConfigStep ? TOTAL_STEPS : TOTAL_STEPS - 1;

  const goNext = () => setStep((s) => s + 1);
  const goBack = () => setStep((s) => s - 1);

  const saveNameAndNext = () => {
    updateSettings({ user_name: name.trim() || "friend" });
    goNext();
  };

  const savePresetAndNext = () => {
    updateSettings({ preset });
    if (!needsConfigStep) {
      finish();
    } else {
      goNext();
    }
  };

  const finish = useCallback(() => {
    updateSettings({
      user_name: name.trim() || "friend",
      preset,
      onboarding_complete: true,
    });
    onComplete?.();
  }, [name, preset, updateSettings, onComplete]);

  // Auto-complete onboarding if user is on step 4 but no longer needs config
  // This handles the case where backend comes online or keys are added mid-step-4
  useEffect(() => {
    if (step === 4 && !needsConfigStep && backendReachable !== null) {
      finish();
    }
  }, [step, needsConfigStep, backendReachable, finish]);

  const isComingFromStep1 = prevStepRef.current === 1 && step === 2;

  return (
    <MotionConfig transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}>
      <div className="flex flex-col h-full max-w-xs">
        {/* Step progress bar */}
        <div className="flex items-center gap-1.5 mb-6 shrink-0">
          {Array.from({ length: visibleSteps }).map((_, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === step;
            const isCompleted = stepNum < step;
            return (
              <div
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                  isActive
                    ? "bg-fg"
                    : isCompleted
                      ? "bg-fg-subtle"
                      : "bg-border"
                }`}
              />
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <div key={step} className="flex-1 relative overflow-hidden">
            {step === 1 ? (
              <StepWelcome onNext={goNext} showLogo={true} />
            ) : step === 2 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  delay: isComingFromStep1 ? 0.6 : 0,
                  duration: 0.3,
                }}
                className="h-full"
              >
                <StepPersonalise
                  name={name}
                  setName={setName}
                  onNext={saveNameAndNext}
                  onBack={goBack}
                />
              </motion.div>
            ) : step === 3 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <StepPreferences
                  preset={preset}
                  setPreset={setPreset}
                  onNext={savePresetAndNext}
                  onBack={goBack}
                  skipBackend={!needsConfigStep}
                />
              </motion.div>
            ) : step === 4 && needsConfigStep ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <StepBackend
                  backendReachable={backendReachable}
                  keyStatus={keyStatus}
                  missingRequired={missingRequired}
                  checking={checking}
                  onRecheck={checkBackend}
                  onFinish={finish}
                  onBack={goBack}
                />
              </motion.div>
            ) : null}
          </div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function StepWelcome({ onNext, showLogo = true }) {
  return (
    <div className="flex h-full flex-col animate-fadein">
      <div className="flex-1 flex flex-col justify-center">
        {/* TODO(prash)
            Replace with the final animated hero.
            Asset:
            - Transparent SVG/Lottie
            - ~220x180
            - White line-art
            - Slight breathing animation
        */}

        <div className="flex justify-center mb-8">
          {showLogo && <Logo size="medium" />}
        </div>

        <div className="space-y-3">
          <h1 className="text-[30px] font-semibold tracking-[-0.04em] leading-tight">
            Reset your focus,
            <br />
            <span className="text-fg-muted">gracefully.</span>
          </h1>

          <p className="max-w-[300px] text-sm leading-6 text-fg-muted">
            A quick check-in becomes a personalized reflection reel while you
            continue your work.
          </p>
        </div>

        <div className="mt-10 space-y-4">
          {[
            "Private by default",
            "Runs locally",
            "Notifies you when ready",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 text-sm text-fg-muted"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <Button variant="primary" className="w-full h-11" onClick={onNext}>
        Get Started
      </Button>
    </div>
  );
}

function StepPersonalise({ name, setName, onNext, onBack }) {
  const hasName = name.trim().length > 0;

  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.025em] mb-1.5">
        What should we call you?
      </h1>
      <p className="text-[13px] text-fg-muted leading-relaxed mb-5">
        Used in your reel narration. Entirely optional.
      </p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onNext()}
        placeholder="e.g. Alex"
        autoFocus
        className="w-full bg-surface-raised border border-border rounded-[8px] px-4 py-2.5 text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none focus:border-fg-subtle focus:ring-1 focus:ring-fg/10 transition-all"
      />

      <div className="flex items-center gap-3 mt-auto">
        <Button variant="subtle" onClick={onBack}>
          Back
        </Button>
        <Button
          variant={hasName ? "primary" : "ghost"}
          className="flex-1"
          onClick={onNext}
        >
          {hasName ? "Continue" : "Skip"}
        </Button>
      </div>
    </div>
  );
}

function StepPreferences({ preset, setPreset, onNext, onBack, skipBackend }) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.025em] mb-1.5">
        Generation speed.
      </h1>
      <p className="text-[13px] text-fg-muted leading-relaxed mb-5">
        How the reel pipeline uses your machine. Changeable later.
      </p>

      <div className="flex flex-col gap-2 mb-6">
        <PresetCard
          id={GENERATION_PRESETS.NORMAL}
          selected={preset === GENERATION_PRESETS.NORMAL}
          onClick={() => setPreset(GENERATION_PRESETS.NORMAL)}
          title="Normal"
          Icon={Gauge}
          description="Balanced CPU usage. Runs quietly while you work."
        />
        <PresetCard
          id={GENERATION_PRESETS.FAST}
          selected={preset === GENERATION_PRESETS.FAST}
          onClick={() => setPreset(GENERATION_PRESETS.FAST)}
          title="Fast"
          Icon={Zap}
          description="Multi-core rendering. Quicker output, brief CPU spike."
        />
      </div>

      <div className="flex items-center gap-3 mt-auto">
        <Button variant="subtle" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" onClick={onNext}>
          {skipBackend ? "Complete setup" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function PresetCard({ selected, onClick, title, Icon, description }) {
  return (
    <div
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onClick()}
      className={`p-4 rounded-[10px] border cursor-pointer transition-all select-none outline-none focus-visible:ring-1 focus-visible:ring-fg/20 ${
        selected
          ? "border-fg-subtle bg-surface-raised"
          : "border-border bg-surface hover:border-fg-subtle/40"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon size={14} className={selected ? "text-fg" : "text-fg-subtle"} />
          <span
            className={`text-[13px] font-medium ${selected ? "text-fg" : "text-fg-muted"}`}
          >
            {title}
          </span>
        </div>
        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            selected ? "border-fg" : "border-border"
          }`}
        >
          {selected && <div className="w-1.5 h-1.5 rounded-full bg-fg" />}
        </div>
      </div>
      <p className="text-[12px] text-fg-subtle leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function StepBackend({
  backendReachable,
  keyStatus,
  missingRequired,
  checking,
  onRecheck,
  onFinish,
  onBack,
}) {
  return (
    <div className="flex flex-col h-full animate-fadein">
      <h1 className="text-[20px] font-semibold leading-snug tracking-tight mb-3">
        API keys needed.
      </h1>

      {backendReachable === false ? (
        <div className="bg-surface-raised border border-border rounded-lg px-4 py-3 mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[12.5px] text-fg font-medium mb-0.5">
              Backend not running
            </p>
            <p className="text-[12px] text-fg-muted leading-relaxed">
              Run{" "}
              <code className="font-mono text-[11px] bg-bg px-1.5 py-0.5 rounded text-fg">
                cd backend &amp;&amp; npm start
              </code>{" "}
              then recheck.
            </p>
          </div>
          <button
            onClick={onRecheck}
            disabled={checking}
            className="shrink-0 mt-0.5 p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-bg transition-colors disabled:opacity-40"
            aria-label="Recheck backend connection"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-fg-muted leading-relaxed mb-4">
          Add missing keys to{" "}
          <code className="font-mono text-[11px] bg-surface-raised px-1.5 py-0.5 rounded text-fg">
            backend/.env
          </code>
          . They never leave your machine.
        </p>
      )}

      <div className="flex flex-col gap-1.5 mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-1">
          Required
        </p>
        {REQUIRED_KEYS.map((k) => (
          <KeyRow
            key={k.id}
            provider={k}
            configured={keyStatus?.[k.id] ?? null}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1.5 mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-fg-subtle mb-1">
          Optional
        </p>
        {OPTIONAL_KEYS.map((k) => (
          <KeyRow
            key={k.id}
            provider={k}
            configured={keyStatus?.[k.id] ?? null}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-auto">
        <Button variant="subtle" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={onFinish}
          disabled={backendReachable === null}
        >
          {backendReachable === false || missingRequired.length > 0
            ? "Continue anyway"
            : "Complete setup"}
        </Button>
      </div>
    </div>
  );
}

function KeyRow({ provider, configured }) {
  const isConfigured = configured === true;
  const isMissing = configured === false;

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-surface border border-border">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-fg truncate">
          {provider.name}
        </div>
        <div className="text-[11px] text-fg-subtle truncate">
          {provider.purpose}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`font-mono text-[10px] px-2 py-0.5 rounded-full ${
            isConfigured
              ? "text-fg-muted bg-surface-raised"
              : isMissing
                ? "text-fg-subtle bg-bg"
                : "text-fg-subtle"
          }`}
        >
          {isConfigured ? "✓ set" : isMissing ? "missing" : "—"}
        </span>
        {isMissing && (
          <a
            href={provider.url}
            target="_blank"
            rel="noreferrer"
            className="text-[10.5px] text-fg-muted hover:text-fg transition-colors font-mono underline underline-offset-2"
          >
            Get key →
          </a>
        )}
      </div>
    </div>
  );
}
