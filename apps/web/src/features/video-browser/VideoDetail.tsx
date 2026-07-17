import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoDetail as VideoDetailType, JsonObject, ScannedVideo } from "@reference-vault/shared";
import { useLazyThumbnail, usePrefetchOnHover } from "./Uselazythumbnail";
import { putClipMetadata, putVideoMetadata, getVideoDetail, ApiError } from "../../lib/api";


interface VideoDetailProps {
  rootPath: string;
  video: VideoDetailType;
  allVideos: ScannedVideo[];
  onBack(): void;
  onUpdateVideoDetail(updatedVideo: VideoDetailType): void;
}


function pad(index: number) {
  return String(index + 1).padStart(3, "0");
}

function getTagColorClass(tag: string): string {
  const clean = tag.toLowerCase().trim();
  
  if (clean.includes("camera") || clean.includes("pan") || clean.includes("tilt") || clean.includes("zoom") || clean.includes("track") || clean.includes("dolly") || clean.includes("shot")) {
    return "border-sky-500/20 bg-sky-500/5 text-sky-300";
  }
  if (clean.includes("light") || clean.includes("glow") || clean.includes("shadow") || clean.includes("neon") || clean.includes("contrast") || clean.includes("dark") || clean.includes("bright")) {
    return "border-amber-500/20 bg-amber-500/5 text-amber-300";
  }
  if (clean.includes("cut") || clean.includes("transition") || clean.includes("edit") || clean.includes("whip") || clean.includes("fade") || clean.includes("dissolve")) {
    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  }
  if (clean.includes("color") || clean.includes("grade") || clean.includes("lut") || clean.includes("mood") || clean.includes("warm") || clean.includes("cool")) {
    return "border-rose-500/20 bg-rose-500/5 text-rose-300";
  }
  if (clean.includes("vfx") || clean.includes("cgi") || clean.includes("smoke") || clean.includes("particle") || clean.includes("effect")) {
    return "border-indigo-500/20 bg-indigo-500/5 text-indigo-300";
  }

  const presetStyles = [
    "border-white/[0.08] bg-white/[0.03] text-white/70",
    "border-purple-500/20 bg-purple-500/5 text-purple-300",
    "border-teal-500/20 bg-teal-500/5 text-teal-300",
    "border-orange-500/20 bg-orange-500/5 text-orange-300",
    "border-pink-500/20 bg-pink-500/5 text-pink-300"
  ];
  
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % presetStyles.length;
  return presetStyles[index]!;
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
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((tag, i) => {
        const isTag = tag.key === "tags";
        const colorClass = isTag ? getTagColorClass(tag.display) : "border-white/[0.08] bg-white/[0.03] text-white/70";
        return (
          <span
            key={`${tag.key}-${i}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.62rem] ${colorClass}`}
          >
            {!isTag && (
              <>
                <span className="font-semibold text-amber-300/70">{tag.key}</span>
                <span className="text-white/20">·</span>
              </>
            )}
            <span className="max-w-[10rem] truncate">{tag.display}</span>
          </span>
        );
      })}

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
  globalTags: string[];
  onSaveSuccess(updatedVideo: VideoDetailType): void;
}

function ClipMetadataEditor({
  rootPath,
  videoRelativePath,
  clip,
  video,
  globalTags,
  onSaveSuccess,
}: ClipMetadataEditorProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [ratingInput, setRatingInput] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const allLibraryTags = useMemo(() => {
    const set = new Set<string>();
    video.clips.forEach((c) => {
      extractTags(c.metadata).forEach((tag) => set.add(tag));
    });
    return Array.from(set).sort();
  }, [video.clips]);

  const activeTags = useMemo(() => {
    return tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }, [tagsInput]);

  const suggestedTags = useMemo(() => {
    return allLibraryTags.filter((tag) => !activeTags.includes(tag));
  }, [allLibraryTags, activeTags]);

  const suggestedGlobalTags = useMemo(() => {
    return globalTags.filter(
      (tag) => !allLibraryTags.includes(tag) && !activeTags.includes(tag)
    );
  }, [globalTags, allLibraryTags, activeTags]);


  function handleAddSuggestion(tag: string) {
    if (!activeTags.includes(tag)) {
      const newTags = [...activeTags, tag];
      setTagsInput(newTags.join(", "));
    }
  }


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
            {/* Local Video Tag suggestions */}
            {suggestedTags.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <span className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/20">Suggestions (This Video)</span>
                <div className="flex flex-wrap gap-1 max-h-[4.5rem] overflow-y-auto pr-1">
                  {suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddSuggestion(tag)}
                      disabled={isSaving}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[0.58rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Global Library Tag suggestions */}
            {suggestedGlobalTags.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <span className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/20">Suggestions (Global Library)</span>
                <div className="flex flex-wrap gap-1 max-h-[4.5rem] overflow-y-auto pr-1">
                  {suggestedGlobalTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddSuggestion(tag)}
                      disabled={isSaving}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[0.58rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

interface VideoMetadataEditorProps {
  rootPath: string;
  video: VideoDetailType;
  globalTags: string[];
  onSaveSuccess(updatedVideo: VideoDetailType): void;
}

function VideoMetadataEditor({
  rootPath,
  video,
  globalTags,
  onSaveSuccess,
}: VideoMetadataEditorProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [ratingInput, setRatingInput] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const allLibraryTags = useMemo(() => {
    const set = new Set<string>();
    video.clips.forEach((c) => {
      extractTags(c.metadata).forEach((tag) => set.add(tag));
    });
    return Array.from(set).sort();
  }, [video.clips]);

  const activeTags = useMemo(() => {
    return tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }, [tagsInput]);

  const suggestedTags = useMemo(() => {
    return allLibraryTags.filter((tag) => !activeTags.includes(tag));
  }, [allLibraryTags, activeTags]);

  const suggestedGlobalTags = useMemo(() => {
    return globalTags.filter(
      (tag) => !allLibraryTags.includes(tag) && !activeTags.includes(tag)
    );
  }, [globalTags, allLibraryTags, activeTags]);

  function handleAddSuggestion(tag: string) {
    if (!activeTags.includes(tag)) {
      const newTags = [...activeTags, tag];
      setTagsInput(newTags.join(", "));
    }
  }

  // Initialize form state from video metadata
  useEffect(() => {
    const tags = extractTags(video.metadata);
    setTagsInput(tags.join(", "));
    setNotesInput(String(video.metadata?.notes ?? ""));
    setRatingInput(Number(video.metadata?.rating ?? 0));
    setArtistInput(String(video.metadata?.artist ?? ""));
    setSaveError(null);
    setSaveSuccess(false);
  }, [video]);

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
      ...video.metadata,
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

    if (artistInput) {
      newMetadata.artist = artistInput;
    } else {
      delete newMetadata.artist;
    }

    try {
      const response = await putVideoMetadata({
        rootPath,
        videoRelativePath: video.relativePath,
        metadata: newMetadata,
      });

      const updatedVideo: VideoDetailType = {
        ...video,
        metadata: response.metadata,
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
    const tags = extractTags(video.metadata);
    setTagsInput(tags.join(", "));
    setNotesInput(String(video.metadata?.notes ?? ""));
    setRatingInput(Number(video.metadata?.rating ?? 0));
    setArtistInput(String(video.metadata?.artist ?? ""));
    setSaveError(null);
    setSaveSuccess(false);
  }

  const isModified = useMemo(() => {
    const originalTags = extractTags(video.metadata).join(", ");
    const originalNotes = String(video.metadata?.notes ?? "");
    const originalRating = Number(video.metadata?.rating ?? 0);
    const originalArtist = String(video.metadata?.artist ?? "");

    return (
      tagsInput !== originalTags ||
      artistInput !== originalArtist ||
      notesInput !== originalNotes ||
      ratingInput !== originalRating
    );
  }, [video.metadata, tagsInput, artistInput, notesInput, ratingInput]);

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
          Video Metadata Editor
        </h3>
        <p className="text-xs text-white/40">
          Edits are saved directly to metadata.json in the library.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="video-tags" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
              Tags (comma separated)
            </label>
            <input
              id="video-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. camera movement, slow motion"
              disabled={isSaving}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white/95 placeholder:text-white/25 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 disabled:opacity-50"
            />
            {/* Local Video Tag suggestions */}
            {suggestedTags.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <span className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/20">Suggestions (This Video)</span>
                <div className="flex flex-wrap gap-1 max-h-[4.5rem] overflow-y-auto pr-1">
                  {suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddSuggestion(tag)}
                      disabled={isSaving}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[0.58rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Global Library Tag suggestions */}
            {suggestedGlobalTags.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <span className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/20">Suggestions (Global Library)</span>
                <div className="flex flex-wrap gap-1 max-h-[4.5rem] overflow-y-auto pr-1">
                  {suggestedGlobalTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddSuggestion(tag)}
                      disabled={isSaving}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[0.58rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Artist Field */}
          <div className="space-y-1.5">
            <label htmlFor="video-artist" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
              Artist
            </label>
            <input
              id="video-artist"
              type="text"
              value={artistInput}
              onChange={(e) => setArtistInput(e.target.value)}
              placeholder="e.g. Director, Studio, Animator"
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
          <label htmlFor="video-notes" className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
            Notes
          </label>
          <textarea
            id="video-notes"
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Enter video-level notes or annotations..."
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

export function VideoDetail({ rootPath, video, allVideos, onBack, onUpdateVideoDetail }: VideoDetailProps) {

  const [selectedMediaPath, setSelectedMediaPath] = useState(video.mainVideoPath);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [playRate, setPlayRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [globalTags, setGlobalTags] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (!allVideos || allVideos.length === 0) return;
    
    Promise.all(
      allVideos.map(async (v) => {
        try {
          return await getVideoDetail({ rootPath, videoRelativePath: v.relativePath });
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (!active) return;
      const set = new Set<string>();
      results.forEach((res) => {
        if (!res) return;
        extractTags(res.video.metadata).forEach((t) => set.add(t));
        res.video.clips.forEach((c) => {
          extractTags(c.metadata).forEach((t) => set.add(t));
        });
      });
      setGlobalTags(Array.from(set).sort());
    });

    return () => {
      active = false;
    };
  }, [rootPath, allVideos]);


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

  useEffect(() => {
    setSelectedMediaPath(video.mainVideoPath);
    setPlayRate(1);
  }, [video.mainVideoPath]);

  function stepFrameForward() {
    if (videoRef.current) {
      videoRef.current.currentTime += 0.04;
    }
  }

  function stepFrameBackward() {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 0.04);
    }
  }

  function changePlayRate(rate: number) {
    setPlayRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playRate;
      videoRef.current.loop = isLooping;
    }
  }, [mediaUrl, playRate, isLooping]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isTyping) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepFrameBackward();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepFrameForward();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function formatTimecode(secs: number) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    const frames = Math.floor((secs % 1) * 24);
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
      String(frames).padStart(2, "0"),
    ].join(":");
  }




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
              {isMainPlaying && video.metadata && (
                <MetadataTags metadata={video.metadata} />
              )}
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
            {/* Corner Viewfinder Braces */}
            <div className="pointer-events-none absolute -inset-1 z-10">
              <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-amber-400/50" />
              <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-amber-400/50" />
              <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-amber-400/50" />
              <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-amber-400/50" />
            </div>

            {/* Viewfinder HUD overlays */}
            <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-1.5 pointer-events-none font-mono text-[0.62rem] tracking-wider text-rose-500 uppercase bg-black/40 px-2 py-0.5 rounded backdrop-blur-[1px]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
              <span>REC</span>
            </div>
            <div className="absolute top-3.5 right-3.5 z-20 pointer-events-none font-mono text-[0.62rem] tracking-wider text-white/40 bg-black/40 px-2 py-0.5 rounded backdrop-blur-[1px]">
              <span>1080p · 24fps</span>
            </div>

            <div className="absolute bottom-3.5 left-3.5 z-20 pointer-events-none font-mono text-[0.68rem] tracking-widest text-amber-300 font-semibold bg-black/60 px-2.5 py-0.5 rounded backdrop-blur-[1px] border border-amber-400/10">
              <span>TC {formatTimecode(currentTime)}</span>
            </div>
            <div className="absolute bottom-3.5 right-3.5 z-20 pointer-events-none font-mono text-[0.68rem] tracking-widest text-white/40 bg-black/60 px-2.5 py-0.5 rounded backdrop-blur-[1px]">
              <span>DUR {formatTimecode(duration)}</span>
            </div>

            <div className="min-h-[55vh] overflow-hidden rounded-2xl border border-white/[0.06] bg-black">
              <video
                ref={videoRef}
                controls
                className="h-full w-full bg-black"
                style={{ minHeight: "55vh" }}
                src={mediaUrl}
                poster={posterUrl}
                preload="metadata"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              >
                Your browser does not support the video element.
              </video>
            </div>
          </div>

          {/* Advanced Playback Control Panel */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 text-sm">
            {/* Frame step buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={stepFrameBackward}
                title="Step 1 Frame Back (Left Arrow)"
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-white/80 hover:border-amber-400/40 hover:bg-white/[0.06] transition focus:outline-none"
              >
                ◀ Frame
              </button>
              <button
                type="button"
                onClick={stepFrameForward}
                title="Step 1 Frame Forward (Right Arrow)"
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-white/80 hover:border-amber-400/40 hover:bg-white/[0.06] transition focus:outline-none"
              >
                Frame ▶
              </button>
            </div>

            {/* Playback speed rate selection */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/30 mr-1">Speed</span>
              {[0.25, 0.5, 1, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => changePlayRate(rate)}
                  className={`rounded-lg px-2.5 py-1 font-mono text-xs transition focus:outline-none ${
                    playRate === rate
                      ? "bg-amber-400 font-semibold text-[#0A0B0D]"
                      : "border border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest transition focus:outline-none ${
                isLooping
                  ? "bg-amber-400/20 border border-amber-400/50 text-amber-300 font-semibold shadow-[0_0_8px_rgba(232,163,61,0.2)]"
                  : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"
              }`}
            >
              Loop: {isLooping ? "ON" : "OFF"}
            </button>
          </div>


          {!isMainPlaying && activeClip ? (
            <div className="mt-4 border-t border-white/[0.06] pt-6">
              <ClipMetadataEditor
                rootPath={rootPath}
                videoRelativePath={video.relativePath}
                clip={activeClip}
                video={video}
                globalTags={globalTags}
                onSaveSuccess={onUpdateVideoDetail}
              />
            </div>
          ) : (
            isMainPlaying && (
              <div className="mt-4 border-t border-white/[0.06] pt-6">
                <VideoMetadataEditor
                  rootPath={rootPath}
                  video={video}
                  globalTags={globalTags}
                  onSaveSuccess={onUpdateVideoDetail}
                />
              </div>
            )
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