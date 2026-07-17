import { useMemo } from "react";
import type { ScannedVideo } from "@reference-vault/shared";
import { useLazyThumbnail, usePrefetchOnHover } from "./Uselazythumbnail";

interface VideoListProps {
  rootPath: string;
  videos: ScannedVideo[];
  onSelectVideo(video: ScannedVideo): void;
  onBrowseTags(): void;
  onChangeRoot(): void;
  isLoading: boolean;
  openingVideoPath: string | null;
  error: string | null;
}

function ShimmerFill() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-[rv-shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
  );
}

function SkeletonCard() {
  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111316]">
      <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
        <ShimmerFill />
      </div>
      <div className="space-y-2 p-4">
        <div className="relative h-3.5 w-3/5 overflow-hidden rounded bg-white/[0.06]">
          <ShimmerFill />
        </div>
        <div className="relative h-3 w-2/5 overflow-hidden rounded bg-white/[0.04]">
          <ShimmerFill />
        </div>
      </div>
    </li>
  );
}

function VideoThumbnailCard({
  rootPath,
  video,
  isOpening,
  disabled,
  onSelect,
}: {
  rootPath: string;
  video: ScannedVideo;
  isOpening: boolean;
  disabled: boolean;
  onSelect(): void;
}) {
  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      video.mainVideoPath,
    )}`;
  }, [rootPath, video.mainVideoPath]);

  const posterUrl = useMemo(() => {
    return video.thumbnailPath
      ? `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
          video.thumbnailPath,
        )}`
      : undefined;
  }, [rootPath, video.thumbnailPath]);

  const { containerRef, poster } = useLazyThumbnail({ mediaUrl, posterUrl });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  return (
    <li
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        isOpening
          ? "border-amber-400/50"
          : "border-white/[0.06] hover:-translate-y-1 hover:border-amber-400/40 hover:bg-[#14171B] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
      } bg-[#111316]`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-busy={isOpening}
        {...prefetchHandlers}
        className="flex h-full w-full flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-default"
      >
        <div ref={containerRef} className="relative w-full overflow-hidden bg-black/40 aspect-video">
          {poster ? (
            <img
              src={poster}
              alt=""
              className={`h-full w-full object-cover transition-opacity duration-200 ${
                isOpening ? "opacity-40" : "opacity-90 group-hover:opacity-100"
              }`}
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center bg-white/[0.04]">
              <ShimmerFill />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/25">
                indexing
              </span>
            </div>
          )}

          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber-300/90 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80" />
            {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
          </span>

          {isOpening && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-[1px]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber-300">
                Opening…
              </span>
            </div>
          )}
        </div>

        <div className="w-full p-4">
          <p className="truncate font-semibold text-white/90">{video.relativePath}</p>
          <p className="mt-1.5 truncate font-mono text-xs text-white/35">
            {video.mainVideoPath.split("/").pop() ?? video.mainVideoPath}
          </p>
        </div>
      </button>
    </li>
  );
}

export function VideoList({
  rootPath,
  videos,
  onSelectVideo,
  onBrowseTags,
  onChangeRoot,
  isLoading,
  openingVideoPath,
  error,
}: VideoListProps) {
  const isInitialScan = isLoading && videos.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Library
            </p>
            <p className="mt-1 truncate font-mono text-sm text-white/50">{rootPath}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onBrowseTags}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Browse tags
          </button>
          <button
            onClick={onChangeRoot}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Change library
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/[0.06] bg-[#111316] p-6">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
            02 · Browse
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Your library, indexed.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">
            Pick a video to watch it in the main player. Clips appear in a side panel for quick
            access to the best moments.
          </p>
        </div>

        {isInitialScan ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </ul>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-white/30">
              No entries
            </span>
            <p className="text-sm text-white/40">No videos were found in this library.</p>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => (
              <VideoThumbnailCard
                key={video.relativePath}
                rootPath={rootPath}
                video={video}
                isOpening={openingVideoPath === video.relativePath}
                disabled={openingVideoPath !== null}
                onSelect={() => onSelectVideo(video)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}