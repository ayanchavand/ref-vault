import { FormEvent, useEffect, useState } from "react";
import { FolderOpen, Settings as SettingsIcon, CheckCircle, AlertCircle, Unlink } from "lucide-react";
import { ApiError, validateLibraryRoot, initLibrary } from "../../lib/api";

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

  const [initSuccessMessage, setInitSuccessMessage] = useState<string | null>(null);
  const [initErrorMessage, setInitErrorMessage] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

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

  async function handleInitializeLibrary(): Promise<void> {
    const targetPath = window.prompt(
      "Enter the absolute directory path where you want to initialize your libraries:\n\n(If the folder is empty, skeleton folders are created directly. Otherwise, 'refVault_Videos' and 'refVault_Media' subfolders will be created.)"
    );

    if (targetPath === null) {
      return; // Cancelled
    }

    if (targetPath.trim().length === 0) {
      setInitErrorMessage("The directory path cannot be empty.");
      return;
    }

    setInitErrorMessage(null);
    setInitSuccessMessage(null);
    setIsInitializing(true);

    try {
      const response = await initLibrary({ targetPath: targetPath.trim() });
      
      // Update Video Library Path
      setVideoPathInput(response.videoPath);
      setActiveVideoPath(response.videoPath);
      localStorage.setItem(videoStorageKey, response.videoPath);
      setVideoSuccess(true);
      await Promise.resolve(onVideoLibraryChange(response.videoPath));

      // Update Media Library Path
      setMediaPathInput(response.mediaPath);
      setActiveMediaPath(response.mediaPath);
      localStorage.setItem(mediaStorageKey, response.mediaPath);
      setMediaSuccess(true);
      await Promise.resolve(onMediaLibraryChange(response.mediaPath));

      setInitSuccessMessage(
        `Directory structures initialized successfully!\n\nVideo Library Path: ${response.videoPath}\nMedia Library Path: ${response.mediaPath}`
      );
    } catch (cause) {
      setInitErrorMessage(
        cause instanceof ApiError
          ? cause.message
          : "Failed to initialize the library structure."
      );
    } finally {
      setIsInitializing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-2 sm:px-0">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-white/[0.06] pb-6">
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
        <button
          type="button"
          disabled={isInitializing}
          onClick={handleInitializeLibrary}
          className="md:self-end rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-xs font-semibold text-[#0A0B0D] px-4 py-2.5 shadow-lg hover:shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shrink-0"
        >
          <FolderOpen className="h-4 w-4" />
          {isInitializing ? "Initializing..." : "Initialize Structure"}
        </button>
      </div>

      {initErrorMessage && (
        <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-rose-500/10 px-4 py-3 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both] border border-rose-500/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <div>
            <span className="font-semibold block mb-0.5">Initialization Failed</span>
            {initErrorMessage}
          </div>
        </div>
      )}

      {initSuccessMessage && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both] border border-emerald-500/20">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Libraries Initialized</span>
            <div className="whitespace-pre-line opacity-90">{initSuccessMessage}</div>
          </div>
        </div>
      )}

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
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {videoError}
              </p>
            )}

            {videoSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Video library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isVideoSubmitting || videoPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-none"
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
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 leading-normal animate-[rv-shake_0.4s_ease-in-out_both]">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                {mediaError}
              </p>
            )}

            {mediaSuccess && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 leading-normal animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
                <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Media library root updated successfully!
              </p>
            )}

            <button
              type="submit"
              disabled={isMediaSubmitting || mediaPathInput.trim().length === 0}
              className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-xs font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 disabled:hover:translate-y-0 disabled:hover:shadow-none"
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
