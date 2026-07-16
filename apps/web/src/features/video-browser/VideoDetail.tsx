import type { ScannedVideo } from "@reference-vault/shared";

interface VideoDetailProps {
  rootPath: string;
  video: ScannedVideo;
  onBack(): void;
}

export function VideoDetail({ rootPath, video, onBack }: VideoDetailProps) {
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

      <div>
        <h2 className="text-lg font-semibold">Clips ({video.clips.length})</h2>
        {video.clips.length === 0 ? (
          <p className="mt-4 text-slate-400">No clips in this video.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {video.clips.map((clip, index) => (
              <li key={clip.mediaPath}>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
