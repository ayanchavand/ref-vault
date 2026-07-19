import { useState, useEffect, lazy, Suspense, useMemo, useCallback } from "react";

import type {
  ScanLibraryResponse,
  ScannedVideo,
  VideoDetail as VideoDetailType,
  LibraryConfig,
  JsonObject,
} from "@reference-vault/shared";

import { Library, Tag, Upload, Image, Settings as SettingsIcon, ChevronLeft, ChevronRight } from "lucide-react";

// Lazy-loaded components mapped from named exports to defaults
const Settings = lazy(() =>
  import("./features/settings/Settings").then((m) => ({ default: m.Settings }))
);
const TagBrowser = lazy(() =>
  import("./features/tag-browser/TagBrowser").then((m) => ({ default: m.TagBrowser }))
);
const VideoList = lazy(() =>
  import("./features/video-browser/VideoList").then((m) => ({ default: m.VideoList }))
);
const VideoDetail = lazy(() =>
  import("./features/video-browser/VideoDetail").then((m) => ({ default: m.VideoDetail }))
);
const MediaBrowser = lazy(() =>
  import("./features/media-browser/MediaBrowser").then((m) => ({ default: m.MediaBrowser }))
);
const VideoImport = lazy(() =>
  import("./features/video-import/VideoImport").then((m) => ({ default: m.VideoImport }))
);

import { scanLibrary, getVideoDetail, ApiError, getLibraryConfig } from "./lib/api";
import { useHashRouter, navigate } from "./lib/router";

const libraryRootStorageKey = "reference-vault.library-root";

// How many videos to show per page in the browse view.
const VIDEOS_PER_PAGE = 6;

function loadSavedLibraryRoot(): string {
  return window.localStorage.getItem(libraryRootStorageKey) ?? "";
}



// Global keyframes shared by shimmer thumbnails and the top loading bar
// across every feature component. Defined once here since App is always
// mounted at the root.
function GlobalMotionStyles() {
  return (
    <style>{`
      @keyframes rv-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      @keyframes rv-progress {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(20%); }
        100% { transform: translateX(110%); }
      }
      @keyframes rv-slide-down {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* --- New animations --- */

      /* View route entrance */
      @keyframes rv-fade-up {
        from { opacity: 0; transform: translateY(14px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Staggered card entrance */
      @keyframes rv-card-in {
        from { opacity: 0; transform: translateY(18px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      /* Tag pill spring pop on selection */
      @keyframes rv-spring-pop {
        0%   { transform: scale(1); }
        40%  { transform: scale(1.1); }
        70%  { transform: scale(0.96); }
        100% { transform: scale(1); }
      }

      /* Danger hover glow pulse */
      @keyframes rv-danger-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(244,63,94,0); }
        50%       { box-shadow: 0 0 0 5px rgba(244,63,94,0.18); }
      }

      /* Success message slide-in from right */
      @keyframes rv-success-in {
        from { opacity: 0; transform: translateX(14px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      /* Error message shake */
      @keyframes rv-shake {
        0%, 100% { transform: translateX(0); }
        20%      { transform: translateX(-5px); }
        40%      { transform: translateX(5px); }
        60%      { transform: translateX(-3px); }
        80%      { transform: translateX(3px); }
      }

      /* Segment marker drop-in */
      @keyframes rv-drop-in {
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Respect prefers-reduced-motion */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    `}</style>
  );
}

interface VideoListPaginationProps {
  currentPage: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

// Simple prev/next pager for the video grid. Styled to match the
// amber/dark theme used everywhere else in the app.
function VideoListPagination({
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
}: VideoListPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onPrevPage}
        disabled={currentPage === 1}
        className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-white/70 transition hover:bg-white/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Prev
      </button>
      <span className="font-mono text-[0.7rem] uppercase tracking-widest text-white/40">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        onClick={onNextPage}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-white/70 transition hover:bg-white/[0.06] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function extractTags(metadata?: JsonObject): string[] {
  if (!metadata) {
    return [];
  }
  const tags = metadata.tags;
  if (typeof tags === "string") {
    return [tags];
  }
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter((item): item is string => typeof item === "string");
}

export function App() {
  const [savedRootPath, setSavedRootPath] = useState(loadSavedLibraryRoot);
  const [activeRootPath, setActiveRootPath] = useState<string | null>(null);
  const activeRoute = useHashRouter(activeRootPath !== null);
  const [scanResult, setScanResult] = useState<ScanLibraryResponse | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ScannedVideo | null>(null);
  const [videoDetail, setVideoDetail] = useState<VideoDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [openingVideoPath, setOpeningVideoPath] = useState<string | null>(null);
  // Which page of the video grid is currently showing. Reset to 1 whenever
  // a fresh scan happens; preserved when navigating to/from a video detail
  // or the tag browser so the user doesn't lose their place.
  const [videoPage, setVideoPage] = useState(1);
  const [libraryConfig, setLibraryConfig] = useState<LibraryConfig>({ fields: [] });

  const globalTags = useMemo(() => {
    if (!scanResult) return [];
    const set = new Set<string>();
    scanResult.videos.forEach((v) => {
      extractTags(v.metadata).forEach((t) => set.add(t));
      v.clips.forEach((c) => {
        extractTags(c.metadata).forEach((t) => set.add(t));
      });
    });
    return Array.from(set).sort();
  }, [scanResult?.videos]);

  // Auto-load saved library on mount
  useEffect(() => {
    const saved = loadSavedLibraryRoot();
    if (saved) {
      setActiveRootPath(saved);
      setError(null);
      setIsLoading(true);

      Promise.all([
        scanLibrary(saved),
        getLibraryConfig({ rootPath: saved }).catch(() => ({ config: { fields: [] } })),
      ])
        .then(([scanRes, configRes]) => {
          setScanResult(scanRes);
          setLibraryConfig(configRes.config);
          setVideoPage(1);
        })
        .catch((cause) => {
          const message =
            cause instanceof ApiError
              ? cause.message
              : "The library could not be scanned.";
          setError(message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, []);

  // Fetch video details when activeRoute is VIEW_VIDEO
  useEffect(() => {
    if (activeRoute.view === "VIEW_VIDEO" && activeRootPath) {
      const path = activeRoute.path;
      if (!videoDetail || videoDetail.relativePath !== path) {
        setVideoDetail(null);
        setError(null);
        setOpeningVideoPath(path);

        getVideoDetail({
          rootPath: activeRootPath,
          videoRelativePath: path,
        })
          .then((result) => {
            setVideoDetail(result.video);
          })
          .catch((cause) => {
            const message =
              cause instanceof ApiError
                ? cause.message
                : "The video details could not be loaded.";
            setError(message);
            // Fallback back to library browser on error
            navigate({ view: "BROWSE_LIBRARY" });
          })
          .finally(() => {
            setOpeningVideoPath(null);
          });
      }
    }
  }, [activeRoute, activeRootPath, videoDetail]);

  async function handleVideoRootChange(newPath: string): Promise<void> {
    window.localStorage.setItem(libraryRootStorageKey, newPath);
    setSavedRootPath(newPath);
    setActiveRootPath(newPath);
    setError(null);
    setIsLoading(true);

    try {
      const [scanRes, configRes] = await Promise.all([
        scanLibrary(newPath),
        getLibraryConfig({ rootPath: newPath }).catch(() => ({ config: { fields: [] } })),
      ]);
      setScanResult(scanRes);
      setLibraryConfig(configRes.config);
      setVideoPage(1);
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : "The library could not be scanned.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleVideoRootForget(): void {
    window.localStorage.removeItem(libraryRootStorageKey);
    setSavedRootPath("");
    setActiveRootPath(null);
    setScanResult(null);
    setSelectedVideo(null);
    setVideoDetail(null);
    setVideoPage(1);
    setLibraryConfig({ fields: [] });
  }

  const [activeMediaRoot, setActiveMediaRoot] = useState(() => window.localStorage.getItem("reference-vault.media-root") ?? "");

  function handleMediaRootChange(newPath: string): void {
    setActiveMediaRoot(newPath);
  }

  function handleMediaRootForget(): void {
    setActiveMediaRoot("");
  }

  const handleSelectVideo = useCallback((video: ScannedVideo): void => {
    setSelectedVideo(video);
    navigate({ view: "VIEW_VIDEO", path: video.relativePath });
  }, []);

  function handleBrowseTags(): void {
    setSelectedVideo(null);
    setVideoDetail(null);
    navigate({ view: "BROWSE_TAGS" });
  }

  function handleBrowseMedia(): void {
    navigate({ view: "BROWSE_MEDIA" });
  }


  function handleUpdateVideoDetail(updatedVideo: VideoDetailType): void {
    setVideoDetail(updatedVideo);

    if (scanResult) {
      const updatedVideos = scanResult.videos.map((v) => {
        if (v.relativePath === updatedVideo.relativePath) {
          return {
            ...v,
            metadata: updatedVideo.metadata,
            clipsMetadataPath: updatedVideo.clipsMetadataPath || `${updatedVideo.relativePath}/clips.json`,
            clips: updatedVideo.clips.map((c) => ({
              mediaPath: c.mediaPath,
              metadataPath: c.metadataPath,
            })),
          };
        }
        return v;
      });
      setScanResult({
        ...scanResult,
        videos: updatedVideos,
      });
    }
  }


  function handlePrevVideoPage(): void {
    setVideoPage((page) => Math.max(1, page - 1));
  }

  function handleNextVideoPage(): void {
    if (!scanResult) return;
    const totalPages = Math.max(1, Math.ceil(scanResult.videos.length / VIDEOS_PER_PAGE));
    setVideoPage((page) => Math.min(totalPages, page + 1));
  }

  const isBusy = isLoading || openingVideoPath !== null;

  const totalVideoPages = scanResult
    ? Math.max(1, Math.ceil(scanResult.videos.length / VIDEOS_PER_PAGE))
    : 1;
  // Clamp in case the underlying list ever shrinks (e.g. a re-scan) while
  // sitting on a page that no longer exists.
  const clampedVideoPage = Math.min(videoPage, totalVideoPages);
  const paginatedVideos = scanResult
    ? scanResult.videos.slice(
        (clampedVideoPage - 1) * VIDEOS_PER_PAGE,
        clampedVideoPage * VIDEOS_PER_PAGE,
      )
    : [];

  return (
    <main className="m-0 min-h-screen bg-[#0A0B0D] text-white">
      <GlobalMotionStyles />

      {/* Global top loading bar — always visible when any async work is in flight */}
      {isBusy && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-white/[0.06]">
          <div className="h-full w-1/3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)] animate-[rv-progress_1.3s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="flex h-screen w-full flex-col px-2 pt-0 pb-6 sm:px-10 sm:pt-8 sm:pb-8">
        <header className="relative flex flex-col gap-4 border-b border-white/[0.06] pt-2.5 pb-2.5 sm:pt-0 sm:pb-6 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-0">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(232,163,61,0.8)] ${
                isBusy ? "animate-pulse" : ""
              }`}
            />
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 sm:text-2xl">
              Reference Vault
            </h1>
          </div>

          {/* Desktop navbar (hidden on mobile) */}
          <nav className="hidden sm:flex sm:items-center sm:gap-2">
            {[
              {
                label: "Library",
                view: "BROWSE_LIBRARY" as const,
                requiresVideo: true,
                icon: Library,
                active: activeRoute.view === "BROWSE_LIBRARY" || activeRoute.view === "VIEW_VIDEO",
              },
              {
                label: "Tags",
                view: "BROWSE_TAGS" as const,
                requiresVideo: true,
                icon: Tag,
                active: activeRoute.view === "BROWSE_TAGS",
              },
              {
                label: "Import",
                view: "IMPORT_VIDEO" as const,
                requiresVideo: true,
                icon: Upload,
                active: activeRoute.view === "IMPORT_VIDEO",
              },
              {
                label: "Media",
                view: "BROWSE_MEDIA" as const,
                requiresVideo: false,
                icon: Image,
                active: activeRoute.view === "BROWSE_MEDIA",
              },
              {
                label: "Settings",
                view: "SETTINGS" as const,
                requiresVideo: false,
                icon: SettingsIcon,
                active: activeRoute.view === "SETTINGS",
              },
            ].map((item) => {
              const isDisabled = item.requiresVideo && !activeRootPath;
              return (
                <button
                  key={item.label}
                  disabled={isDisabled}
                  onClick={() => navigate({ view: item.view })}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-mono text-[0.68rem] uppercase tracking-wider transition-all duration-300 ${
                    isDisabled
                      ? "opacity-25 cursor-not-allowed text-white/40"
                      : item.active
                      ? "bg-amber-400 font-semibold text-[#0A0B0D] shadow-[0_0_15px_rgba(251,191,36,0.3)]"
                      : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <section className="flex flex-col flex-1 min-h-0 overflow-y-auto pt-0 pb-24 sm:pt-12 sm:pb-12">
          <Suspense fallback={
            <div className="flex flex-1 items-center justify-center p-8 text-sm font-mono uppercase tracking-widest text-white/30">
              Loading view…
            </div>
          }>
            {activeRoute.view === "SELECT_LIBRARY" && (
              <div className="flex flex-1 items-center justify-center py-10 animate-[rv-fade-up_0.4s_ease-out_both] px-2 sm:px-0">
                <div className="max-w-xl text-center space-y-6">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 font-mono text-3xl font-bold text-[#0A0B0D] shadow-[0_0_30px_rgba(232,163,61,0.3)] mx-auto">
                    RV
                  </span>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                      Welcome to Reference Vault
                    </h2>
                    <p className="text-sm text-white/50 leading-relaxed">
                      To start pairing video references and managing clips, please configure your source libraries. Your reference files stay exactly where they are on your local drive.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate({ view: "SETTINGS" })}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(251,191,36,0.45)] active:translate-y-px active:shadow-none active:scale-[0.97]"
                  >
                    <SettingsIcon className="h-4 w-4" />
                    Configure System Libraries
                  </button>
                </div>
              </div>
            )}

            {activeRoute.view === "BROWSE_LIBRARY" && scanResult && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both] px-2 sm:px-0">
                <VideoList
                  rootPath={activeRootPath!}
                  videos={paginatedVideos}
                  onSelectVideo={handleSelectVideo}
                  isLoading={isLoading}
                  openingVideoPath={openingVideoPath}
                  error={error}
                  libraryConfig={libraryConfig}
                />
                <VideoListPagination
                  currentPage={clampedVideoPage}
                  totalPages={totalVideoPages}
                  onPrevPage={handlePrevVideoPage}
                  onNextPage={handleNextVideoPage}
                />
              </div>
            )}

            {activeRoute.view === "IMPORT_VIDEO" && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both] px-2 sm:px-0">
                <VideoImport
                  rootPath={activeRootPath!}
                  libraryConfig={libraryConfig}
                  onImportSuccess={async () => {
                    setIsLoading(true);
                    try {
                      const result = await scanLibrary(activeRootPath!);
                      setScanResult(result);
                      setVideoPage(1);
                      navigate({ view: "BROWSE_LIBRARY" });
                    } catch (cause) {
                      setError(cause instanceof ApiError ? cause.message : "Failed to scan library.");
                      navigate({ view: "BROWSE_LIBRARY" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  onBack={() => {
                    navigate({ view: "BROWSE_LIBRARY" });
                  }}
                />
              </div>
            )}

            {activeRoute.view === "BROWSE_TAGS" && scanResult && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both] px-2 sm:px-0">
                <TagBrowser
                  rootPath={activeRootPath!}
                  videos={scanResult.videos}
                  onSelectVideo={handleSelectVideo}
                  libraryConfig={libraryConfig}
                />
              </div>
            )}

            {activeRoute.view === "VIEW_VIDEO" && videoDetail && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both]">
                <VideoDetail
                  rootPath={activeRootPath!}
                  video={videoDetail}
                  globalTags={globalTags}
                  onUpdateVideoDetail={handleUpdateVideoDetail}
                  onDeleteVideo={async () => {
                    setIsLoading(true);
                    setSelectedVideo(null);
                    setVideoDetail(null);
                    try {
                      const result = await scanLibrary(activeRootPath!);
                      setScanResult(result);
                      setVideoPage(1);
                      navigate({ view: "BROWSE_LIBRARY" });
                    } catch (cause) {
                      setError(cause instanceof ApiError ? cause.message : "Failed to scan library.");
                      navigate({ view: "BROWSE_LIBRARY" });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  libraryConfig={libraryConfig}
                />
              </div>
            )}

            {activeRoute.view === "BROWSE_MEDIA" && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both] px-2 sm:px-0 flex flex-col flex-1 min-h-0 h-full">
                <MediaBrowser onGoToSettings={() => navigate({ view: "SETTINGS" })} />
              </div>
            )}

            {activeRoute.view === "SETTINGS" && (
              <div className="animate-[rv-fade-up_0.35s_ease-out_both] px-2 sm:px-0">
                <Settings
                  onVideoLibraryChange={handleVideoRootChange}
                  onForgetVideoLibrary={handleVideoRootForget}
                  onMediaLibraryChange={handleMediaRootChange}
                  onForgetMediaLibrary={handleMediaRootForget}
                  videoLibraryPath={activeRootPath ?? ""}
                  libraryConfig={libraryConfig}
                  onUpdateLibraryConfig={setLibraryConfig}
                />
              </div>
            )}
          </Suspense>
        </section>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-around border-t border-white/[0.06] bg-[#0E1012]/90 backdrop-blur-xl px-2 py-2.5 sm:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.6)] animate-[rv-slide-down_0.2s_ease-out]">
        {[
          {
            label: "Library",
            view: "BROWSE_LIBRARY" as const,
            requiresVideo: true,
            icon: Library,
            active: activeRoute.view === "BROWSE_LIBRARY" || activeRoute.view === "VIEW_VIDEO",
          },
          {
            label: "Tags",
            view: "BROWSE_TAGS" as const,
            requiresVideo: true,
            icon: Tag,
            active: activeRoute.view === "BROWSE_TAGS",
          },
          {
            label: "Import",
            view: "IMPORT_VIDEO" as const,
            requiresVideo: true,
            icon: Upload,
            active: activeRoute.view === "IMPORT_VIDEO",
          },
          {
            label: "Media",
            view: "BROWSE_MEDIA" as const,
            requiresVideo: false,
            icon: Image,
            active: activeRoute.view === "BROWSE_MEDIA",
          },
          {
            label: "Settings",
            view: "SETTINGS" as const,
            requiresVideo: false,
            icon: SettingsIcon,
            active: activeRoute.view === "SETTINGS",
          },
        ].map((item) => {
          const isDisabled = item.requiresVideo && !activeRootPath;
          return (
            <button
              key={item.label}
              disabled={isDisabled}
              onClick={() => navigate({ view: item.view })}
              className={`flex flex-col items-center gap-1 px-3 py-1 font-mono transition duration-200 ${
                isDisabled
                  ? "opacity-25 cursor-not-allowed text-white/40"
                  : item.active
                  ? "text-amber-400 font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <item.icon className={`h-5 w-5 transition-transform ${item.active && !isDisabled ? "scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : ""}`} />
              <span className="text-[0.58rem] uppercase tracking-wider">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}