import { useEffect, useMemo, useState } from "react";
import type { ScannedVideo } from "@reference-vault/shared";

interface VideoDetailProps {
  rootPath: string;
  video: ScannedVideo;
  onBack(): void;
}

function ClipCard({
  rootPath,
  clip,
  onSelect,
}: {
  rootPath: string;
  clip: ScannedVideo["clips"][number];
  onSelect(): void;
}) {
  const [poster, setPoster] = useState<string | undefined>(undefined);

  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      clip.mediaPath,
    )}`;
  }, [rootPath, clip.mediaPath]);

  useEffect(() => {
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
  }, [mediaUrl]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-950/80 p-3 text-left transition hover:border-cyan-400/70 hover:bg-slate-900"
    >
      <div className="overflow-hidden rounded-3xl bg-slate-950 aspect-video">
        {poster ? (
          <img
            src={poster}
            alt={`Thumbnail for ${clip.mediaPath}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-500">
            <span>Generating clip thumbnail…</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{clip.mediaPath.split("/").pop()}</p>
          {clip.metadataPath && (
            <p className="mt-1 truncate text-xs text-slate-500">Metadata: {clip.metadataPath}</p>
          )}
        </div>
        <span className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 transition group-hover:bg-cyan-400">
          Play
        </span>
      </div>
    </button>
  );
}

export function VideoDetail({ rootPath, video, onBack }: VideoDetailProps) {
  const [selectedMediaPath, setSelectedMediaPath] = useState(video.mainVideoPath);

  useEffect(() => {
    setSelectedMediaPath(video.mainVideoPath);
  }, [video.mainVideoPath]);

  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      selectedMediaPath,
    )}`;
  }, [rootPath, selectedMediaPath]);

  const posterUrl = useMemo(() => {
    return video.thumbnailPath
      ? `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
          video.thumbnailPath,
        )}`
      : undefined;
  }, [rootPath, video.thumbnailPath]);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">Watch</p>
          <p className="mt-1 break-all font-mono text-sm text-slate-400">
            {video.relativePath}
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-600"
        >
          Back to videos
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,0.9fr)]">
        <section className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg shadow-slate-950/20">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
                  Now Playing
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {video.relativePath}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Watch the selected clip or the main video in the player below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMediaPath(video.mainVideoPath)}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Play main video
              </button>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-inner min-h-[55vh]">
              <video
                controls
                className="h-full w-full bg-black"
                style={{ minHeight: "55vh" }}
                src={mediaUrl}
                poster={posterUrl}
                preload="metadata"
              >
                Your browser does not support the video element.
              </video>
            </div>
          </div>
        </section>

        <aside className="space-y-6 rounded-3xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg shadow-slate-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
                Clips
              </p>
              <p className="text-sm text-slate-400">Tap any clip to play it instantly.</p>
            </div>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
              {video.clips.length}
            </span>
          </div>

          {video.clips.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
              No numbered clips were found for this video.
            </p>
          ) : (
            <ul className="space-y-3">
              {video.clips.map((clip, index) => (
                <li key={clip.mediaPath}>
                  <ClipCard
                    rootPath={rootPath}
                    clip={clip}
                    onSelect={() => setSelectedMediaPath(clip.mediaPath)}
                  />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
