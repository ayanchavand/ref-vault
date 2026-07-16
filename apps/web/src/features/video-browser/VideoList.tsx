import type { ScannedVideo } from "@reference-vault/shared";

interface VideoListProps {
  rootPath: string;
  videos: ScannedVideo[];
  onSelectVideo(video: ScannedVideo): void;
  onChangeRoot(): void;
  isLoading: boolean;
  error: string | null;
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
      <div className="flex items-center justify-between">
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

      <div>
        <h2 className="text-lg font-semibold">Videos ({videos.length})</h2>
        {isLoading ? (
          <p className="mt-4 text-slate-400">Loading…</p>
        ) : videos.length === 0 ? (
          <p className="mt-4 text-slate-400">No videos found in this library.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {videos.map((video) => (
              <li key={video.relativePath}>
                <button
                  onClick={() => onSelectVideo(video)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-left transition hover:bg-slate-800 hover:border-cyan-400"
                >
                  <p className="font-medium text-cyan-300">{video.relativePath}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
