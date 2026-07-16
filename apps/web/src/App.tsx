import { useState } from "react";

import type { ScanLibraryResponse, ScannedVideo } from "@reference-vault/shared";

import { LibraryRootForm } from "./features/library-root/LibraryRootForm";
import { VideoList } from "./features/video-browser/VideoList";
import { VideoDetail } from "./features/video-browser/VideoDetail";
import { scanLibrary, ApiError } from "./lib/api";

const libraryRootStorageKey = "reference-vault.library-root";

type AppView = "SELECT_LIBRARY" | "BROWSE_LIBRARY" | "VIEW_VIDEO";

function loadSavedLibraryRoot(): string {
  return window.localStorage.getItem(libraryRootStorageKey) ?? "";
}

export function App() {
  const [savedRootPath, setSavedRootPath] = useState(loadSavedLibraryRoot);
  const [currentView, setCurrentView] = useState<AppView>("SELECT_LIBRARY");
  const [activeRootPath, setActiveRootPath] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanLibraryResponse | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ScannedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleValidatedRoot(rootPath: string): Promise<void> {
    window.localStorage.setItem(libraryRootStorageKey, rootPath);
    setSavedRootPath(rootPath);
    setActiveRootPath(rootPath);
    setError(null);
    setIsLoading(true);

    try {
      const result = await scanLibrary(rootPath);
      setScanResult(result);
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
  }

  function handleSelectVideo(video: ScannedVideo): void {
    setSelectedVideo(video);
    setCurrentView("VIEW_VIDEO");
  }

  function handleBackToLibrary(): void {
    setSelectedVideo(null);
    setCurrentView("BROWSE_LIBRARY");
  }

  function handleBackToRoot(): void {
    forgetSavedRoot();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-10">
        <header className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-cyan-400 uppercase">
              Local-first reference library
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Reference Vault
            </h1>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            Filesystem source of truth
          </span>
        </header>

        <section className="flex flex-1 flex-col py-14">
          {currentView === "SELECT_LIBRARY" && (
            <div className="flex flex-1 items-center">
              <div className="grid w-full gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
                <div>
                  <p className="text-sm font-medium text-cyan-300">Open a library</p>
                  <h2 className="mt-3 max-w-lg text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    Your reference files stay exactly where you put them.
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
                    Choose the folder that contains your video directories. Reference Vault
                    reads its media and JSON metadata in place; it never imports them into a
                    database.
                  </p>
                </div>

                <LibraryRootForm
                  initialRootPath={savedRootPath}
                  activeRootPath={activeRootPath}
                  onValidatedRoot={handleValidatedRoot}
                  onForgetSavedRoot={forgetSavedRoot}
                />
              </div>
            </div>
          )}

          {currentView === "BROWSE_LIBRARY" && scanResult && (
            <VideoList
              rootPath={activeRootPath!}
              videos={scanResult.videos}
              onSelectVideo={handleSelectVideo}
              onChangeRoot={handleBackToRoot}
              isLoading={isLoading}
              error={error}
            />
          )}

          {currentView === "VIEW_VIDEO" && selectedVideo && (
            <VideoDetail
              rootPath={activeRootPath!}
              video={selectedVideo}
              onBack={handleBackToLibrary}
            />
          )}
        </section>
      </div>
    </main>
  );
}
