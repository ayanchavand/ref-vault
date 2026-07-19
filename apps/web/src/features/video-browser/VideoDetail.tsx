import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoDetail as VideoDetailType, JsonObject, ScannedVideo, LibraryConfig, LibraryConfigField } from "@reference-vault/shared";
import { useLazyThumbnail, usePrefetchOnHover } from "./Uselazythumbnail";
import { putClipMetadata, putVideoMetadata, saveSplitPlan, getVideoDetail, deleteClip, deleteVideo, ApiError, captureFrame } from "../../lib/api";
import { Save, RotateCcw, Trash2, Repeat, Gauge, Scissors, PlayCircle, Film, Plus, Camera, Star, User, FileText, ChevronDown, ChevronUp, Edit } from "lucide-react";


interface VideoDetailProps {
  rootPath: string;
  video: VideoDetailType;
  globalTags: string[];
  onUpdateVideoDetail(updatedVideo: VideoDetailType): void;
  onDeleteVideo(): void;
  libraryConfig?: LibraryConfig;
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

interface MetadataTagsProps {
  metadata: NonNullable<VideoDetailType["clips"][number]["metadata"]>;
  libraryConfig?: LibraryConfig;
}

function MetadataTags({ metadata, libraryConfig }: MetadataTagsProps) {
  const [expanded, setExpanded] = useState(false);

  const tags = useMemo(() => {
    const t = metadata.tags;
    if (!t) return [];
    if (typeof t === "string") return [t];
    if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
    return [];
  }, [metadata.tags]);

  const rating = typeof metadata.rating === "number" ? metadata.rating : undefined;

  const configuredClipFields = useMemo(() => {
    return libraryConfig?.fields.filter((f: LibraryConfigField) => f.type === "clip") ?? [];
  }, [libraryConfig]);

  const hasConfiguredValues = configuredClipFields.some((field: LibraryConfigField) => metadata[field.name]);

  if (tags.length === 0 && !rating && !hasConfiguredValues) {
    return null;
  }

  const visibleTags = expanded ? tags : tags.slice(0, TAG_PREVIEW_LIMIT);
  const hiddenCount = tags.length - visibleTags.length;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {rating !== undefined && rating > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 font-mono text-[0.62rem] text-amber-300">
          ★ {rating}
        </span>
      )}
      {visibleTags.map((tag, i) => {
        const colorClass = getTagColorClass(tag);
        return (
          <span
            key={`${tag}-${i}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.62rem] ${colorClass}`}
          >
            <span className="max-w-[10rem] truncate">{tag}</span>
          </span>
        );
      })}

      {configuredClipFields.map((field: LibraryConfigField) => {
        const val = metadata[field.name];
        if (!val) return null;
        const vals = Array.isArray(val) ? val : [val];
        return vals.map((v, idx) => {
          const text = `${field.name}: ${v}`;
          const colorClass = getTagColorClass(field.name);
          return (
            <span
              key={`${field.name}-${v}-${idx}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.62rem] ${colorClass}`}
            >
              <span className="max-w-[10rem] truncate">{text}</span>
            </span>
          );
        });
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

      {expanded && tags.length > TAG_PREVIEW_LIMIT && (
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

interface VideoDetailsDisplayProps {
  metadata?: JsonObject;
  libraryConfig?: LibraryConfig;
}

function VideoDetailsDisplay({ metadata, libraryConfig }: VideoDetailsDisplayProps) {
  if (!metadata) return null;

  const tags = useMemo(() => {
    const t = metadata.tags;
    if (!t) return [];
    if (typeof t === "string") return [t];
    if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
    return [];
  }, [metadata.tags]);

  const rating = typeof metadata.rating === "number" ? metadata.rating : undefined;
  const artist = typeof metadata.artist === "string" ? metadata.artist : undefined;
  const notes = typeof metadata.notes === "string" ? metadata.notes : undefined;

  const configuredVideoFields = useMemo(() => {
    return libraryConfig?.fields.filter((f: LibraryConfigField) => f.type === "video") ?? [];
  }, [libraryConfig]);

  // Other custom metadata fields (excluding tags, rating, artist, notes, and configured fields)
  const customFields = useMemo(() => {
    const configuredNames = configuredVideoFields.map((f: LibraryConfigField) => f.name);
    return Object.entries(metadata).filter(
      ([key]) => !["tags", "rating", "artist", "notes", ...configuredNames].includes(key)
    );
  }, [metadata, configuredVideoFields]);

  return (
    <div className="mt-3 space-y-3">
      {/* Rating and Artist Row */}
      {(rating || artist) && (
        <div className="flex flex-wrap gap-2">
          {rating !== undefined && rating > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-xs text-amber-300">
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < rating ? "fill-amber-400 text-amber-400" : "text-white/20"
                    }`}
                  />
                ))}
              </span>
              <span className="font-mono text-[0.68rem] font-semibold text-amber-300/80">({rating}/5)</span>
            </div>
          )}

          {artist && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 font-mono text-xs text-purple-300">
              <User className="h-3.5 w-3.5 text-purple-400" />
              <span>{artist}</span>
            </div>
          )}
        </div>
      )}

      {/* Notes display */}
      {notes && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-300 max-w-xl w-full">
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />
          <div className="space-y-0.5 text-left">
            <span className="block font-mono text-[0.55rem] uppercase tracking-wider text-blue-400/70">Notes</span>
            <p className="font-sans leading-relaxed text-white/90 whitespace-pre-wrap">{notes}</p>
          </div>
        </div>
      )}

      {/* Configured Structured Fields Display */}
      {configuredVideoFields.some((field: LibraryConfigField) => metadata[field.name]) && (
        <div className="flex flex-wrap gap-1.5">
          {configuredVideoFields.map((field: LibraryConfigField) => {
            const val = metadata[field.name];
            if (!val) return null;
            const displayValue = Array.isArray(val) ? val.join(", ") : String(val);
            const colorClass = getTagColorClass(field.name);
            return (
              <span
                key={field.name}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] ${colorClass}`}
              >
                <span className="font-semibold text-amber-300/90">{field.name}</span>
                <span className="text-white/20">·</span>
                <span className="max-w-[10rem] truncate">{displayValue}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Tags Display */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => {
            const colorClass = getTagColorClass(tag);
            return (
              <span
                key={`tag-${i}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem] ${colorClass}`}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* Custom Fields Display */}
      {customFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customFields.map(([key, value]) => {
            const displayValue = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[0.62rem] text-white/70"
              >
                <span className="font-semibold text-amber-300/70">{key}</span>
                <span className="text-white/20">·</span>
                <span className="max-w-[10rem] truncate">{displayValue}</span>
              </span>
            );
          })}
        </div>
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
  libraryConfig,
}: {
  rootPath: string;
  clip: VideoDetailType["clips"][number];
  index: number;
  active: boolean;
  onSelect(): void;
  libraryConfig?: LibraryConfig;
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
      className={`group relative flex w-full cursor-pointer gap-3 rounded-none sm:rounded-xl border-x-0 border-t border-b-0 sm:border border-white/[0.06] px-0 py-3.5 sm:p-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] ${
        active
          ? "border-amber-400/60 bg-[#17140D]/30 sm:bg-[#17140D] shadow-[0_0_0_1px_rgba(232,163,61,0.15)]"
          : "border-white/[0.06] bg-transparent sm:bg-[#111316] hover:bg-[#14171B]/50 sm:hover:bg-[#14171B]"
      }`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl transition-all duration-200 origin-top hidden sm:block ${
          active ? "bg-amber-400 scale-y-100" : "scale-y-0 bg-transparent group-hover:scale-y-100 group-hover:bg-amber-400/30"
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

      <div className="min-w-0 flex-1 py-0.5 flex flex-col gap-1">
        <p className="truncate font-mono text-xs font-semibold text-white/90">
          Clip {pad(index)}
        </p>
        {clip.metadata && <MetadataTags metadata={clip.metadata} libraryConfig={libraryConfig} />}
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
  onDeleteSuccess(updatedVideo: VideoDetailType): void;
  libraryConfig?: LibraryConfig;
}

function ClipMetadataEditor({
  rootPath,
  videoRelativePath,
  clip,
  video,
  globalTags,
  onSaveSuccess,
  onDeleteSuccess,
  libraryConfig,
}: ClipMetadataEditorProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [ratingInput, setRatingInput] = useState(0);
  const [structuredFields, setStructuredFields] = useState<Record<string, string | string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const configuredClipFields = useMemo(() => {
    return libraryConfig?.fields.filter((f: LibraryConfigField) => f.type === "clip") ?? [];
  }, [libraryConfig]);

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

    const initialFields: Record<string, string | string[]> = {};
    configuredClipFields.forEach((field: LibraryConfigField) => {
      const val = clip.metadata?.[field.name];
      if (val !== undefined) {
        if (field.isMulti) {
          initialFields[field.name] = Array.isArray(val)
            ? (val as string[])
            : [String(val)];
        } else {
          initialFields[field.name] = String(val);
        }
      } else {
        initialFields[field.name] = field.isMulti ? [] : "";
      }
    });
    setStructuredFields(initialFields);

    setSaveError(null);
    setSaveSuccess(false);
  }, [clip, libraryConfig]);

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

    configuredClipFields.forEach((field: LibraryConfigField) => {
      const val = structuredFields[field.name];
      if (field.isMulti) {
        const arr = Array.isArray(val) ? val : [];
        if (arr.length > 0) {
          newMetadata[field.name] = arr;
        } else {
          delete newMetadata[field.name];
        }
      } else {
        const str = typeof val === "string" ? val : "";
        if (str) {
          newMetadata[field.name] = str;
        } else {
          delete newMetadata[field.name];
        }
      }
    });

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

    const initialFields: Record<string, string | string[]> = {};
    configuredClipFields.forEach((field: LibraryConfigField) => {
      const val = clip.metadata?.[field.name];
      if (val !== undefined) {
        if (field.isMulti) {
          initialFields[field.name] = Array.isArray(val)
            ? (val as string[])
            : [String(val)];
        } else {
          initialFields[field.name] = String(val);
        }
      } else {
        initialFields[field.name] = field.isMulti ? [] : "";
      }
    });
    setStructuredFields(initialFields);

    setSaveError(null);
    setSaveSuccess(false);
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this clip? This will physically rename subsequent clips to keep the sequence in sync.")) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await deleteClip({
        rootPath,
        videoRelativePath,
        clipMediaPath: clip.mediaPath,
      });

      const response = await getVideoDetail({ rootPath, videoRelativePath });
      onDeleteSuccess(response.video);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete clip.");
    } finally {
      setIsSaving(false);
    }
  }

  const isModified = useMemo(() => {
    const originalTags = extractTags(clip.metadata).join(", ");
    const originalNotes = String(clip.metadata?.notes ?? "");
    const originalRating = Number(clip.metadata?.rating ?? 0);

    const tagsChanged = tagsInput !== originalTags;
    const notesChanged = notesInput !== originalNotes;
    const ratingChanged = ratingInput !== originalRating;

    let structuredChanged = false;
    for (const field of configuredClipFields) {
      const orig = clip.metadata?.[field.name];
      const curr = structuredFields[field.name];
      if (field.isMulti) {
        const origArr = (Array.isArray(orig) ? orig : (orig ? [String(orig)] : [])) as string[];
        const currArr = Array.isArray(curr) ? curr : [];
        if (origArr.length !== currArr.length || !origArr.every(v => currArr.includes(v))) {
          structuredChanged = true;
          break;
        }
      } else {
        const origStr = orig ? String(orig) : "";
        const currStr = typeof curr === "string" ? curr : "";
        if (origStr !== currStr) {
          structuredChanged = true;
          break;
        }
      }
    }

    return tagsChanged || notesChanged || ratingChanged || structuredChanged;
  }, [clip.metadata, tagsInput, notesInput, ratingInput, structuredFields, configuredClipFields]);

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
          Clip Details Editor
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

          {/* Configured Structured Fields */}
          {configuredClipFields.map((field) => (
            <div key={field.name} className="space-y-1.5 animate-[rv-slide-down_0.2s_ease-out]">
              <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                {field.name}
              </label>
              {field.isMulti ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {field.values.map((val) => {
                    const isSelected = (structuredFields[field.name] as string[] ?? []).includes(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          const current = (structuredFields[field.name] as string[] ?? []);
                          const next = isSelected ? current.filter((c) => c !== val) : [...current, val];
                          setStructuredFields({ ...structuredFields, [field.name]: next });
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          isSelected
                            ? "border-purple-400/50 bg-purple-400/10 text-purple-300 font-semibold"
                            : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={structuredFields[field.name] as string ?? ""}
                  disabled={isSaving}
                  onChange={(e) => setStructuredFields({ ...structuredFields, [field.name]: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 bg-[#111316]"
                >
                  <option value="" className="text-white/40">Select {field.name}...</option>
                  {field.values.map((val) => (
                    <option key={val} value={val} className="text-white bg-[#111316]">{val}</option>
                  ))}
                </select>
              )}
            </div>
          ))}


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
                  className={`text-2xl transition-all duration-300 focus:outline-none hover:scale-125 active:scale-90 ${
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
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <button
            type="submit"
            disabled={isSaving || !isModified}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none flex-1 sm:flex-initial"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving || !isModified}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] active:translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40 flex-1 sm:flex-initial"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 transition-all duration-200 hover:bg-rose-500/20 hover:-translate-y-0.5 active:translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-40 w-full sm:w-auto"
            style={{ }}
            onMouseEnter={(e) => { if (!isSaving) e.currentTarget.style.animation = 'rv-danger-pulse 1s ease-in-out infinite'; }}
            onMouseLeave={(e) => { e.currentTarget.style.animation = ''; }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Clip
          </button>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-400 animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Changes saved successfully!
          </span>
        )}

        {saveError && (
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-rose-400 animate-[rv-shake_0.4s_ease-in-out_both]">
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
  onDeleteSuccess(): void;
  libraryConfig?: LibraryConfig;
}

function VideoMetadataEditor({
  rootPath,
  video,
  globalTags,
  onSaveSuccess,
  onDeleteSuccess,
  libraryConfig,
}: VideoMetadataEditorProps) {
  const [tagsInput, setTagsInput] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [ratingInput, setRatingInput] = useState(0);
  const [structuredFields, setStructuredFields] = useState<Record<string, string | string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const configuredVideoFields = useMemo(() => {
    return libraryConfig?.fields.filter((f: LibraryConfigField) => f.type === "video") ?? [];
  }, [libraryConfig]);

  async function handleDeleteVideo() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await deleteVideo({
        rootPath,
        videoRelativePath: video.relativePath,
      });
      onDeleteSuccess();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete video.");
      setIsConfirmingDelete(false);
    } finally {
      setIsSaving(false);
    }
  }

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

    const initialFields: Record<string, string | string[]> = {};
    configuredVideoFields.forEach((field: LibraryConfigField) => {
      const val = video.metadata?.[field.name];
      if (val !== undefined) {
        if (field.isMulti) {
          initialFields[field.name] = Array.isArray(val)
            ? (val as string[])
            : [String(val)];
        } else {
          initialFields[field.name] = String(val);
        }
      } else {
        initialFields[field.name] = field.isMulti ? [] : "";
      }
    });
    setStructuredFields(initialFields);

    setSaveError(null);
    setSaveSuccess(false);
  }, [video, libraryConfig]);

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

    configuredVideoFields.forEach((field: LibraryConfigField) => {
      const val = structuredFields[field.name];
      if (field.isMulti) {
        const arr = Array.isArray(val) ? val : [];
        if (arr.length > 0) {
          newMetadata[field.name] = arr;
        } else {
          delete newMetadata[field.name];
        }
      } else {
        const str = typeof val === "string" ? val : "";
        if (str) {
          newMetadata[field.name] = str;
        } else {
          delete newMetadata[field.name];
        }
      }
    });

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

    const initialFields: Record<string, string | string[]> = {};
    configuredVideoFields.forEach((field: LibraryConfigField) => {
      const val = video.metadata?.[field.name];
      if (val !== undefined) {
        if (field.isMulti) {
          initialFields[field.name] = Array.isArray(val)
            ? (val as string[])
            : [String(val)];
        } else {
          initialFields[field.name] = String(val);
        }
      } else {
        initialFields[field.name] = field.isMulti ? [] : "";
      }
    });
    setStructuredFields(initialFields);

    setSaveError(null);
    setSaveSuccess(false);
  }

  const isModified = useMemo(() => {
    const originalTags = extractTags(video.metadata).join(", ");
    const originalNotes = String(video.metadata?.notes ?? "");
    const originalRating = Number(video.metadata?.rating ?? 0);
    const originalArtist = String(video.metadata?.artist ?? "");

    const tagsChanged = tagsInput !== originalTags;
    const notesChanged = notesInput !== originalNotes;
    const ratingChanged = ratingInput !== originalRating;
    const artistChanged = artistInput !== originalArtist;

    let structuredChanged = false;
    for (const field of configuredVideoFields) {
      const orig = video.metadata?.[field.name];
      const curr = structuredFields[field.name];
      if (field.isMulti) {
        const origArr = (Array.isArray(orig) ? orig : (orig ? [String(orig)] : [])) as string[];
        const currArr = Array.isArray(curr) ? curr : [];
        if (origArr.length !== currArr.length || !origArr.every(v => currArr.includes(v))) {
          structuredChanged = true;
          break;
        }
      } else {
        const origStr = orig ? String(orig) : "";
        const currStr = typeof curr === "string" ? curr : "";
        if (origStr !== currStr) {
          structuredChanged = true;
          break;
        }
      }
    }

    return tagsChanged || artistChanged || notesChanged || ratingChanged || structuredChanged;
  }, [video.metadata, tagsInput, artistInput, notesInput, ratingInput, structuredFields, configuredVideoFields]);

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
          Video Details Editor
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

          {/* Configured Structured Fields */}
          {configuredVideoFields.map((field) => (
            <div key={field.name} className="space-y-1.5 animate-[rv-slide-down_0.2s_ease-out]">
              <label className="block font-mono text-[0.65rem] uppercase tracking-wider text-white/50">
                {field.name}
              </label>
              {field.isMulti ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {field.values.map((val) => {
                    const isSelected = (structuredFields[field.name] as string[] ?? []).includes(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          const current = (structuredFields[field.name] as string[] ?? []);
                          const next = isSelected ? current.filter((c) => c !== val) : [...current, val];
                          setStructuredFields({ ...structuredFields, [field.name]: next });
                        }}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          isSelected
                            ? "border-purple-400/50 bg-purple-400/10 text-purple-300 font-semibold"
                            : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={structuredFields[field.name] as string ?? ""}
                  disabled={isSaving}
                  onChange={(e) => setStructuredFields({ ...structuredFields, [field.name]: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-sm text-white focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50 bg-[#111316]"
                >
                  <option value="" className="text-white/40">Select {field.name}...</option>
                  {field.values.map((val) => (
                    <option key={val} value={val} className="text-white bg-[#111316]">{val}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

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
                  className={`text-2xl transition-all duration-300 focus:outline-none hover:scale-125 active:scale-90 ${
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
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <button
            type="submit"
            disabled={isSaving || !isModified}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none flex-1 sm:flex-initial"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving || !isModified}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] active:translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:cursor-not-allowed disabled:opacity-40 flex-1 sm:flex-initial"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-400 animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Changes saved successfully!
            </span>
          )}

          {saveError && (
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-rose-400 animate-[rv-shake_0.4s_ease-in-out_both]">
              Error: {saveError}
            </span>
          )}

          {!isConfirmingDelete ? (
            <button
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-4 py-2 text-sm font-medium text-rose-300 transition-all duration-200 hover:bg-rose-500/20 hover:-translate-y-0.5 active:translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:cursor-not-allowed disabled:opacity-40"
              onMouseEnter={(e) => { if (!isSaving) e.currentTarget.style.animation = 'rv-danger-pulse 1s ease-in-out infinite'; }}
              onMouseLeave={(e) => { e.currentTarget.style.animation = ''; }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Video
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-1.5">
              <span className="font-mono text-[0.65rem] uppercase tracking-wider text-rose-400 px-1">
                Confirm delete?
              </span>
              <button
                type="button"
                onClick={handleDeleteVideo}
                disabled={isSaving}
                className="rounded bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-600 focus-visible:outline-none"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isSaving}
                className="rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

interface SegmentPlan {
  start: number;
  end: number;
  tags: string[];
  notes?: string;
  rating?: number;
}

interface SegmentEditorProps {
  rootPath: string;
  video: VideoDetailType;
  globalTags: string[];
  currentTime: number;
  onSaveSuccess(): void;
  onCancel(): void;
}

function SegmentEditor({
  rootPath,
  video,
  globalTags,
  currentTime,
  onSaveSuccess,
  onCancel,
}: SegmentEditorProps) {
  const [segments, setSegments] = useState<SegmentPlan[]>([]);
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

  function suggestedTags(activeTags: string[]) {
    return allLibraryTags.filter((tag) => !activeTags.includes(tag));
  }

  function suggestedGlobalTags(activeTags: string[]) {
    return globalTags.filter(
      (tag) => !allLibraryTags.includes(tag) && !activeTags.includes(tag)
    );
  }

  function handleAddTag(index: number, tag: string) {
    const currentTags = segments[index]?.tags || [];
    if (!currentTags.includes(tag)) {
      updateSegment(index, { tags: [...currentTags, tag] });
    }
  }

  useEffect(() => {
    setSegments([]);
  }, [video]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      if (isTyping) return;

      const key = e.key.toLowerCase();
      if (key === "m") {
        e.preventDefault();
        addSegment();
      } else if (key === "i") {
        e.preventDefault();
        setSegments((prev) => {
          if (prev.length === 0) {
            return [
              {
                start: Math.round(currentTime * 100) / 100,
                end: Math.round((currentTime + 5) * 100) / 100,
                tags: [],
                notes: "",
                rating: 0,
              },
            ];
          }
          return prev.map((seg, idx) =>
            idx === prev.length - 1
              ? { ...seg, start: Math.round(currentTime * 100) / 100 }
              : seg
          );
        });
      } else if (key === "o") {
        e.preventDefault();
        setSegments((prev) => {
          if (prev.length === 0) {
            return [
              {
                start: Math.max(0, Math.round((currentTime - 5) * 100) / 100),
                end: Math.round(currentTime * 100) / 100,
                tags: [],
                notes: "",
                rating: 0,
              },
            ];
          }
          return prev.map((seg, idx) =>
            idx === prev.length - 1
              ? { ...seg, end: Math.round(currentTime * 100) / 100 }
              : seg
          );
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime]);

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      {
        start: Math.round(currentTime * 100) / 100,
        end: Math.round((currentTime + 5) * 100) / 100,
        tags: [],
        notes: "",
        rating: 0,
      },
    ]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSegment(index: number, updated: Partial<SegmentPlan>) {
    setSegments((prev) =>
      prev.map((seg, i) => (i === index ? { ...seg, ...updated } : seg))
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await saveSplitPlan({
        rootPath,
        videoRelativePath: video.relativePath,
        segments,
      });
      setSaveSuccess(true);
      onSaveSuccess();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save split plan.");
    } finally {
      setIsSaving(false);
    }
  }

  function formatTimecode(secs: number) {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${ms}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider text-amber-300">
            Clip Segment Editor
          </h3>
          <p className="text-xs text-white/40">
            Define segments to chop later using the python script.
          </p>
          <div className="mt-1 hidden md:flex flex-wrap gap-1 text-[0.62rem] font-mono text-white/30 items-center">
            <span>Shortcuts:</span>
            <kbd className="bg-white/10 px-1 rounded text-white/60">M</kbd>
            <span>Add Marker</span>
            <span className="text-white/10">·</span>
            <kbd className="bg-white/10 px-1 rounded text-white/60">I</kbd>
            <span>Set Start</span>
            <span className="text-white/10">·</span>
            <kbd className="bg-white/10 px-1 rounded text-white/60">O</kbd>
            <span>Set End</span>
          </div>
        </div>
        <button
          type="button"
          onClick={addSegment}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.97] focus:outline-none"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Marker
        </button>
      </div>

      {segments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-white/30">
            No markers
          </span>
          <p className="text-xs text-white/40">
            Click "+ Add Marker" to mark a clip segment.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {segments.map((seg, index) => (
            <div
              key={index}
              className="relative space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"
              style={{ animation: "rv-drop-in 0.25s ease-out both" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[0.65rem] uppercase tracking-wider text-white/40">
                  Marker #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeSegment(index)}
                  className="font-mono text-[0.6rem] uppercase tracking-wider text-rose-400 hover:text-rose-300 focus:outline-none"
                >
                  Delete
                </button>
              </div>

              {/* Time inputs */}
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/40">
                    Start (seconds)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      value={seg.start}
                      onChange={(e) =>
                        updateSegment(index, { start: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full rounded bg-white/[0.03] border border-white/[0.08] px-2 py-1 text-xs text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSegment(index, { start: Math.round(currentTime * 100) / 100 })
                      }
                      title="Set to current time"
                      className="rounded bg-white/[0.08] border border-white/[0.08] px-1.5 text-xs text-amber-300 hover:bg-white/[0.12]"
                    >
                      ⏱
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/40">
                    End (seconds)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      value={seg.end}
                      onChange={(e) =>
                        updateSegment(index, { end: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full rounded bg-white/[0.03] border border-white/[0.08] px-2 py-1 text-xs text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateSegment(index, { end: Math.round(currentTime * 100) / 100 })
                      }
                      title="Set to current time"
                      className="rounded bg-white/[0.08] border border-white/[0.08] px-1.5 text-xs text-amber-300 hover:bg-white/[0.12]"
                    >
                      ⏱
                    </button>
                  </div>
                </div>
              </div>

              {/* Timecode Previews */}
              <div className="flex justify-between font-mono text-[0.55rem] text-white/20">
                <span>TC: {formatTimecode(seg.start)}</span>
                <span>TC: {formatTimecode(seg.end)}</span>
              </div>

              {/* Tags */}
              <div className="space-y-1">
                <label className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/40">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. action, close up"
                  value={seg.tags.join(", ")}
                  onChange={(e) =>
                    updateSegment(
                      index,
                      {
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter((t) => t.length > 0),
                      }
                    )
                  }
                  className="w-full rounded bg-white/[0.03] border border-white/[0.08] px-2 py-1 text-xs text-white"
                />

                {/* Local Video Tag suggestions */}
                {suggestedTags(seg.tags).length > 0 && (
                  <div className="mt-1 space-y-1">
                    <span className="block font-mono text-[0.5rem] uppercase tracking-wider text-white/20">Suggestions (This Video)</span>
                    <div className="flex flex-wrap gap-1 max-h-[3.5rem] overflow-y-auto pr-1">
                      {suggestedTags(seg.tags).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(index, tag)}
                          className={`rounded-full border px-1.5 py-0.5 font-mono text-[0.52rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Global Library Tag suggestions */}
                {suggestedGlobalTags(seg.tags).length > 0 && (
                  <div className="mt-1 space-y-1">
                    <span className="block font-mono text-[0.5rem] uppercase tracking-wider text-white/20">Suggestions (Global Library)</span>
                    <div className="flex flex-wrap gap-1 max-h-[3.5rem] overflow-y-auto pr-1">
                      {suggestedGlobalTags(seg.tags).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(index, tag)}
                          className={`rounded-full border px-1.5 py-0.5 font-mono text-[0.52rem] transition focus:outline-none ${getTagColorClass(tag)} hover:opacity-85`}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block font-mono text-[0.55rem] uppercase tracking-wider text-white/40">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Add clip notes..."
                  value={seg.notes || ""}
                  onChange={(e) => updateSegment(index, { notes: e.target.value })}
                  className="w-full rounded bg-white/[0.03] border border-white/[0.08] px-2 py-1 text-xs text-white"
                />
              </div>

              {/* Rating */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[0.55rem] uppercase tracking-wider text-white/40">
                  Rating:
                </span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => updateSegment(index, { rating: star })}
                    className={`text-base transition-all duration-300 focus:outline-none hover:scale-125 active:scale-90 ${
                      star <= (seg.rating || 0)
                        ? "text-amber-400"
                        : "text-white/20 hover:text-amber-400/50"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || segments.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition-all duration-200 hover:bg-amber-300 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(251,191,36,0.4)] active:translate-y-px active:shadow-none active:scale-[0.97] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none flex-1 sm:flex-initial"
          >
            {isSaving ? "Saving..." : "Confirm & Save Split Plan"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] active:translate-y-px active:scale-[0.97] focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 flex-1 sm:flex-initial"
          >
            Cancel
          </button>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-emerald-400 animate-[rv-success-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Plan saved successfully!
          </span>
        )}

        {saveError && (
          <span className="font-mono text-[0.65rem] uppercase tracking-wider text-rose-400 animate-[rv-shake_0.4s_ease-in-out_both]">
            Error: {saveError}
          </span>
        )}
      </div>
    </div>
  );
}

export function VideoDetail({
  rootPath,
  video,
  globalTags,
  onUpdateVideoDetail,
  onDeleteVideo,
  libraryConfig,
}: VideoDetailProps) {

  const [selectedMediaPath, setSelectedMediaPath] = useState(video.mainVideoPath);
  const [isEditingSegments, setIsEditingSegments] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [playRate, setPlayRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPaused, setIsPaused] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [resolutionText, setResolutionText] = useState("1080p · 24fps");
  const [captureResult, setCaptureResult] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  async function handleCaptureFrame() {
    if (!videoRef.current) return;
    setIsCapturing(true);
    setCaptureError(null);
    setCaptureResult(null);

    const savedMediaRoot = typeof window !== "undefined"
      ? localStorage.getItem("reference-vault.media-root")
      : null;

    try {
      const response = await captureFrame({
        rootPath,
        mediaPath: selectedMediaPath,
        timestamp: videoRef.current.currentTime,
        mediaRootPath: savedMediaRoot || undefined,
      });
      setCaptureResult(response.savedPath);
      // Auto-clear success message after 4 seconds
      setTimeout(() => {
        setCaptureResult(null);
      }, 4000);
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : "Failed to capture frame.");
      setTimeout(() => {
        setCaptureError(null);
      }, 5000);
    } finally {
      setIsCapturing(false);
    }
  }

  // globalTags are now passed down directly as a prop


  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      selectedMediaPath,
    )}`;
  }, [rootPath, selectedMediaPath]);

  const posterUrl = useMemo(() => {
    if (video.thumbnailPath) {
      return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
        video.thumbnailPath,
      )}`;
    }
    return `/api/media/thumbnail?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      video.mainVideoPath,
    )}`;
  }, [rootPath, video.thumbnailPath, video.mainVideoPath]);

  useEffect(() => {
    setSelectedMediaPath(video.mainVideoPath);
    setPlayRate(1);
  }, [video.mainVideoPath]);

  useEffect(() => {
    if (video.width && video.height) {
      let label = "";
      const w = video.width;
      const h = video.height;
      if (w === 3840 && h === 2160) label = "4K";
      else if (h === 2160) label = "2160p";
      else if (h === 1440) label = "1440p";
      else if (h === 1080) label = "1080p";
      else if (h === 720) label = "720p";
      else if (h === 480) label = "480p";
      else label = `${w}x${h}`;

      if (video.framerate) {
        label += ` · ${video.framerate}`;
      }
      setResolutionText(label);
    } else {
      setResolutionText("1080p · 24fps");
    }
  }, [video, selectedMediaPath]);

  function skipForward(seconds = 10) {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds);
    }
  }

  function skipBackward(seconds = 10) {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - seconds);
    }
  }

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

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          } else {
            videoRef.current.pause();
          }
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipBackward(10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipForward(10);
      } else if (e.key === ",") {
        e.preventDefault();
        stepFrameBackward();
      } else if (e.key === ".") {
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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4 sm:gap-5 bg-[#0A0B0D] text-white">
      {/* Header */}
      <div className="hidden sm:flex flex-col gap-4 rounded-none sm:rounded-2xl border-0 sm:border border-white/[0.06] bg-[#111316] px-4 py-4 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Vault / Watch
            </p>
            <p className="mt-1 truncate font-mono text-sm text-white/50">{video.relativePath}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,0.9fr)] gap-4 sm:gap-5 items-start">
        {/* Sticky Video Player Container */}
        <div className="sticky top-0 z-30 -mx-2 w-[calc(100%+1rem)] mt-0 xl:relative xl:top-auto xl:z-auto xl:mx-0 xl:w-full xl:col-start-1 xl:col-end-2 xl:row-start-1 xl:row-end-2 bg-black aspect-video overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border border-white/[0.06]">
          {/* Corner Viewfinder Braces */}
          <div className="pointer-events-none absolute -inset-1 z-10 hidden md:block">
            <span className="absolute left-0 top-0 h-6 w-6 border-l-2 border-t-2 border-amber-400/50" />
            <span className="absolute right-0 top-0 h-6 w-6 border-r-2 border-t-2 border-amber-400/50" />
            <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-amber-400/50" />
            <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-amber-400/50" />
          </div>

          {/* Viewfinder HUD overlays */}
          <div className="absolute top-3.5 right-3.5 z-20 pointer-events-none hidden md:block font-mono text-[0.62rem] tracking-wider text-white/40 bg-black/40 px-2 py-0.5 rounded backdrop-blur-[1px]">
            <span>{resolutionText}</span>
          </div>

          {/* Ambilight Glow */}
          <div className="absolute inset-0 z-0 bg-amber-400/20 blur-[100px] rounded-full scale-90 mix-blend-screen opacity-50" />
          
          <div className="relative z-10 w-full h-full bg-black aspect-video">
            <video
              ref={videoRef}
              controls
              className="h-full w-full bg-black aspect-video"
              src={mediaUrl}
              poster={posterUrl}
              preload="metadata"
              onPlay={() => setIsPaused(false)}
              onPause={() => setIsPaused(true)}
              onSeeked={(e) => setIsPaused(e.currentTarget.paused)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                const w = e.currentTarget.videoWidth;
                const h = e.currentTarget.videoHeight;
                if (w && h) {
                  let label = "";
                  if (w === 3840 && h === 2160) label = "4K";
                  else if (h === 2160) label = "2160p";
                  else if (h === 1440) label = "1440p";
                  else if (h === 1080) label = "1080p";
                  else if (h === 720) label = "720p";
                  else if (h === 480) label = "480p";
                  else label = `${w}x${h}`;
                  setResolutionText(label);
                }
              }}
            >
              Your browser does not support the video element.
            </video>
          </div>
        </div>

        {/* Video Info & Controls Panel */}
        <section className="flex flex-col gap-4 rounded-none sm:rounded-2xl border-0 sm:border border-white/[0.06] bg-[#111316] p-4 xl:col-start-1 xl:col-end-2 xl:row-start-2 xl:row-end-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                {isMainPlaying ? "Now Playing · Main" : "Now Playing · Clip"}
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-white sm:text-xl">
                {isMainPlaying
                  ? video.relativePath
                  : `Clip ${pad(video.clips.findIndex((c) => c.mediaPath === selectedMediaPath))}`}
              </h2>
              {isMainPlaying && video.metadata ? (
                <VideoDetailsDisplay metadata={video.metadata} libraryConfig={libraryConfig} />
              ) : (
                !isMainPlaying && activeClip?.metadata && (
                  <VideoDetailsDisplay metadata={activeClip.metadata} libraryConfig={libraryConfig} />
                )
              )}
            </div>
            {!isMainPlaying && (
              <button
                type="button"
                onClick={() => setSelectedMediaPath(video.mainVideoPath)}
                className="inline-flex items-center gap-2 self-start rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0A0B0D] transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111316]"
              >
                <PlayCircle className="h-4 w-4" />
                Play main video
              </button>
            )}
          </div>

          {/* Capture Feedback Toast */}
          {(captureResult || captureError) && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[0.7rem] font-mono uppercase tracking-wider ${
              captureResult
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                : "border-rose-500/20 bg-rose-500/5 text-rose-400"
            }`} style={{ animation: "rv-success-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>
              <span className={`h-1.5 w-1.5 rounded-full ${captureResult ? "bg-emerald-400 animate-ping" : "bg-rose-400"}`} />
              <span>
                {captureResult ? `Saved: ${captureResult.split("/").pop()}` : `Error: ${captureError}`}
              </span>
            </div>
          )}

          {/* Advanced Playback Control Panel */}
          <div className="flex flex-col gap-3.5 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-3 text-xs sm:text-sm">
            {/* Frame step buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                onClick={stepFrameBackward}
                title="Step 1 Frame Back (Comma)"
                className="flex-1 sm:flex-initial text-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-white/80 hover:border-amber-400/40 hover:bg-white/[0.06] transition-all focus:outline-none active:scale-[0.97]"
              >
                ◀ Frame
              </button>
              <button
                type="button"
                onClick={stepFrameForward}
                title="Step 1 Frame Forward (Period)"
                className="flex-1 sm:flex-initial text-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-white/80 hover:border-amber-400/40 hover:bg-white/[0.06] transition-all focus:outline-none active:scale-[0.97]"
              >
                Frame ▶
              </button>
            </div>

            {/* Playback speed rate selection */}
            <div className="flex items-center gap-1.5 justify-between w-full sm:w-auto sm:justify-start">
              <div className="flex items-center gap-1 text-white/40">
                <Gauge className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/30 mr-1 min-[320px]:inline sm:hidden lg:inline">Speed</span>
              </div>
              <div className="flex flex-1 justify-end sm:justify-start items-center gap-1 sm:gap-1.5">
                {[0.25, 0.5, 1, 2].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => changePlayRate(rate)}
                    className={`rounded-lg px-2.5 py-2 sm:px-2.5 sm:py-1.5 font-mono text-[0.68rem] sm:text-xs transition-all focus:outline-none active:scale-[0.95] ${
                      playRate === rate
                        ? "bg-amber-400 font-semibold text-[#0A0B0D] shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                        : "border border-white/[0.08] bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons: Loop & Capture */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Loop Toggle */}
              <button
                type="button"
                onClick={() => setIsLooping(!isLooping)}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest transition-all duration-200 focus:outline-none text-center hover:-translate-y-0.5 active:translate-y-px active:scale-[0.97] ${
                  isLooping
                    ? "bg-amber-400/20 border border-amber-400/50 text-amber-300 font-semibold shadow-[0_0_8px_rgba(232,163,61,0.2)]"
                    : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white"
                }`}
              >
                <Repeat className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Loop: {isLooping ? "ON" : "OFF"}</span>
              </button>

              {/* Capture Frame Button */}
              <button
                type="button"
                onClick={handleCaptureFrame}
                disabled={isCapturing || !isPaused}
                title={!isPaused ? "Pause the video first to capture a frame" : "Capture current frame to Generated/"}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest transition-all duration-200 focus:outline-none text-center hover:-translate-y-0.5 active:translate-y-px active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
                  isCapturing
                    ? "bg-amber-400/20 border border-amber-400/50 text-amber-300 font-semibold animate-pulse"
                    : "border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-amber-400/50"
                }`}
              >
                <Camera className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{isCapturing ? "Capturing..." : "Capture Frame"}</span>
              </button>
            </div>
          </div>


          {/* Details Editor Section */}
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              onClick={() => setIsEditorExpanded(!isEditorExpanded)}
              className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.05] hover:border-amber-400/30 focus-visible:outline-none"
            >
              <div className="flex items-center gap-2">
                <Edit className="h-4 w-4 text-amber-400" />
                <span className="font-mono text-xs uppercase tracking-wider">
                  {isMainPlaying ? "Video Details Editor" : "Clip Details Editor"}
                </span>
              </div>
              <div>
                {isEditorExpanded ? (
                  <ChevronUp className="h-4 w-4 text-white/50" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/50" />
                )}
              </div>
            </button>

            {isEditorExpanded && (
              <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.01] p-4 animate-[rv-fade-up_0.2s_ease-out_both]">
                {!isMainPlaying && activeClip ? (
                  <ClipMetadataEditor
                    rootPath={rootPath}
                    videoRelativePath={video.relativePath}
                    clip={activeClip}
                    video={video}
                    globalTags={globalTags}
                    onSaveSuccess={onUpdateVideoDetail}
                    onDeleteSuccess={(updatedVideo) => {
                      onUpdateVideoDetail(updatedVideo);
                      setSelectedMediaPath(updatedVideo.mainVideoPath);
                    }}
                    libraryConfig={libraryConfig}
                  />
                ) : (
                  isMainPlaying && (
                    <VideoMetadataEditor
                      rootPath={rootPath}
                      video={video}
                      globalTags={globalTags}
                      onSaveSuccess={onUpdateVideoDetail}
                      onDeleteSuccess={onDeleteVideo}
                      libraryConfig={libraryConfig}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </section>


        {/* Clip rail (YouTube recommended videos style) */}
        <aside className="flex flex-col gap-4 rounded-none sm:rounded-2xl border-0 sm:border border-white/[0.06] bg-transparent sm:bg-[#111316] p-4 max-h-none xl:max-h-[80vh] overflow-y-visible xl:overflow-y-auto no-scrollbar xl:col-start-2 xl:col-end-3 xl:row-start-1 xl:row-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
                {isEditingSegments ? "Segment Log" : "Clip Index"}
              </p>
              <p className="mt-1 text-sm text-white/40">
                {isEditingSegments ? "Mark start/end segments." : "Select a clip to play it instantly."}
              </p>
            </div>
            {!isEditingSegments ? (
              <button
                type="button"
                onClick={() => setIsEditingSegments(true)}
                className="inline-flex items-center gap-1.5 rounded border border-amber-400/30 bg-amber-400/[0.06] px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-amber-300 transition-all duration-200 hover:bg-amber-400/10 hover:-translate-y-0.5 active:translate-y-px active:scale-[0.97] focus:outline-none"
              >
                <Scissors className="h-3 w-3" />
                Create Clips
              </button>
            ) : (
              <span className="rounded bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-amber-300 animate-[rv-fade-up_0.2s_ease-out_both]">
                Editing
              </span>
            )}
          </div>

          {isEditingSegments ? (
            <SegmentEditor
              rootPath={rootPath}
              video={video}
              globalTags={globalTags}
              currentTime={currentTime}
              onSaveSuccess={async () => {
                try {
                  const result = await getVideoDetail({
                    rootPath,
                    videoRelativePath: video.relativePath,
                  });
                  onUpdateVideoDetail(result.video);
                  setIsEditingSegments(false);
                } catch {
                  setIsEditingSegments(false);
                }
              }}
              onCancel={() => setIsEditingSegments(false)}
            />
          ) : video.clips.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
              <Film className="h-8 w-8 text-white/20 mb-1" />
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-white/30">
                No entries
              </span>
              <p className="text-sm text-white/40">
                No numbered clips are indexed for this video yet.
              </p>
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-visible pr-0.5">
              {video.clips.map((clip, index) => (
                <li key={clip.mediaPath}>
                  <ClipCard
                    rootPath={rootPath}
                    clip={clip}
                    index={index}
                    active={selectedMediaPath === clip.mediaPath}
                    onSelect={() => setSelectedMediaPath(clip.mediaPath)}
                    libraryConfig={libraryConfig}
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