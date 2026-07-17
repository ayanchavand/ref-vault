import { useEffect, useMemo, useState } from "react";
import type { ScannedVideo } from "@reference-vault/shared";

interface VideoListProps {
  rootPath: string;
  videos: ScannedVideo[];
  onSelectVideo(video: ScannedVideo): void;
  onChangeRoot(): void;
  isLoading: boolean;
  error: string | null;
}

function VideoThumbnailCard({
  rootPath,
  video,
  onSelect,
}: {
  rootPath: string;
  video: ScannedVideo;
  onSelect(): void;
}) {
  const [poster, setPoster] = useState<string | undefined>(undefined);

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

  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
      return;
    }

    let cancelled = false;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    videoElement.src = mediaUrl;
    videoElement.muted = true;
    videoElement.preload = "metadata";
    videoElement.crossOrigin = "anonymous";

    const onLoadedData = () => {
      if (cancelled) {
        return;
      }

      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      setPoster(canvas.toDataURL("image/jpeg", 0.75));
    };

    videoElement.addEventListener("loadeddata", onLoadedData);
    videoElement.addEventListener("error", () => {
      if (!cancelled) {
        setPoster(undefined);
      }
    });

    return () => {
      cancelled = true;
      videoElement.removeEventListener("loadeddata", onLoadedData);
      videoElement.src = "";
    };
  }, [mediaUrl, posterUrl]);

  return (
    <li className="group overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/80 shadow-xl shadow-slate-950/20 transition hover:-translate-y-1 hover:border-cyan-400/80 hover:bg-slate-800">
      <button
        type="button"
        onClick={onSelect}
        className="flex h-full w-full flex-col items-start text-left"
      >
        <div className="relative w-full overflow-hidden bg-slate-800 aspect-video">
          {poster ? (
            <img
              src={poster}
              alt={`Thumbnail for ${video.relativePath}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-500">
              <span>Generating thumbnail…</span>
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-200">
            {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="w-full p-4">
          <p className="font-semibold text-slate-100">{video.relativePath}</p>
          <p className="mt-2 text-sm text-slate-400">
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
  onChangeRoot,
  isLoading,
  error,
}: VideoListProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">Library</p>
          <p className="mt-1 break-all font-mono text-sm text-slate-400">{rootPath}</p>
        </div>
        <button
          onClick={onChangeRoot}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-600"
        >
          Change library
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/10">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-400">Browse</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Your library, YouTube style.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Pick a video to watch it in the main player. Clips appear in a side panel for quick access to the best moments.
          </p>
        </div>

        {isLoading ? (
          <p className="mt-4 text-slate-400">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="mt-4 text-slate-400">No videos found in this library.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => (
              <VideoThumbnailCard
                key={video.relativePath}
                rootPath={rootPath}
                video={video}
                onSelect={() => onSelectVideo(video)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
