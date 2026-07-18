import { FormEvent, useEffect, useState } from "react";
import { FolderOpen, Settings as SettingsIcon, CheckCircle, AlertCircle, Unlink } from "lucide-react";
import { ApiError, validateLibraryRoot } from "../../lib/api";

const videoStorageKey = "reference-vault.library-root";
const mediaStorageKey = "reference-vault.media-root";

interface SettingsProps {
  onVideoLibraryChange(newPath: string): void | Promise<void>;
  onForgetVideoLibrary(): void;
  onMediaLibraryChange(newPath: string): void | Promise<void>;
  onForgetMediaLibrary(): void;
}

export function Settings({
  onVideoLibraryChange,
  onForgetVideoLibrary,
  onMediaLibraryChange,
  onForgetMediaLibrary,
}: SettingsProps) {
  const [videoPathInput, setVideoPathInput] = useState(() => localStorage.getItem(videoStorageKey) ?? "");
  const [activeVideoPath, setActiveVideoPath] = useState(() => localStorage.getItem(videoStorageKey) ?? "");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isVideoSubmitting, setIsVideoSubmitting] = useState(false);
  const [videoSuccess, setVideoSuccess] = useState(false);

  const [mediaPathInput, setMediaPathInput] = useState(() => localStorage.getItem(mediaStorageKey) ?? "");
  const [activeMediaPath, setActiveMediaPath] = useState(() => localStorage.getItem(mediaStorageKey) ?? "");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isMediaSubmitting, setIsMediaSubmitting] = useState(false);
  const [mediaSuccess, setMediaSuccess] = useState(false);

  async function handleVideoSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setVideoError(null);
    setVideoSuccess(false);
    setIsVideoSubmitting(true);

    try {
      const result = await validateLibraryRoot(videoPathInput);
      setVideoPathInput(result.rootPath);
      setActiveVideoPath(result.rootPath);
      localStorage.setItem(videoStorageKey, result.rootPath);
      setVideoSuccess(true);
      await Promise.resolve(onVideoLibraryChange(result.rootPath));
    } catch (cause) {
      setVideoError(
        cause instanceof ApiError
          ? cause.message
          : "Could not validate this folder path.",
      );
    } finally {
      setIsVideoSubmitting(false);
    }
  }

  function handleForgetVideo(): void {
    localStorage.removeItem(videoStorageKey);
    setVideoPathInput("");
    setActiveVideoPath("");
    setVideoSuccess(false);
    onForgetVideoLibrary();
  }

  async function handleMediaSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMediaError(null);
    setMediaSuccess(false);
    setIsMediaSubmitting(true);

    try {
      const result = await validateLibraryRoot(mediaPathInput);
      setMediaPathInput(result.rootPath);
      setActiveMediaPath(result.rootPath);
      localStorage.setItem(mediaStorageKey, result.rootPath);
      setMediaSuccess(true);
      await Promise.resolve(onMediaLibraryChange(result.rootPath));
    } catch (cause) {
      setMediaError(
        cause instanceof ApiError
          ? cause.message
          : "Could not validate this folder path.",
      );
    } finally {
      setIsMediaSubmitting(false);
    }
  }

  function handleForgetMedia(): void {
    localStorage.removeItem(mediaStorageKey);
    setMediaPathInput("");
    setActiveMediaPath("");
    setMediaSuccess(false);
    onForgetMediaLibrary();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-2 sm:px-0">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
          Preferences
        </p>
        <h2 className="text-3xl font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 sm:text-4xl flex items-center gap-2.5">
          <SettingsIcon className="h-7 w-7 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.2)]" />
          System Libraries
        </h2>
        <p className="max-w-xl text-sm leading-relaxed text-white/50">
          Set up the source folders on your local machine. Files are read in-place directly from the filesystem without copying.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Video Library Card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 flex flex-col justify-between">
          <form onSubmit={handleVideoSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="video-root" className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-amber-400/80" />
                  Video Library Root
                </label>
                {activeVideoPath && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider font-semibold text-emerald-400">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/40">
                Folder containing video reference folders (with main.mp4 and clips).
              </p>
              <input
                id="video-root"
                name="video-root"
                type="text"
                value={videoPathInput}
                onChange={(event) => setVideoPathInput(event.target.value)}
                placeholder="/path/to/my/video-refs"
                autoComplete="off"
                spellCheck="false"
                className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10"
              />
            </div>

            {videoError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {videoError}
              </p>
            )}

            {videoSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Video library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isVideoSubmitting || videoPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition active:scale-[0.98] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isVideoSubmitting ? "Checking path…" : activeVideoPath ? "Update Path" : "Configure Path"}
            </button>
          </form>

          {activeVideoPath && (
            <div className="mt-5 border-t border-white/[0.06] pt-4 flex flex-col gap-3">
              <div>
                <p className="font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Current path</p>
                <p className="mt-1 break-all font-mono text-xs text-white/60 leading-normal bg-black/20 p-2 rounded border border-white/[0.03]">
                  {activeVideoPath}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForgetVideo}
                className="inline-flex items-center gap-1.5 self-start text-[0.68rem] font-medium text-white/40 hover:text-rose-400 transition"
              >
                <Unlink className="h-3 w-3" />
                Forget video library path
              </button>
            </div>
          )}
        </div>

        {/* Media Library Card */}
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-2xl p-5 sm:p-6 flex flex-col justify-between">
          <form onSubmit={handleMediaSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="media-root" className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-amber-400/80" />
                  Media Library Root
                </label>
                {activeMediaPath && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider font-semibold text-emerald-400">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/40">
                Folder containing independent reference loops, GIFs, and images.
              </p>
              <input
                id="media-root"
                name="media-root"
                type="text"
                value={mediaPathInput}
                onChange={(event) => setMediaPathInput(event.target.value)}
                placeholder="/path/to/my/gifs-and-images"
                autoComplete="off"
                spellCheck="false"
                className="mt-3 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-xs text-white outline-none transition focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10"
              />
            </div>

            {mediaError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {mediaError}
              </p>
            )}

            {mediaSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Media library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isMediaSubmitting || mediaPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition active:scale-[0.98] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isMediaSubmitting ? "Checking path…" : activeMediaPath ? "Update Path" : "Configure Path"}
            </button>
          </form>

          {activeMediaPath && (
            <div className="mt-5 border-t border-white/[0.06] pt-4 flex flex-col gap-3">
              <div>
                <p className="font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Current path</p>
                <p className="mt-1 break-all font-mono text-xs text-white/60 leading-normal bg-black/20 p-2 rounded border border-white/[0.03]">
                  {activeMediaPath}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForgetMedia}
                className="inline-flex items-center gap-1.5 self-start text-[0.68rem] font-medium text-white/40 hover:text-rose-400 transition"
              >
                <Unlink className="h-3 w-3" />
                Forget media library path
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
