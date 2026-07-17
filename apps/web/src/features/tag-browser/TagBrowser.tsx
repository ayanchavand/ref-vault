import { useEffect, useMemo, useState } from "react";
import type {
  JsonObject,
  ScannedVideo,
  VideoDetail as VideoDetailType,
} from "@reference-vault/shared";

import { getVideoDetail, ApiError } from "../../lib/api";
import { useLazyThumbnail, usePrefetchOnHover } from "../video-browser/Uselazythumbnail";

interface TagBrowserProps {
  rootPath: string;
  videos: ScannedVideo[];
  onBack(): void;
  onSelectVideo(video: ScannedVideo): void;
}

interface TaggedClip {
  clip: VideoDetailType["clips"][number];
  video: VideoDetailType;
  source: "clip" | "video";
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

function formatTagCount(count: number): string {
  return `${count} clip${count === 1 ? "" : "s"}`;
}

function TagBrowserClipCard({
  rootPath,
  entry,
  onClick,
}: {
  rootPath: string;
  entry: TaggedClip;
  onClick(): void;
}) {
  const mediaUrl = `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
    entry.clip.mediaPath,
  )}`;
  const { containerRef, poster } = useLazyThumbnail({ mediaUrl });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      {...prefetchHandlers}
      className="group flex flex-col text-left overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111316] hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] w-full"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/40" ref={containerRef}>
        {poster ? (
          <img
            src={poster}
            alt="Clip thumbnail"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-white/[0.03] text-sm text-white/30">
            Loading…
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3 w-full">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white text-sm">{entry.clip.mediaPath.split("/").pop()}</p>
          <p className="truncate text-xs text-white/50">{entry.video.relativePath}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[0.6rem] text-white/60">
            {entry.source === "clip" ? "clip" : "video"}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[0.6rem] text-white/60">
            {entry.clip.metadata ? Object.keys(entry.clip.metadata).length : 0} fields
          </span>
        </div>
      </div>
    </button>
  );
}

export function TagBrowser({ rootPath, videos, onBack, onSelectVideo }: TagBrowserProps) {
  const [videoDetails, setVideoDetails] = useState<VideoDetailType[]>([]);
  const [selectedVideoTags, setSelectedVideoTags] = useState<string[]>([]);
  const [selectedClipTags, setSelectedClipTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setVideoDetails([]);
    setSelectedVideoTags([]);
    setSelectedClipTags([]);

    if (videos.length === 0) {
      setIsLoading(false);
      return;
    }

    Promise.all(
      videos.map(async (video) => {
        try {
          return {
            ok: true as const,
            video: await getVideoDetail({ rootPath, videoRelativePath: video.relativePath }),
          };
        } catch (cause) {
          return { ok: false as const, error: cause, video };
        }
      }),
    ).then((results) => {
      if (!active) {
        return;
      }

      const details: VideoDetailType[] = [];
      const errors: string[] = [];

      for (const result of results) {
        if (!result.ok) {
          errors.push(
            result.error instanceof ApiError
              ? result.error.message
              : "An unexpected error occurred while loading video metadata.",
          );
          continue;
        }
        details.push(result.video.video);
      }

      setVideoDetails(details);
      setError(errors.length > 0 ? Array.from(new Set(errors)).join(" ") : null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [rootPath, videos]);

  const { videoTagsList, clipTagsList } = useMemo(() => {
    const vTags = new Set<string>();
    const cTags = new Set<string>();
    for (const detail of videoDetails) {
      extractTags(detail.metadata).forEach((t) => vTags.add(t));
      for (const clip of detail.clips) {
        extractTags(clip.metadata).forEach((t) => cTags.add(t));
      }
    }
    return {
      videoTagsList: Array.from(vTags).sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
      clipTagsList: Array.from(cTags).sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    };
  }, [videoDetails]);

  const videoTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const detail of videoDetails) {
      const vTags = extractTags(detail.metadata);
      for (const tag of vTags) {
        counts[tag] = (counts[tag] || 0) + detail.clips.length;
      }
    }
    return counts;
  }, [videoDetails]);

  const clipTagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const detail of videoDetails) {
      for (const clip of detail.clips) {
        const cTags = extractTags(clip.metadata);
        for (const tag of cTags) {
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
    }
    return counts;
  }, [videoDetails]);

  const matchedClips = useMemo(() => {
    const list: {
      clip: VideoDetailType["clips"][number];
      video: VideoDetailType;
      source: "clip" | "video";
    }[] = [];

    for (const detail of videoDetails) {
      const vTags = extractTags(detail.metadata);
      const matchesVideo = selectedVideoTags.every((t) => vTags.includes(t));
      if (!matchesVideo) continue;

      for (const clip of detail.clips) {
        const cTags = extractTags(clip.metadata);
        const matchesClip = selectedClipTags.every((t) => cTags.includes(t));
        if (!matchesClip) continue;

        const source = clip.metadata ? ("clip" as const) : ("video" as const);
        list.push({ clip, video: detail, source });
      }
    }
    return list;
  }, [videoDetails, selectedVideoTags, selectedClipTags]);

  const isFilterActive = selectedVideoTags.length > 0 || selectedClipTags.length > 0;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-5 bg-[#0A0B0D] text-white">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] px-4 py-4 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
            Vault / Tags
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
            Browse clips by tags.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <span aria-hidden="true">&larr;</span> All videos
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-white/[0.06] bg-[#111316] p-5">
        <div className="flex items-center justify-between gap-3 pb-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Clips
            </p>
            <p className="mt-1 text-sm text-white/50">
              Select multiple video tags and clip subtags to filter clips in your library.
            </p>
          </div>
          <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/50">
            {matchedClips.length} matched
          </span>
        </div>

        {/* Video Tags Section */}
        <div className="mb-6 space-y-2">
          <span className="block font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Video Tags</span>
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-8 w-24 rounded-full bg-white/[0.03]" />
              ))}
            </div>
          ) : videoTagsList.length === 0 ? (
            <p className="text-xs text-white/30">No video tags discovered in this library.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {videoTagsList.map((tag) => {
                const isSelected = selectedVideoTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedVideoTags((prev) =>
                        isSelected ? prev.filter((t) => t !== tag) : [...prev, tag],
                      );
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm transition duration-200 ${
                      isSelected
                        ? "border-amber-400 bg-amber-400/20 text-white shadow-[0_0_8px_rgba(232,163,61,0.2)]"
                        : "border-white/[0.06] bg-white/[0.03] text-white/80 hover:border-amber-400/30 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="font-medium">{tag}</span>
                    <span className="rounded-full bg-white/[0.08] px-2 text-[0.65rem] text-white/60">
                      {formatTagCount(videoTagCounts[tag] || 0)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Clip Tags Section */}
        <div className="mb-6 space-y-2">
          <span className="block font-mono text-[0.6rem] uppercase tracking-wider text-white/30">Clip Tags (Subtags)</span>
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-8 w-24 rounded-full bg-white/[0.03]" />
              ))}
            </div>
          ) : clipTagsList.length === 0 ? (
            <p className="text-xs text-white/30">No clip tags discovered in this library.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clipTagsList.map((tag) => {
                const isSelected = selectedClipTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedClipTags((prev) =>
                        isSelected ? prev.filter((t) => t !== tag) : [...prev, tag],
                      );
                    }}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm transition duration-200 ${
                      isSelected
                        ? "border-sky-400 bg-sky-400/20 text-white shadow-[0_0_8px_rgba(56,189,248,0.2)]"
                        : "border-white/[0.06] bg-white/[0.03] text-white/80 hover:border-sky-400/30 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="font-medium">{tag}</span>
                    <span className="rounded-full bg-white/[0.08] px-2 text-[0.65rem] text-white/60">
                      {formatTagCount(clipTagCounts[tag] || 0)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear Filters */}
        {isFilterActive && (
          <div className="mb-6 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSelectedVideoTags([]);
                setSelectedClipTags([]);
              }}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-white/60 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/70"
            >
              Clear filters
            </button>
          </div>
        )}

        {!isFilterActive ? (
          <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
            Select one or more tags above to filter matching clips.
          </div>
        ) : matchedClips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
            No clips match the selected combination of filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {matchedClips.map((entry) => {
              const scannedVideo = videos.find((v) => v.relativePath === entry.video.relativePath);
              return (
                <TagBrowserClipCard
                  key={`${entry.video.relativePath}:${entry.clip.mediaPath}`}
                  rootPath={rootPath}
                  entry={entry}
                  onClick={() => {
                    if (scannedVideo) {
                      onSelectVideo(scannedVideo);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
