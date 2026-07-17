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
}: {
  rootPath: string;
  entry: TaggedClip;
}) {
  const mediaUrl = `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
    entry.clip.mediaPath,
  )}`;
  const { containerRef, poster } = useLazyThumbnail({ mediaUrl });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111316]"
      {...prefetchHandlers}
    >
      <div className="relative aspect-video overflow-hidden bg-black/40" ref={containerRef}>
        {poster ? (
          <img
            src={poster}
            alt="Clip thumbnail"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-white/[0.03] text-sm text-white/30">
            Loading…
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
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
    </div>
  );
}

export function TagBrowser({ rootPath, videos, onBack }: TagBrowserProps) {
  const [tagMap, setTagMap] = useState<Record<string, TaggedClip[]>>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setTagMap({});
    setSelectedTag(null);

    if (videos.length === 0) {
      setIsLoading(false);
      return;
    }

    Promise.all(
      videos.map(async (video) => {
        try {
          return { ok: true as const, video: await getVideoDetail({ rootPath, videoRelativePath: video.relativePath }) };
        } catch (cause) {
          return { ok: false as const, error: cause, video };
        }
      }),
    ).then((results) => {
      if (!active) {
        return;
      }

      const nextTagMap: Record<string, TaggedClip[]> = {};
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

        const videoDetail = result.video.video;
        const videoTags = extractTags(videoDetail.metadata);
        const clipTagsById = new Map<string, Set<string>>();

        for (const clip of videoDetail.clips) {
          clipTagsById.set(clip.mediaPath, new Set(extractTags(clip.metadata)));
        }

        for (const tag of videoTags) {
          for (const clip of videoDetail.clips) {
            const existing = clipTagsById.get(clip.mediaPath);
            if (existing) {
              existing.add(tag);
            }
          }
        }

        for (const clip of videoDetail.clips) {
          const clipTags = Array.from(clipTagsById.get(clip.mediaPath) ?? []);

          for (const tag of clipTags) {
            if (!nextTagMap[tag]) {
              nextTagMap[tag] = [];
            }

            const existingClip = nextTagMap[tag].find(
              (entry) => entry.clip.mediaPath === clip.mediaPath,
            );
            if (existingClip) {
              continue;
            }

            nextTagMap[tag].push({ clip, video: videoDetail, source: clip.metadata ? "clip" : "video" });
          }
        }
      }

      if (!active) {
        return;
      }

      const sortedTagKeys = Object.keys(nextTagMap).sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      );
      const normalizedMap: Record<string, TaggedClip[]> = {};
      for (const tag of sortedTagKeys) {
        normalizedMap[tag] = nextTagMap[tag] || [];
      }


      setTagMap(normalizedMap);
      setSelectedTag((current) => current ?? sortedTagKeys[0] ?? null);
      setError(errors.length > 0 ? Array.from(new Set(errors)).join(" ") : null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [rootPath, videos]);

  const tagEntries = useMemo(
    () =>
      Object.entries(tagMap).map(([tag, clips]) => ({ tag, clips })).sort((left, right) =>
        left.tag.localeCompare(right.tag, undefined, { sensitivity: "base" }),
      ),
    [tagMap],
  );

  const selectedClips = selectedTag ? tagMap[selectedTag] ?? [] : [];

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-5 bg-[#0A0B0D] text-white">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
          className="flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
              Select a tag to filter clips in your library.
            </p>
          </div>
          <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/50">
            {selectedClips.length} matched
          </span>
        </div>

        {/* Tags as selectable chips */}
        {isLoading ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-8 w-24 rounded-full bg-white/[0.03]" />
            ))}
          </div>
        ) : tagEntries.length === 0 ? (
          <div className="mb-4 rounded-xl border border-dashed border-white/[0.10] px-4 py-6 text-center text-sm text-white/40">
            No tags were discovered in the current library. Ensure clip metadata is present in `clips.json` or `metadata.json`.
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {tagEntries.map(({ tag, clips }) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition duration-200 ${
                  selectedTag === tag
                    ? "border-amber-400/60 bg-amber-400/10 text-white"
                    : "border-white/[0.06] bg-white/[0.03] text-white/80 hover:border-amber-400/30 hover:bg-white/[0.06]"
                }`}
              >
                <span className="font-medium">{tag}</span>
                <span className="rounded-full bg-white/[0.08] px-2 text-[0.65rem] text-white/60">
                  {formatTagCount(clips.length)}
                </span>
              </button>
            ))}
          </div>
        )}

          {selectedTag === null ? (
            <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
              Select a tag to view matching clips.
            </div>
          ) : selectedClips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
              No clips were tagged with “{selectedTag}”.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {selectedClips.map((entry) => (
                <TagBrowserClipCard
                  key={`${entry.video.relativePath}:${entry.clip.mediaPath}`}
                  rootPath={rootPath}
                  entry={entry}
                />
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
