import { useState, useEffect, useRef } from "react";
import {
  Film,
  FolderOpen,
  Image,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Scissors,
  Tag,
  Zap,
  ChevronRight,
  AlertCircle,
  Loader2,
  SkipForward,
  Play,
  HardDrive,
  Library,
} from "lucide-react";
import { validateLibraryRoot, initLibrary, ApiError } from "../../lib/api";

interface OnboardingProps {
  onComplete(videoPath: string, mediaPath: string | null): void;
}

// ─── Animated Background Grid ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Dot grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(251,191,36,0.12) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)",
        }}
      />
      {/* Glow orbs */}
      <div
        style={{
          position: "absolute",
          top: "-10%",
          left: "-5%",
          width: "50%",
          height: "60%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(251,191,36,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "-5%",
          width: "55%",
          height: "60%",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
    </div>
  );
}

// ─── Step definition ───────────────────────────────────────────────────────────
type StepId = "welcome" | "video-library" | "media-library" | "complete";

interface Step {
  id: StepId;
  label: string;
  icon: React.ElementType;
}

const STEPS: Step[] = [
  { id: "welcome", label: "Welcome", icon: Sparkles },
  { id: "video-library", label: "Video Library", icon: Library },
  { id: "media-library", label: "Media Library", icon: Image },
  { id: "complete", label: "All Set", icon: CheckCircle2 },
];

// ─── Sidebar Step Indicator ───────────────────────────────────────────────────
function StepSidebar({
  currentStep,
  completedSteps,
}: {
  currentStep: StepId;
  completedSteps: Set<StepId>;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <aside className="hidden lg:flex flex-col gap-0 w-60 shrink-0 py-4">
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isDone = completedSteps.has(step.id);
        const isFuture = idx > currentIdx;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-stretch">
            <div className="flex flex-col items-center mr-4">
              <div
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  isDone
                    ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                    : isActive
                    ? "border-amber-400 bg-amber-400/15 text-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.35)]"
                    : "border-white/15 bg-white/[0.03] text-white/25"
                }`}
                style={
                  isActive
                    ? { animation: "rv-step-pulse 2.5s ease-in-out infinite" }
                    : {}
                }
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`w-px flex-1 mt-1 mb-1 transition-all duration-700 ${
                    isDone ? "bg-emerald-400/40" : "bg-white/[0.08]"
                  }`}
                  style={{ minHeight: 32 }}
                />
              )}
            </div>

            <div className={`flex flex-col justify-start pt-1 pb-${idx < STEPS.length - 1 ? "9" : "0"}`}>
              <span
                className={`text-[0.7rem] font-mono uppercase tracking-widest transition-colors duration-300 ${
                  isDone
                    ? "text-emerald-400/70"
                    : isActive
                    ? "text-amber-400"
                    : "text-white/25"
                }`}
              >
                Step {idx + 1}
              </span>
              <span
                className={`text-sm font-semibold mt-0.5 transition-colors duration-300 ${
                  isDone
                    ? "text-emerald-300/80"
                    : isActive
                    ? "text-white"
                    : isFuture
                    ? "text-white/25"
                    : "text-white/50"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

// ─── Mobile Step Bar ───────────────────────────────────────────────────────────
function MobileStepBar({
  currentStep,
  completedSteps,
}: {
  currentStep: StepId;
  completedSteps: Set<StepId>;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentIdx) / (STEPS.length - 1)) * 100;

  return (
    <div className="flex flex-col gap-2 mb-6 lg:hidden">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/40">
          Step {currentIdx + 1} of {STEPS.length}
        </span>
        <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber-400/70">
          {STEPS[currentIdx]?.label}
        </span>
      </div>
      <div className="h-0.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(251,191,36,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((step, idx) => (
          <div
            key={step.id}
            className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${
              completedSteps.has(step.id)
                ? "bg-emerald-400"
                : idx === currentIdx
                ? "bg-amber-400"
                : "bg-white/[0.06]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Path Input with Validation ────────────────────────────────────────────────
type ValidationState = "idle" | "validating" | "valid" | "error";

function PathInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  validationState,
  errorMessage,
  onValidate,
  hint,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange(v: string): void;
  validationState: ValidationState;
  errorMessage: string | null;
  onValidate(): void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const borderColor =
    validationState === "valid"
      ? "border-emerald-400/50 focus-within:border-emerald-400"
      : validationState === "error"
      ? "border-rose-400/50 focus-within:border-rose-400"
      : "border-white/[0.10] focus-within:border-amber-400/60";

  const iconColor =
    validationState === "valid"
      ? "text-emerald-400"
      : validationState === "error"
      ? "text-rose-400"
      : "text-white/30";

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50"
      >
        {label}
      </label>

      <div
        className={`flex items-center gap-2 rounded-xl border ${borderColor} bg-white/[0.03] px-3 py-2.5 transition-all duration-200 group`}
        style={{ backdropFilter: "blur(8px)" }}
      >
        <HardDrive className={`h-4 w-4 shrink-0 transition-colors duration-200 ${iconColor}`} />
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onValidate();
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {validationState === "validating" && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400/60" />
        )}
        {validationState === "valid" && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        )}
        {validationState === "error" && (
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        )}
      </div>

      {hint && validationState === "idle" && (
        <p className="text-[0.68rem] text-white/30 pl-1">{hint}</p>
      )}

      {validationState === "error" && errorMessage && (
        <p
          className="flex items-center gap-1.5 text-[0.68rem] text-rose-400 pl-1"
          style={{ animation: "rv-shake 0.4s ease-in-out both" }}
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          {errorMessage}
        </p>
      )}

      {validationState === "valid" && (
        <p
          className="flex items-center gap-1.5 text-[0.68rem] text-emerald-400 pl-1"
          style={{ animation: "rv-success-in 0.3s ease-out both" }}
        >
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          Path verified — ready to use
        </p>
      )}
    </div>
  );
}

// ─── Step: Welcome ─────────────────────────────────────────────────────────────
function WelcomeStep({ onNext }: { onNext(): void }) {
  const features = [
    {
      icon: Film,
      title: "Organize Video Reference",
      desc: "Give hundreds of gigs of motion ref, gameplay, and clips a searchable home in plain folders.",
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
    },
    {
      icon: Scissors,
      title: "Cut Clips & Capture Frames",
      desc: "Trim clips and grab frame captures mid-scrub directly without needing a separate video editor.",
      color: "text-sky-400",
      bg: "bg-sky-400/10 border-sky-400/20",
    },
    {
      icon: Tag,
      title: "Tags, Notes & Custom Fields",
      desc: "Tag reference, leave notes, star rate clips, and shape custom metadata fields to how you work.",
      color: "text-purple-400",
      bg: "bg-purple-400/10 border-purple-400/20",
    },
    {
      icon: Zap,
      title: "Images, GIFs & Inspiration",
      desc: "Store concept art, screenshots, and animated loops in a dedicated visual inspiration feed.",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
    },
  ];

  return (
    <div
      className="flex flex-col gap-8"
      style={{ animation: "rv-fade-up 0.5s ease-out both" }}
    >
      {/* Hero */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 font-mono text-xl font-bold text-[#0A0B0D] shadow-[0_0_30px_rgba(251,191,36,0.4)]">
            RV
          </span>
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-amber-400/70">
              Reference Vault
            </p>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Visual reference manager for creators
            </h1>
          </div>
        </div>

        <p className="text-sm text-white/50 leading-relaxed max-w-lg">
          The single searchable library for all your visual inspiration — videos, clips, images, GIFs, and screenshots.
          No subscriptions, no cloud sync, and no accounts required. Everything stays sitting in plain folders on your computer that you control.
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {features.map((f, i) => (
          <div
            key={f.title}
            className={`flex gap-3 rounded-xl border ${f.bg} p-3.5`}
            style={{
              animation: `rv-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both`,
              animationDelay: `${i * 60 + 100}ms`,
            }}
          >
            <f.icon className={`h-5 w-5 shrink-0 mt-0.5 ${f.color}`} />
            <div>
              <p className={`text-xs font-semibold ${f.color}`}>{f.title}</p>
              <p className="text-xs text-white/50 mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filesystem note */}
      <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <HardDrive className="h-4 w-4 shrink-0 mt-0.5 text-amber-400/70" />
        <p className="text-xs text-white/40 leading-relaxed">
          <span className="text-white/60 font-medium">Your machine, your rules.</span>{" "}
          Your files never leave your computer. All metadata sits alongside your media in plain JSON files — no database corruption, no vendor lock-in.
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onNext}
        className="group inline-flex items-center gap-2 self-start rounded-xl bg-amber-400 px-6 py-3 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(251,191,36,0.45)] active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        Get started
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

// ─── Step: Video Library ───────────────────────────────────────────────────────
function VideoLibraryStep({
  onNext,
  onPathValidated,
  onMediaPathValidated,
}: {
  onNext(skipMedia?: boolean): void;
  onPathValidated(path: string): void;
  onMediaPathValidated(path: string | null): void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [pathInput, setPathInput] = useState("");
  const [createPathInput, setCreatePathInput] = useState("");

  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validatedPath, setValidatedPath] = useState<string | null>(null);

  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [initSuccess, setInitSuccess] = useState(false);
  const [initializedVideoPath, setInitializedVideoPath] = useState<string | null>(null);
  const [initializedMediaPath, setInitializedMediaPath] = useState<string | null>(null);

  async function handleValidate() {
    if (!pathInput.trim()) {
      setValidationState("error");
      setErrorMessage("Please enter a folder path.");
      return;
    }
    setValidationState("validating");
    setErrorMessage(null);
    try {
      const res = await validateLibraryRoot(pathInput.trim());
      setValidatedPath(res.rootPath);
      setPathInput(res.rootPath);
      setValidationState("valid");
    } catch (err) {
      setValidationState("error");
      setErrorMessage(
        err instanceof ApiError ? err.message : "Could not access this folder."
      );
    }
  }

  function handleContinue() {
    if (validatedPath) {
      onPathValidated(validatedPath);
      onNext();
    }
  }

  async function handleInitLibrary() {
    if (!createPathInput.trim()) {
      setInitError("Please enter a folder path.");
      return;
    }
    setIsInitializing(true);
    setInitError(null);
    setInitSuccess(false);
    try {
      const res = await initLibrary({ targetPath: createPathInput.trim() });
      setInitializedVideoPath(res.videoPath);
      setInitializedMediaPath(res.mediaPath);
      setInitSuccess(true);
    } catch (err) {
      setInitError(
        err instanceof ApiError ? err.message : "Could not initialize library in this folder."
      );
    } finally {
      setIsInitializing(false);
    }
  }

  function handleContinueWithInitialized() {
    if (initializedVideoPath && initializedMediaPath) {
      onPathValidated(initializedVideoPath);
      onMediaPathValidated(initializedMediaPath);
      onNext(true); // skips media library setup step
    }
  }

  const examplePaths = [
    "/home/user/Videos/references",
    "/Users/user/Movies/references",
    "C:\\Users\\user\\Videos\\references",
  ];

  return (
    <div
      className="flex flex-col gap-7"
      style={{ animation: "rv-fade-up 0.45s ease-out both" }}
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Library className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-bold tracking-tight text-white">
            Video Library
          </h2>
        </div>
        <p className="text-sm text-white/50 leading-relaxed">
          Choose where Reference Vault should store your videos and reference files. You can set up a new folder automatically, or connect one you already have.
        </p>
      </div>

      {/* Mode selection buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => {
            setMode("new");
            setErrorMessage(null);
            setValidationState("idle");
          }}
          className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all duration-300 ${
            mode === "new"
              ? "border-amber-400 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.1)]"
              : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
          }`}
        >
          <span className="flex items-center justify-between w-full">
            <span className={`text-xs font-bold ${mode === "new" ? "text-amber-400" : "text-white"}`}>
              Create a New Folder
            </span>
            <span className="rounded-full bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider font-bold text-amber-400">
              Recommended
            </span>
          </span>
          <span className="text-[0.7rem] text-white/50 mt-1 leading-relaxed">
            Create a fresh workspace. We will set up organized folders for your videos and images automatically.
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("existing");
            setErrorMessage(null);
            setValidationState("idle");
          }}
          className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all duration-300 ${
            mode === "existing"
              ? "border-amber-400 bg-amber-400/5 shadow-[0_0_15px_rgba(251,191,36,0.1)]"
              : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
          }`}
        >
          <span className={`text-xs font-bold ${mode === "existing" ? "text-amber-400" : "text-white"}`}>
            Use an Existing Folder
          </span>
          <span className="text-[0.7rem] text-white/50 mt-1 leading-relaxed">
            Connect a folder of videos that you already have organized on your computer.
          </span>
        </button>
      </div>

      {mode === "new" && (
        <div className="space-y-4 animate-[rv-slide-down_0.25s_ease-out]">
          <div className="space-y-2">
            <label
              htmlFor="create-library-path"
              className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50"
            >
              New Folder Location
            </label>

            <div
              className={`flex items-center gap-2 rounded-xl border ${
                initSuccess
                  ? "border-emerald-400/50"
                  : initError
                  ? "border-rose-400/50"
                  : "border-white/[0.10] focus-within:border-amber-400/60"
              } bg-white/[0.03] px-3 py-2.5 transition-all duration-200`}
            >
              <HardDrive className={`h-4 w-4 shrink-0 ${initSuccess ? "text-emerald-400" : initError ? "text-rose-400" : "text-white/30"}`} />
              <input
                id="create-library-path"
                type="text"
                value={createPathInput}
                onChange={(e) => {
                  setCreatePathInput(e.target.value);
                  setInitError(null);
                  setInitSuccess(false);
                }}
                placeholder="/absolute/path/to/create/your/vault"
                className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              {isInitializing && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400/60" />
              )}
              {initSuccess && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              )}
            </div>

            <p className="text-[0.68rem] text-white/40 leading-relaxed pl-1">
              Specify where you want to initialize the library.
              <br />
              • If the folder is empty, we will create the structure directly.
              <br />
              • If the folder has files, we will create a <code className="text-amber-300/70 font-mono text-[0.7rem]">refvault</code> folder inside to keep it neat.
            </p>
          </div>

          {initError && (
            <p className="flex items-center gap-1.5 text-[0.68rem] text-rose-400 pl-1">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {initError}
            </p>
          )}

          {initSuccess && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2 text-xs text-emerald-300">
              <p className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Folders successfully created!
              </p>
              <div className="font-mono text-[0.68rem] space-y-1 pl-5 text-white/70">
                <p>🎬 Videos: {initializedVideoPath}</p>
                <p>🖼️ Media: {initializedMediaPath}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!initSuccess ? (
              <button
                type="button"
                onClick={handleInitLibrary}
                disabled={isInitializing || !createPathInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isInitializing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-4 w-4" />
                    Set Up Folder
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleContinueWithInitialized}
                className="group inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300"
              >
                Continue
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "existing" && (
        <div className="space-y-6 animate-[rv-slide-down_0.25s_ease-out]">
          {/* Expected structure */}
          <div className="rounded-xl border border-white/[0.06] bg-[#0D0F12] p-4 font-mono text-xs text-white/50 space-y-1 overflow-x-auto">
            <p className="text-amber-300/60 text-[0.65rem] uppercase tracking-widest mb-2">How your video library is organized</p>
            <p><span className="text-white/30">📁</span> <span className="text-white/70">videos/</span></p>
            <p className="pl-4"><span className="text-white/30">📁</span> <span className="text-white/60">Parkour Jump/</span></p>
            <p className="pl-8"><span className="text-amber-400/60">🎬</span> <span className="text-amber-300/60">main.mp4</span> <span className="text-white/30 text-[0.65rem]">(source video file)</span></p>
            <p className="pl-8"><span className="text-white/30">📄</span> <span className="text-white/40">metadata.json</span> <span className="text-white/20 text-[0.6rem]">(tags, ratings & notes)</span></p>
            <p className="pl-8"><span className="text-white/30">📄</span> <span className="text-white/40">clips.json</span> <span className="text-white/20 text-[0.6rem]">(clip definitions)</span></p>
            <p className="pl-8"><span className="text-white/30">📁</span> <span className="text-white/40">clips/</span> <span className="text-white/20 text-[0.6rem]">(trimmed MP4 files)</span></p>
          </div>

          <PathInput
            id="video-library-path"
            label="Folder Path"
            placeholder="/absolute/path/to/your/videos"
            value={pathInput}
            onChange={(v) => {
              setPathInput(v);
              if (validationState !== "idle") {
                setValidationState("idle");
                setValidatedPath(null);
              }
            }}
            validationState={validationState}
            errorMessage={errorMessage}
            onValidate={handleValidate}
            hint="Enter the absolute path to your video reference folder, then click Verify."
          />

          {/* Example paths */}
          {validationState === "idle" && (
            <div className="space-y-1.5">
              <p className="font-mono text-[0.58rem] uppercase tracking-wider text-white/25">
                Example paths
              </p>
              <div className="flex flex-col gap-1">
                {examplePaths.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPathInput(p)}
                    className="text-left font-mono text-[0.68rem] text-white/35 hover:text-white/60 transition-colors px-2 py-1 rounded hover:bg-white/[0.04] truncate"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {validationState !== "valid" ? (
              <button
                type="button"
                onClick={handleValidate}
                disabled={validationState === "validating" || !pathInput.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {validationState === "validating" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking path…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Verify path
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleContinue}
                className="group inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300"
              >
                Continue
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step: Media Library ───────────────────────────────────────────────────────
function MediaLibraryStep({
  onNext,
  onSkip,
  onPathValidated,
}: {
  onNext(): void;
  onSkip(): void;
  onPathValidated(path: string | null): void;
}) {
  const [pathInput, setPathInput] = useState("");
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validatedPath, setValidatedPath] = useState<string | null>(null);

  async function handleValidate() {
    if (!pathInput.trim()) {
      setValidationState("error");
      setErrorMessage("Please enter a folder path.");
      return;
    }
    setValidationState("validating");
    setErrorMessage(null);
    try {
      const res = await validateLibraryRoot(pathInput.trim());
      setValidatedPath(res.rootPath);
      setPathInput(res.rootPath);
      setValidationState("valid");
    } catch (err) {
      setValidationState("error");
      setErrorMessage(
        err instanceof ApiError ? err.message : "Could not access this folder."
      );
    }
  }

  function handleContinue() {
    onPathValidated(validatedPath);
    onNext();
  }

  function handleSkip() {
    onPathValidated(null);
    onSkip();
  }

  return (
    <div
      className="flex flex-col gap-7"
      style={{ animation: "rv-fade-up 0.45s ease-out both" }}
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Image className="h-5 w-5 text-purple-400" />
          <h2 className="text-xl font-bold tracking-tight text-white">
            Media Library{" "}
            <span className="ml-1 rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-white/35">
              Optional
            </span>
          </h2>
        </div>
        <p className="text-sm text-white/50 leading-relaxed">
          The Media Library is a general inspiration dump for reference images, photos, concept art, animated GIFs, and short video loops. Keep them in organized subfolders so you can browse them as a randomized visual feed.
        </p>
      </div>

      {/* Media structure */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0D0F12] p-4 font-mono text-xs text-white/50 space-y-1">
        <p className="text-purple-300/60 text-[0.65rem] uppercase tracking-widest mb-2">Media Folder Structure</p>
        <p><span className="text-white/30">📁</span> <span className="text-white/70">media/</span></p>
        <p className="pl-4"><span className="text-white/30">📁</span> <span className="text-purple-300/60">images/</span> <span className="text-white/20 text-[0.6rem]">(concept art, photos & screenshots)</span></p>
        <p className="pl-4"><span className="text-white/30">📁</span> <span className="text-purple-300/60">gifs/</span> <span className="text-white/20 text-[0.6rem]">(animated loops & GIFs)</span></p>
        <p className="pl-4"><span className="text-white/30">📁</span> <span className="text-purple-300/60">videos/</span> <span className="text-white/20 text-[0.6rem]">(short video clips)</span></p>
      </div>

      {/* Path input */}
      <PathInput
        id="media-library-path"
        label="Folder Path"
        placeholder="/absolute/path/to/your/media"
        value={pathInput}
        onChange={(v) => {
          setPathInput(v);
          if (validationState !== "idle") {
            setValidationState("idle");
            setValidatedPath(null);
          }
        }}
        validationState={validationState}
        errorMessage={errorMessage}
        onValidate={handleValidate}
        hint="Optional — set a separate folder for images, GIFs, and short video refs."
      />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {validationState !== "valid" ? (
          <button
            type="button"
            onClick={handleValidate}
            disabled={validationState === "validating" || !pathInput.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {validationState === "validating" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking path…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Verify path
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleContinue}
            className="group inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300"
          >
            Continue
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )}

        <button
          type="button"
          onClick={handleSkip}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-white/60 transition-all duration-200 hover:bg-white/[0.06] hover:text-white"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ─── Step: Complete ────────────────────────────────────────────────────────────
function CompleteStep({
  videoPath,
  mediaPath,
  onLaunch,
}: {
  videoPath: string;
  mediaPath: string | null;
  onLaunch(): void;
}) {
  const [isLaunching, setIsLaunching] = useState(false);

  function handleLaunch() {
    setIsLaunching(true);
    onLaunch();
  }

  const items = [
    {
      label: "Video Library",
      value: videoPath,
      icon: Library,
      status: "ready" as const,
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/25",
    },
    {
      label: "Media Library",
      value: mediaPath ?? "Not configured",
      icon: Image,
      status: mediaPath ? ("ready" as const) : ("skipped" as const),
      color: mediaPath ? "text-purple-400" : "text-white/30",
      bg: mediaPath
        ? "bg-purple-400/10 border-purple-400/25"
        : "bg-white/[0.02] border-white/[0.06]",
    },
  ];

  return (
    <div
      className="flex flex-col gap-8"
      style={{ animation: "rv-fade-up 0.45s ease-out both" }}
    >
      {/* Header */}
      <div className="space-y-3">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 border border-emerald-400/30"
          style={{ animation: "rv-spring-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-white">
            You're all set! 🎬
          </h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Reference Vault is configured and ready. Here's a summary of your setup.
            You can change these anytime in Settings.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={item.label}
            className={`flex items-start gap-3.5 rounded-xl border ${item.bg} p-4`}
            style={{
              animation: `rv-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both`,
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div className={`mt-0.5 shrink-0 rounded-lg p-2 ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold ${item.color}`}>{item.label}</p>
              <p className="mt-0.5 truncate font-mono text-[0.7rem] text-white/50">
                {item.value}
              </p>
            </div>
            {item.status === "ready" && (
              <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-widest text-emerald-400">
                Ready
              </span>
            )}
            {item.status === "skipped" && (
              <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-widest text-white/30">
                Skipped
              </span>
            )}
          </div>
        ))}
      </div>

      {/* What's next hints */}
      <div className="space-y-2">
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-white/30">
          What's next
        </p>
        <div className="space-y-2">
          {[
            "Your video and media libraries will scan automatically on launch",
            "Cut clips directly out of longer video footage and grab frame captures mid-scrub",
            "Organize with searchable tags, star ratings, notes, and custom metadata fields",
            mediaPath
              ? "Browse your concept art, screenshots, and animated GIFs in the Media Feed"
              : "Set up a Media Library later anytime in Settings",
          ].map((hint, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400/60" />
              <p className="text-xs text-white/50">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Launch button */}
      <button
        type="button"
        onClick={handleLaunch}
        disabled={isLaunching}
        className="group inline-flex items-center justify-center gap-2 self-start rounded-xl bg-amber-400 px-7 py-3.5 text-sm font-bold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_10px_32px_rgba(251,191,36,0.5)] active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLaunching ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your library…
          </>
        ) : (
          <>
            <Play className="h-4 w-4 fill-current" />
            Open Reference Vault
          </>
        )}
      </button>
    </div>
  );
}

// ─── Main Onboarding Component ─────────────────────────────────────────────────
export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<StepId>("welcome");
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(new Set());
  const [videoPath, setVideoPath] = useState<string>("");
  const [mediaPath, setMediaPath] = useState<string | null>(null);

  function markComplete(step: StepId) {
    setCompletedSteps((prev) => new Set([...prev, step]));
  }

  function goToStep(step: StepId) {
    markComplete(currentStep);
    setCurrentStep(step);
  }

  // Save paths to localStorage as they're validated
  useEffect(() => {
    if (videoPath) {
      localStorage.setItem("reference-vault.library-root", videoPath);
    }
  }, [videoPath]);

  useEffect(() => {
    if (mediaPath) {
      localStorage.setItem("reference-vault.media-root", mediaPath);
    }
  }, [mediaPath]);

  function handleComplete() {
    onComplete(videoPath, mediaPath);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0A0B0D] px-4 py-8 sm:px-8">
      <GridBackground />

      {/* ─── Outer card ──────────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-4xl"
        style={{ animation: "rv-fade-up 0.5s ease-out both" }}
      >
        {/* Top header bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]"
              style={{ animation: "rv-step-pulse 2.5s ease-in-out infinite" }}
            />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/30">
              Reference Vault
            </span>
          </div>
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-white/20">
            Setup Wizard
          </span>
        </div>

        {/* Main content panel */}
        <div
          className="rounded-2xl border border-white/[0.07] bg-[#0E1012]/80 shadow-[0_32px_80px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)]"
          style={{ backdropFilter: "blur(24px)" }}
        >
          <div className="flex gap-0">
            {/* Left sidebar (desktop) */}
            <div className="hidden lg:block border-r border-white/[0.06] p-8">
              <StepSidebar
                currentStep={currentStep}
                completedSteps={completedSteps}
              />
            </div>

            {/* Content area */}
            <div className="flex-1 p-6 sm:p-10 min-w-0">
              {/* Mobile step bar */}
              <MobileStepBar
                currentStep={currentStep}
                completedSteps={completedSteps}
              />

              {/* Step content */}
              <div className="min-h-[28rem] flex flex-col">
                {currentStep === "welcome" && (
                  <WelcomeStep
                    onNext={() => goToStep("video-library")}
                  />
                )}

                {currentStep === "video-library" && (
                  <VideoLibraryStep
                    onPathValidated={(p) => setVideoPath(p)}
                    onMediaPathValidated={(p) => setMediaPath(p)}
                    onNext={(skipMedia?: boolean) => {
                      if (skipMedia) {
                        setCompletedSteps((prev) => new Set([...prev, "video-library", "media-library"]));
                        setCurrentStep("complete");
                      } else {
                        goToStep("media-library");
                      }
                    }}
                  />
                )}

                {currentStep === "media-library" && (
                  <MediaLibraryStep
                    onPathValidated={(p) => setMediaPath(p)}
                    onNext={() => goToStep("complete")}
                    onSkip={() => goToStep("complete")}
                  />
                )}

                {currentStep === "complete" && (
                  <CompleteStep
                    videoPath={videoPath}
                    mediaPath={mediaPath}
                    onLaunch={handleComplete}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom attribution */}
        <p className="mt-4 text-center font-mono text-[0.58rem] uppercase tracking-widest text-white/15">
          Local-first · Plain Folders & JSON · Free & Open Source · No Subscriptions
        </p>
      </div>

      {/* Extra keyframe for the step indicator pulse */}
      <style>{`
        @keyframes rv-step-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 0 6px rgba(251,191,36,0); }
        }
      `}</style>
    </div>
  );
}
