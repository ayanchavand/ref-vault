import { useEffect, useMemo, useState } from "react";
import type { VideoDetail as VideoDetailType, JsonObject } from "@reference-vault/shared";
import { useLazyThumbnail, usePrefetchOnHover } from "./Uselazythumbnail";
import { putClipMetadata, ApiError } from "../../lib/api";

interface VideoDetailProps {
  rootPath: string;
  video: VideoDetailType;
  onBack(): void;
  onUpdateVideoDetail(updatedVideo: VideoDetailType): void;
}

function pad(index: number) {
  return String(index + 1).padStart(3, "0");
}


function ShimmerFill() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-[rv-shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
  );
}

const TAG_PREVIEW_LIMIT = 4;

function MetadataTags({ metadata }: { metadata: NonNullable<VideoDetailType["clips"][number]["metadata"]> }) {
  const [expanded, setExpanded] = useState(false);

  const entries = useMemo(() => {
    return Object.entries(metadata).flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return values.map((entry) => ({
        key,
        display:
          typeof entry === "object" && entry !== null ? JSON.stringify(entry) : String(entry),
      }));
    });
  }, [metadata]);

  const visible = expanded ? entries : entries.slice(0, TAG_PREVIEW_LIMIT);
  const hiddenCount = entries.length - visible.length;

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
      <p className="mb-2 font-mono text-[0.58rem] uppercase tracking-[0.25em] text-white/25">
        Metadata · {entries.length}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((tag, i) => (
          <span
            key={`${tag.key}-${i}`}
            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.62rem] text-white/60"
          >
            <span className="font-semibold text-amber-300/70">{tag.key}</span>
            <span className="text-white/20">·</span>
            <span className="max-w-[10rem] truncate text-white/70">{tag.display}</span>
          </span>
        ))}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(true);
            }}
            className="rounded-full border border-amber-400/30 bg-amber-400/[0.06] px-2 py-0.5 font-mono text-[0.62rem] font-semibold text-amber-300 transition hover:border-amber-400/60 hover:bg-amber-400/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            +{hiddenCount} more
          </button>
        )}

        {expanded && entries.length > TAG_PREVIEW_LIMIT && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.62rem] text-white/50 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

function ClipCard({
  rootPath,
  clip,
  index,
  active,
  onSelect,
}: {
  rootPath: string;
  clip: VideoDetailType["clips"][number];
  index: number;
  active: boolean;
  onSelect(): void;
}) {
  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      clip.mediaPath,
    )}`;
  }, [rootPath, clip.mediaPath]);

  const { containerRef, poster } = useLazyThumbnail({ mediaUrl });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-current={active}
      {...prefetchHandlers}
      className={`group relative flex w-full cursor-pointer gap-3 rounded-xl border p-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] ${
        active
          ? "border-amber-400/60 bg-[#17140D] shadow-[0_0_0_1px_rgba(232,163,61,0.15)]"
          : "border-white/[0.06] bg-[#111316] hover:-translate-y-0.5 hover:border-amber-400/30 hover:bg-[#14171B]"
      }`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl transition-colors ${
          active ? "bg-amber-400" : "bg-transparent group-hover:bg-amber-400/30"
        }`}
        aria-hidden="true"
      />

      <div
        ref={containerRef}
        className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-black/40 sm:w-36"
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-white/[0.04]">
            <ShimmerFill />
            <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/25">
              indexing
            </span>
          </div>
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.6rem] tabular-nums text-amber-300/90 backdrop-blur-sm">
          {pad(index)}
        </span>
        {active && (
          <span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            <span className="font-mono text-[0.55rem] uppercase tracking-wider text-amber-300">
              live
            </span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate font-mono text-[0.8rem] font-medium text-white/90">
          {clip.mediaPath.split("/").pop()}
        </p>
        {clip.metadataPath && (
          <p className="mt-0.5 truncate font-mono text-[0.65rem] text-white/30">
            {clip.metadataPath}
          </p>
        )}
        {clip.metadata && <MetadataTags metadata={clip.metadata} />}
      </div>
    </div>
  );
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

interface ClipMetadataEditorProps {
  rootPath: string;
  videoRelativePath: string;
  clip: VideoDetailType["clips"][number];
  video: VideoDetailType;
  onSaveSuccess(updatedVideo: VideoDetailType): void;
}

function ClipMetadataEditor({
  rootPath,
  videoRelativePath,
  clip,
  video,
  onSaveSuccess,
}: ClipMetadataEditorProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [ratingInput, setRatingInput] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize form state from clip metadata
  useEffect(() => {
    const tags = extractTags(clip.metadata);
    setTagsInput(tags.join(", "));
    setNotesInput(String(clip.metadata?.notes ?? ""));
    setRatingInput(Number(clip.metadata?.rating ?? 0));
    setSaveError(null);
    setSaveSuccess(false);
  }, [clip]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const newMetadata: JsonObject = {
      ...clip.metadata,
      tags,
    };

    if (notesInput) {
      newMetadata.notes = notesInput;
    } else {
      delete newMetadata.notes;
    }

    if (ratingInput) {
      newMetadata.rating = ratingInput;
    } else {
      delete newMetadata.rating;
    }


    try {
      const response = await putClipMetadata({
        rootPath,
        videoRelativePath,
        clipMediaPath: clip.mediaPath,
        metadata: newMetadata,
      });

      const updatedClips = video.clips.map((c) => {
        if (c.mediaPath === clip.mediaPath) {
          return {
            ...c,
            metadata: response.metadata,
          };
        }
        return c;
      });

      const updatedVideo: VideoDetailType = {
        ...video,
        clipsMetadataPath: video.clipsMetadataPath || response.metadataPath,
        clips: updatedClips,
      };

      onSaveSuccess(updatedVideo);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save metadata.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    const tags = extractTags(clip.metadata);
    setTagsInput(tags.join(", "));
    setNotesInput(String(clip.metadata?.notes ?? ""));
    setRatingInput(Number(clip.metadata?.rating ?? 0));
    setSaveError(null);
    setSaveSuccess(false);
  }

  const isModified = useMemo(() => {
    const originalTags = extractTags(clip.metadata).join(", ");
    const originalNotes = String(clip.metadata?.notes ?? "");
    const originalRating = Number(clip.metadata?.rating ?? 0);

    return (
      tagsInput !== originalTags ||
      notesInput !== originalNotes ||
      ratingInput !== originalRating
    );
  }, [clip.metadata, tagsInput, notesInput, ratingInput]);

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
          Clip Metadata Editor
        </h3>
        <p className="text-xs text-white/40">
          Edits are saved directly to the video's library folder.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          {/* Tags Field */}
          <div className="space-y-1.5">
            <label htmlFor="clip-tags" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
              Tags (comma separated)
            </label>
            <input
              id="clip-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. camera movement, slow motion"
              disabled={isSaving}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white/95 placeholder:text-white/25 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50"
            />
          </div>

          {/* Rating Field */}
          <div className="space-y-1.5">
            <span className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
              Rating
            </span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRatingInput(star)}
                  disabled={isSaving}
                  className={`text-2xl transition duration-150 focus:outline-none ${
                    star <= ratingInput
                      ? "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                      : "text-white/20 hover:text-amber-400/50"
                  }`}
                >
                  ★
                </button>
              ))}
              {ratingInput > 0 && (
                <button
                  type="button"
                  onClick={() => setRatingInput(0)}
                  disabled={isSaving}
                  className="ml-2 font-mono text-[0.65rem] uppercase tracking-widest text-white/30 hover:text-white/60 focus:outline-none focus:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notes Field */}
        <div className="space-y-1.5">
          <label htmlFor="clip-notes" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
            Notes
          </label>
          <textarea
            id="clip-notes"
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Enter camera notes or annotations..."
            disabled={isSaving}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white/95 placeholder:text-white/25 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50 min-h-[5.75rem] resize-y"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving || !isModified}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving || !isModified}
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Changes saved successfully!
          </span>
        )}

        {saveError && (
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-rose-400">
            Error: {saveError}
          </span>
        )}
      </div>
    </form>
  );
}

export function VideoDetail({ rootPath, video, onBack, onUpdateVideoDetail }: VideoDetailProps) {

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

  const isMainPlaying = selectedMediaPath === video.mainVideoPath;

  const activeClip = useMemo(() => {
    return video.clips.find((clip) => clip.mediaPath === selectedMediaPath);
  }, [video.clips, selectedMediaPath]);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-5 bg-[#0A0B0D] text-white">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Vault / Watch
            </p>
            <p className="mt-1 truncate font-mono text-sm text-white/50">{video.relativePath}</p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          <span aria-hidden="true">&larr;</span> All videos
        </button>
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,0.9fr)]">
        {/* Player */}
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                {isMainPlaying ? "Now Playing · Main" : "Now Playing · Clip"}
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-white sm:text-xl">
                {selectedMediaPath.split("/").pop()}
              </h2>
            </div>
            {!isMainPlaying && (
              <button
                type="button"
                onClick={() => setSelectedMediaPath(video.mainVideoPath)}
                className="self-start rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111316]"
              >
                Play main video
              </button>
            )}
          </div>

          {/* Viewfinder-framed player — signature element */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute -inset-1 z-10">
              <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-amber-400/50" />
              <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-amber-400/50" />
              <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-amber-400/50" />
              <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-amber-400/50" />
            </div>
            <div className="min-h-[55vh] overflow-hidden rounded-2xl border border-white/[0.06] bg-black">
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

          {!isMainPlaying && activeClip && (
            <div className="mt-4 border-t border-white/[0.06] pt-6">
              <ClipMetadataEditor
                rootPath={rootPath}
                videoRelativePath={video.relativePath}
                clip={activeClip}
                video={video}
                onSaveSuccess={onUpdateVideoDetail}
              />
            </div>
          )}
        </section>


        {/* Clip rail */}
        <aside className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] p-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                Clip Index
              </p>
              <p className="mt-1 text-sm text-white/40">Select a clip to play it instantly.</p>
            </div>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-xs tabular-nums text-white/50">
              {String(video.clips.length).padStart(2, "0")}
            </span>
          </div>

          {video.clips.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-white/30">
                No entries
              </span>
              <p className="text-sm text-white/40">
                No numbered clips are indexed for this video yet.
              </p>
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto pr-0.5">
              {video.clips.map((clip, index) => (
                <li key={clip.mediaPath}>
                  <ClipCard
                    rootPath={rootPath}
                    clip={clip}
                    index={index}
                    active={selectedMediaPath === clip.mediaPath}
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