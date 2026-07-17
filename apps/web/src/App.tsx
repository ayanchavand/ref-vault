import { useState, useEffect } from "react";

import type {
  ScanLibraryResponse,
  ScannedVideo,
  VideoDetail as VideoDetailType,
} from "@reference-vault/shared";

import { LibraryRootForm } from "./features/library-root/LibraryRootForm";
import { TagBrowser } from "./features/tag-browser/TagBrowser";
import { VideoList } from "./features/video-browser/VideoList";
import { VideoDetail } from "./features/video-browser/VideoDetail";
import { scanLibrary, getVideoDetail, ApiError } from "./lib/api";

const libraryRootStorageKey = "reference-vault.library-root";

// How many videos to show per page in the browse view.
const VIDEOS_PER_PAGE = 6;

type AppView = "SELECT_LIBRARY" | "BROWSE_LIBRARY" | "BROWSE_TAGS" | "VIEW_VIDEO";

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
        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-white/70 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
      >
        Prev
      </button>
      <span className="font-mono text-[0.7rem] uppercase tracking-widest text-white/40">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        onClick={onNextPage}
        disabled={currentPage === totalPages}
        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-[0.7rem] uppercase tracking-widest text-white/70 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-30"
      >
        Next
      </button>
    </div>
  );
}

export function App() {
  const [savedRootPath, setSavedRootPath] = useState(loadSavedLibraryRoot);
  const [currentView, setCurrentView] = useState<AppView>("SELECT_LIBRARY");
  const [activeRootPath, setActiveRootPath] = useState<string | null>(null);
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

  // Auto-load saved library on mount
  useEffect(() => {
    const saved = loadSavedLibraryRoot();
    if (saved) {
      setActiveRootPath(saved);
      setError(null);
      setIsLoading(true);

      scanLibrary(saved)
        .then((result) => {
          setScanResult(result);
          setVideoPage(1);
          setCurrentView("BROWSE_LIBRARY");
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

  async function handleValidatedRoot(rootPath: string): Promise<void> {
    window.localStorage.setItem(libraryRootStorageKey, rootPath);
    setSavedRootPath(rootPath);
    setActiveRootPath(rootPath);
    setError(null);
    setIsLoading(true);

    try {
      const result = await scanLibrary(rootPath);
      setScanResult(result);
      setVideoPage(1);
      setCurrentView("BROWSE_LIBRARY");
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

  function forgetSavedRoot(): void {
    window.localStorage.removeItem(libraryRootStorageKey);
    setSavedRootPath("");
    setActiveRootPath(null);
    setCurrentView("SELECT_LIBRARY");
    setScanResult(null);
    setSelectedVideo(null);
    setVideoPage(1);
  }

  async function handleSelectVideo(video: ScannedVideo): Promise<void> {
    setSelectedVideo(video);
    setVideoDetail(null);
    setError(null);
    setOpeningVideoPath(video.relativePath);

    try {
      if (!activeRootPath) {
        throw new Error("No active library root selected.");
      }

      const result = await getVideoDetail({
        rootPath: activeRootPath,
        videoRelativePath: video.relativePath,
      });

      setVideoDetail(result.video);
      setCurrentView("VIEW_VIDEO");
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : "The video details could not be loaded.";
      setError(message);
    } finally {
      setOpeningVideoPath(null);
    }
  }

  function handleBrowseTags(): void {
    setSelectedVideo(null);
    setVideoDetail(null);
    setCurrentView("BROWSE_TAGS");
  }

  function handleBackToLibrary(): void {
    setSelectedVideo(null);
    setVideoDetail(null);
    setCurrentView("BROWSE_LIBRARY");
  }

  function handleUpdateVideoDetail(updatedVideo: VideoDetailType): void {
    setVideoDetail(updatedVideo);

    if (scanResult) {
      const updatedVideos = scanResult.videos.map((v) => {
        if (v.relativePath === updatedVideo.relativePath) {
          return {
            ...v,
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

  function handleBackToRoot(): void {
    forgetSavedRoot();
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

      <div className="flex min-h-screen w-full flex-col px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between border-b border-white/[0.06] pb-6">
          <div className="flex items-center gap-3">
            <span
              className={`h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)] ${
                isBusy ? "animate-pulse" : ""
              }`}
            />
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                Local-first reference library
              </p>
              <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Reference Vault
              </h1>
            </div>
          </div>
          <span className="hidden rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-white/40 sm:inline-block">
            Filesystem source of truth
          </span>
        </header>

        <section className="flex flex-1 flex-col py-12">
          {currentView === "SELECT_LIBRARY" && (
            <div className="flex flex-1 items-center">
              <div className="grid w-full gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
                <div>
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                    01 · Open a library
                  </p>
                  <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
                    Your reference files stay exactly where you put them.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-white/50">
                    Choose the folder that contains your video directories. Reference Vault
                    reads its media and JSON metadata in place; it never imports them into a
                    database.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-[#111316] p-1">
                  <LibraryRootForm
                    initialRootPath={savedRootPath}
                    activeRootPath={activeRootPath}
                    onValidatedRoot={handleValidatedRoot}
                    onForgetSavedRoot={forgetSavedRoot}
                  />
                </div>
              </div>
            </div>
          )}

          {currentView === "BROWSE_LIBRARY" && scanResult && (
            <>
              <VideoList
                rootPath={activeRootPath!}
                videos={paginatedVideos}
                onSelectVideo={handleSelectVideo}
                onBrowseTags={handleBrowseTags}
                onChangeRoot={handleBackToRoot}
                isLoading={isLoading}
                openingVideoPath={openingVideoPath}
                error={error}
              />
              <VideoListPagination
                currentPage={clampedVideoPage}
                totalPages={totalVideoPages}
                onPrevPage={handlePrevVideoPage}
                onNextPage={handleNextVideoPage}
              />
            </>
          )}

          {currentView === "BROWSE_TAGS" && scanResult && (
            <TagBrowser
              rootPath={activeRootPath!}
              videos={scanResult.videos}
              onBack={handleBackToLibrary}
              onSelectVideo={handleSelectVideo}
            />
          )}

          {currentView === "VIEW_VIDEO" && videoDetail && (
            <VideoDetail
              rootPath={activeRootPath!}
              video={videoDetail}
              allVideos={scanResult?.videos || []}
              onBack={handleBackToLibrary}
              onUpdateVideoDetail={handleUpdateVideoDetail}
            />
          )}
        </section>
      </div>
    </main>
  );
}