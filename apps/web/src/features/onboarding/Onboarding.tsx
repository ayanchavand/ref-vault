import { useState } from "react";
import {
  Film,
  Folder,
  Sparkles,
  Scissors,
  Tag,
  Zap,
  ArrowRight,
  Loader2,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import { createProject, ApiError } from "../../lib/api";
import type { ProjectInfo } from "@reference-vault/shared";

interface OnboardingProps {
  onComplete(project: ProjectInfo): void;
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

export function Onboarding({ onComplete }: OnboardingProps) {
  const [projectName, setProjectName] = useState("Default");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) {
      setError("Please enter a project name.");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const res = await createProject(projectName.trim());
      onComplete(res.project);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create project. Please try again."
      );
    } finally {
      setIsCreating(false);
    }
  }

  const features = [
    {
      icon: Film,
      title: "Organize Video Reference",
      desc: "Give your motion ref, gameplay, and clips a searchable home in plain project folders.",
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
    },
    {
      icon: Scissors,
      title: "Cut Clips & Frame Captures",
      desc: "Trim clips and grab frame captures mid-scrub directly without extra editing software.",
      color: "text-sky-400",
      bg: "bg-sky-400/10 border-sky-400/20",
    },
    {
      icon: Tag,
      title: "Tags, Notes & Metadata",
      desc: "Tag reference, rate clips, leave notes, and customize your reference metadata.",
      color: "text-purple-400",
      bg: "bg-purple-400/10 border-purple-400/20",
    },
    {
      icon: Zap,
      title: "Images, GIFs & Moodboards",
      desc: "Store concept art, screenshots, and animated loops in a visual inspiration feed.",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#0A0B0D] text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
      <GridBackground />

      <div className="relative z-10 w-full max-w-2xl space-y-8 animate-[rv-fade-up_0.5s_ease-out_both]">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 font-mono text-xl font-bold text-[#0A0B0D] shadow-[0_0_30px_rgba(251,191,36,0.4)]">
            RV
          </span>
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-amber-400/70">
              Reference Vault
            </p>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Create Your First Project
            </h1>
          </div>
        </div>

        {/* Card Panel */}
        <div
          className="rounded-2xl border border-white/[0.08] bg-[#0E1012]/90 p-6 sm:p-8 shadow-[0_32px_80px_rgba(0,0,0,0.7)] space-y-6"
          style={{ backdropFilter: "blur(24px)" }}
        >
          <p className="text-sm text-white/60 leading-relaxed">
            Welcome! Reference Vault organizes your reference material into projects inside your <code className="text-amber-300 font-mono text-xs">/library</code> folder.
            To get started, simply type a name for your project below.
          </p>

          {/* Project Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="project-name"
                className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50"
              >
                Project Name
              </label>

              <div className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 focus-within:border-amber-400/70 transition-all duration-200">
                <Folder className="h-5 w-5 shrink-0 text-amber-400" />
                <input
                  id="project-name"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Default, Combat Animation, Moodboards..."
                  className="flex-1 bg-transparent text-base text-white placeholder:text-white/25 focus:outline-none"
                  autoFocus
                  spellCheck={false}
                />
              </div>

              <p className="text-xs text-white/40 leading-relaxed pl-1">
                This will automatically set up <code className="text-amber-300/80 font-mono text-[0.7rem]">refvault_videos</code> and <code className="text-amber-300/80 font-mono text-[0.7rem]">refvault_media</code> subfolders under <code className="text-white/60 font-mono text-[0.7rem]">/library/{projectName.trim() ? projectName.trim().toLowerCase().replace(/\s+/g, '-') : "name"}</code>.
              </p>
            </div>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isCreating || !projectName.trim()}
              className="group inline-flex items-center justify-center gap-2 w-full rounded-xl bg-amber-400 px-6 py-3.5 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:shadow-[0_8px_28px_rgba(251,191,36,0.45)] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  Create Project & Start
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-white/[0.06]">
            {features.map((f) => (
              <div
                key={f.title}
                className={`flex gap-3 rounded-xl border ${f.bg} p-3`}
              >
                <f.icon className={`h-4 w-4 shrink-0 mt-0.5 ${f.color}`} />
                <div>
                  <p className={`text-xs font-semibold ${f.color}`}>{f.title}</p>
                  <p className="text-[0.7rem] text-white/50 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Note */}
        <div className="flex items-center justify-center gap-2 text-center text-xs text-white/30 font-mono">
          <HardDrive className="h-3.5 w-3.5 text-amber-400/50" />
          Local-first · Plain Folders & JSON · Switch Projects Anytime
        </div>
      </div>
    </div>
  );
}
