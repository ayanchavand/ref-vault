import { useState, useRef, useEffect } from "react";
import type { ProjectInfo } from "@reference-vault/shared";
import { Folder, ChevronDown, Plus, Check, Loader2, Sparkles, X } from "lucide-react";
import { createProject } from "../../lib/api";

interface ProjectSelectorProps {
  projects: ProjectInfo[];
  activeProject: ProjectInfo | null;
  onSelectProject: (project: ProjectInfo) => void;
  onProjectCreated: (project: ProjectInfo) => void;
}

export function ProjectSelector({
  projects,
  activeProject,
  onSelectProject,
  onProjectCreated,
}: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const res = await createProject(newProjectName.trim());
      onProjectCreated(res.project);
      setNewProjectName("");
      setIsModalOpen(false);
      setIsOpen(false);
    } catch (err: any) {
      setError(err?.message || "Failed to create project");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.1)] transition hover:bg-amber-400/20 hover:border-amber-400/40 active:scale-[0.98]"
      >
        <Folder className="h-3.5 w-3.5 text-amber-400" />
        <span className="max-w-[140px] truncate font-medium">
          {activeProject ? activeProject.name : "Select Project"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-amber-400/70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl border border-white/[0.1] bg-[#0E1015]/95 p-1.5 shadow-2xl backdrop-blur-xl z-50 animate-[rv-slide-down_0.15s_ease-out]">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/[0.06] mb-1">
            <span className="font-mono text-[0.62rem] uppercase tracking-wider text-white/40">
              Projects ({projects.length})
            </span>
            <span className="font-mono text-[0.55rem] uppercase tracking-widest text-amber-400/60">
              /library
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
            {projects.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-white/40">
                No projects found
              </div>
            ) : (
              projects.map((proj) => {
                const isActive = activeProject?.path === proj.path;
                return (
                  <button
                    key={proj.path}
                    type="button"
                    onClick={() => {
                      onSelectProject(proj);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-xs text-left transition ${
                      isActive
                        ? "bg-amber-400/15 text-amber-300 font-semibold"
                        : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-amber-400" : "text-white/40"}`} />
                      <span className="truncate">{proj.name}</span>
                    </div>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-amber-400 ml-2" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Action Footer */}
          <div className="pt-1.5 border-t border-white/[0.06] mt-1">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
                setIsOpen(false);
              }}
              className="flex items-center justify-center gap-2 w-full rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-amber-400 hover:text-[#0A0B0D]"
            >
              <Plus className="h-3.5 w-3.5" />
              New Project
            </button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-[rv-fade-up_0.2s_ease-out]">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0E1015] p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-white">Create New Project</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-white/40 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Character Animation, Environment Ref..."
                  autoFocus
                  className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-amber-400/70 focus:outline-none"
                />
                <p className="text-[0.68rem] text-white/40 pl-1">
                  Will be created under <code className="text-amber-300/80 font-mono">/library/{newProjectName ? newProjectName.trim().toLowerCase().replace(/\s+/g, '-') : "name"}</code> with video & media folders auto-initialized.
                </p>
              </div>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.08] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newProjectName.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 py-2 text-xs font-semibold text-[#0A0B0D] hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
