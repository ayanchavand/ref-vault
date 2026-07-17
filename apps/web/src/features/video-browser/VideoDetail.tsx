import { useEffect, useMemo, useState } from "react";
import type { ScannedVideo } from "@reference-vault/shared";

interface VideoDetailProps {
  rootPath: string;
  video: ScannedVideo;
  onBack(): void;
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">Video</p>
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

      <div className="space-y-4">
        <div className="rounded-3xl border border-slate-700 bg-slate-900/70 p-4 shadow-lg shadow-slate-950/20">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-cyan-300">Now playing</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-400">
                  {selectedMediaPath}
                </p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
                {selectedMediaPath.endsWith(".mp4") ? "Video" : "Media"}
              </span>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
              <video
                controls
                className="h-full w-full bg-black"
                src={mediaUrl}
                poster={posterUrl}
                preload="metadata"
              >
                Your browser does not support the video element.
              </video>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-cyan-300">Main video</p>
              <p className="mt-1 break-all font-mono text-xs text-slate-400">
                {video.mainVideoPath}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMediaPath(video.mainVideoPath)}
              className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
            >
              Play main video
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Clips ({video.clips.length})</h2>
          {video.clips.length === 0 ? (
            <p className="mt-4 text-slate-400">No clips in this video.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {video.clips.map((clip, index) => (
                <li key={clip.mediaPath}>
                  <div className="flex flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-900/50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-cyan-300">Clip {index + 1}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-400">
                          {clip.mediaPath}
                        </p>
                        {clip.metadataPath && (
                          <p className="mt-1 break-all font-mono text-xs text-slate-500">
                            Metadata: {clip.metadataPath}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMediaPath(clip.mediaPath)}
                        className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                      >
                        Play clip
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
