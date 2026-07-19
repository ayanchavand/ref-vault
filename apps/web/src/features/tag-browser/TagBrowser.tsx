import { useEffect, useMemo, useRef, useState, memo } from "react";
import type {
  JsonObject,
  ScannedVideo,
  VideoDetail as VideoDetailType,
  LibraryConfig,
  LibraryConfigField,
} from "@reference-vault/shared";

import { getVideoDetail, ApiError } from "../../lib/api";
import { useLazyThumbnail, usePrefetchOnHover } from "../video-browser/Uselazythumbnail";
import { Tag, Scissors, X, Film, SlidersHorizontal, ChevronDown, ChevronRight, Search } from "lucide-react";

interface TagBrowserProps {
  rootPath: string;
  videos: ScannedVideo[];
  onSelectVideo(video: ScannedVideo): void;
  libraryConfig?: LibraryConfig;
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

function getTagColorClass(tag: string): string {
  const clean = tag.toLowerCase().trim();
  if (
    clean.includes("camera") ||
    clean.includes("angle") ||
    clean.includes("shot") ||
    clean.includes("lens")
  ) {
    return "border-sky-500/20 bg-sky-500/5 text-sky-300";
  }
  if (
    clean.includes("light") ||
    clean.includes("warm") ||
    clean.includes("cool") ||
    clean.includes("color")
  ) {
    return "border-amber-500/20 bg-amber-500/5 text-amber-300";
  }
  if (
    clean.includes("action") ||
    clean.includes("motion") ||
    clean.includes("speed") ||
    clean.includes("run") ||
    clean.includes("walk") ||
    clean.includes("jump")
  ) {
    return "border-purple-500/20 bg-purple-500/5 text-purple-300";
  }
  return "border-white/[0.08] bg-white/[0.02] text-white/70";
}

const TagBrowserClipCard = memo(function TagBrowserClipCard({
  rootPath,
  entry,
  video,
  onSelect,
}: {
  rootPath: string;
  entry: TaggedClip;
  video?: ScannedVideo;
  onSelect(video: ScannedVideo): void;
}) {
  const mediaUrl = `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
    entry.clip.mediaPath,
  )}`;
  const posterUrl = `/api/media/thumbnail?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
    entry.clip.mediaPath,
  )}`;
  const { containerRef, poster } = useLazyThumbnail({ mediaUrl, posterUrl });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  return (
    <button
      type="button"
      onClick={() => {
        if (video) {
          onSelect(video);
        }
      }}
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
          <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[0.6rem] text-white/60">
            {entry.source === "clip" ? <Scissors className="h-3 w-3" /> : <Film className="h-3 w-3" />}
            {entry.source === "clip" ? "clip" : "video"}
          </span>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[0.6rem] text-white/60">
            {entry.clip.metadata ? Object.keys(entry.clip.metadata).length : 0} fields
          </span>
        </div>

        {/* Render Active Configured Fields Badges */}
        {entry.clip.metadata && (
          <div className="flex flex-wrap gap-1 mt-1 border-t border-white/[0.04] pt-1.5">
            {Object.entries(entry.clip.metadata)
              .filter(([key]) => key !== "tags" && key !== "notes" && key !== "rating")
              .slice(0, 3)
              .map(([key, value]) => {
                const displayVal = Array.isArray(value) ? value.join(", ") : String(value);
                const colorClass = getTagColorClass(key);
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 font-mono text-[0.58rem] ${colorClass}`}
                  >
                    <span className="font-semibold">{key}:</span>
                    <span className="truncate max-w-[4rem]">{displayVal}</span>
                  </span>
                );
              })}
          </div>
        )}
      </div>
    </button>
  );
});

export function TagBrowser({ rootPath, videos, onSelectVideo, libraryConfig }: TagBrowserProps) {
  const videoMap = useMemo(() => {
    return new Map(videos.map((v) => [v.relativePath, v]));
  }, [videos]);

  const [videoDetails, setVideoDetails] = useState<VideoDetailType[]>([]);
  const [selectedVideoTags, setSelectedVideoTags] = useState<string[]>([]);
  const [selectedClipTags, setSelectedClipTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search input state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Collapsible categories state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>(() => {
    return {
      "Video Tags": false,
      "Clip Tags": false,
    };
  });

  function toggleCategory(catName: string) {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: prev[catName] === false ? true : false, // custom fields default to true (collapsed) if undefined
    }));
  }

  function isCollapsed(catName: string): boolean {
    return collapsedCategories[catName] !== false; // collapsed if true or undefined
  }

  // Click outside search suggestion list dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setVideoDetails(videos as unknown as VideoDetailType[]);
    setSelectedVideoTags([]);
    setSelectedClipTags([]);
    setSelectedCategories({});
    setIsLoading(false);
  }, [videos]);

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

  // Calculate counts for dynamic structured fields
  const categoryCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};

    libraryConfig?.fields.forEach((field) => {
      counts[field.name] = {};
      field.values.forEach((val) => {
        const fieldMap = counts[field.name];
        if (fieldMap) {
          fieldMap[val] = 0;
        }
      });
    });

    for (const detail of videoDetails) {
      const videoFields = libraryConfig?.fields.filter((f) => f.type === "video") ?? [];
      videoFields.forEach((field) => {
        const val = detail.metadata?.[field.name];
        if (val) {
          const vals = Array.isArray(val) ? val : [val];
          vals.forEach((v) => {
            const vStr = String(v);
            const fieldCounts = counts[field.name];
            if (fieldCounts && fieldCounts[vStr] !== undefined) {
              fieldCounts[vStr] += detail.clips.length;
            }
          });
        }
      });

      const clipFields = libraryConfig?.fields.filter((f) => f.type === "clip") ?? [];
      detail.clips.forEach((clip) => {
        clipFields.forEach((field) => {
          const val = clip.metadata?.[field.name];
          if (val) {
            const vals = Array.isArray(val) ? val : [val];
            vals.forEach((v) => {
              const vStr = String(v);
              const fieldCounts = counts[field.name];
              if (fieldCounts && fieldCounts[vStr] !== undefined) {
                fieldCounts[vStr] += 1;
              }
            });
          }
        });
      });
    }

    return counts;
  }, [videoDetails, libraryConfig]);

  const matchedClips = useMemo(() => {
    const list: TaggedClip[] = [];

    const configuredVideoFields = libraryConfig?.fields.filter((f) => f.type === "video") ?? [];
    const configuredClipFields = libraryConfig?.fields.filter((f) => f.type === "clip") ?? [];

    for (const detail of videoDetails) {
      // 1. Check flat video tags
      const vTags = extractTags(detail.metadata);
      const matchesVideoTags = selectedVideoTags.every((t) => vTags.includes(t));
      if (!matchesVideoTags) continue;

      // 2. Check video-level dynamic categories
      let matchesVideoCategories = true;
      for (const field of configuredVideoFields) {
        const selectedVals = selectedCategories[field.name] || [];
        if (selectedVals.length === 0) continue;
        const actual = detail.metadata?.[field.name];
        if (actual === undefined || actual === null) {
          matchesVideoCategories = false;
          break;
        }
        if (Array.isArray(actual)) {
          if (!selectedVals.some((v) => actual.includes(v))) {
            matchesVideoCategories = false;
            break;
          }
        } else {
          if (!selectedVals.includes(String(actual))) {
            matchesVideoCategories = false;
            break;
          }
        }
      }
      if (!matchesVideoCategories) continue;

      for (const clip of detail.clips) {
        // 3. Check flat clip tags
        const cTags = extractTags(clip.metadata);
        const matchesClipTags = selectedClipTags.every((t) => cTags.includes(t));
        if (!matchesClipTags) continue;

        // 4. Check clip-level dynamic categories
        let matchesClipCategories = true;
        for (const field of configuredClipFields) {
          const selectedVals = selectedCategories[field.name] || [];
          if (selectedVals.length === 0) continue;
          const actual = clip.metadata?.[field.name];
          if (actual === undefined || actual === null) {
            matchesClipCategories = false;
            break;
          }
          if (Array.isArray(actual)) {
            if (!selectedVals.some((v) => actual.includes(v))) {
              matchesClipCategories = false;
              break;
            }
          } else {
            if (!selectedVals.includes(String(actual))) {
              matchesClipCategories = false;
              break;
            }
          }
        }
        if (!matchesClipCategories) continue;

        const source = clip.metadata ? ("clip" as const) : ("video" as const);
        list.push({ clip, video: detail, source });
      }
    }
    return list;
  }, [videoDetails, selectedVideoTags, selectedClipTags, selectedCategories, libraryConfig]);

  // All Search Suggestions
  const searchSuggestions = useMemo(() => {
    const list: {
      category: string;
      value: string;
      type: "video-tag" | "clip-tag" | "custom";
      fieldType?: "video" | "clip";
    }[] = [];

    videoTagsList.forEach((tag) => {
      list.push({ category: "Video Tags", value: tag, type: "video-tag" });
    });

    clipTagsList.forEach((tag) => {
      list.push({ category: "Clip Tags", value: tag, type: "clip-tag" });
    });

    libraryConfig?.fields.forEach((field) => {
      field.values.forEach((val) => {
        list.push({
          category: field.name,
          value: val,
          type: "custom",
          fieldType: field.type,
        });
      });
    });

    return list;
  }, [videoTagsList, clipTagsList, libraryConfig]);

  // Filtered Search Suggestions
  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return searchSuggestions;

    return searchSuggestions.filter(
      (item) =>
        item.value.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query),
    );
  }, [searchSuggestions, searchQuery]);

  // Grouped suggestions
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, typeof filteredSuggestions> = {};
    filteredSuggestions.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category]!.push(item);
    });
    return groups;
  }, [filteredSuggestions]);

  const isFilterActive =
    selectedVideoTags.length > 0 ||
    selectedClipTags.length > 0 ||
    Object.values(selectedCategories).some((vals) => vals.length > 0);

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-5 bg-[#0A0B0D] text-white">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316] px-4 py-4 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
            Vault / Tags
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">
            Browse clips by tags and dynamic categories.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-white/[0.06] bg-[#111316] p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.04] pb-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Filter Library
            </p>
            <p className="mt-1 text-sm text-white/50">
              Search or expand categories below to filter matching reference clips.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/50">
            <SlidersHorizontal className="h-3 w-3" />
            {matchedClips.length} matched
          </span>
        </div>

        {/* Input box with suggestions dropdown */}
        <div ref={searchRef} className="relative w-full max-w-xl">
          <label htmlFor="tag-search" className="sr-only">Search tags and categories</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              id="tag-search"
              type="text"
              placeholder="Search tags, categories, or values..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full rounded-xl border border-white/[0.08] bg-[#14171B] py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search Dropdown overlay */}
          {isSearchFocused && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-white/[0.08] bg-[#14171B]/95 p-2 shadow-2xl backdrop-blur-md animate-[rv-fade-up_0.15s_ease-out]">
              {Object.keys(groupedSuggestions).length === 0 ? (
                <div className="px-4 py-3 text-center text-xs text-white/40">
                  No matching tags or categories found.
                </div>
              ) : (
                Object.entries(groupedSuggestions).map(([category, items]) => (
                  <div key={category} className="mb-2 last:mb-0">
                    <span className="block px-3 py-1 font-mono text-[0.55rem] uppercase tracking-wider text-white/30">
                      {category}
                    </span>
                    <div className="space-y-0.5 mt-1">
                      {items.map((item) => {
                        let isSelected = false;
                        if (item.type === "video-tag") {
                          isSelected = selectedVideoTags.includes(item.value);
                        } else if (item.type === "clip-tag") {
                          isSelected = selectedClipTags.includes(item.value);
                        } else {
                          isSelected = (selectedCategories[item.category] || []).includes(item.value);
                        }

                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => {
                              if (item.type === "video-tag") {
                                setSelectedVideoTags((prev) =>
                                  isSelected ? prev.filter((t) => t !== item.value) : [...prev, item.value],
                                );
                              } else if (item.type === "clip-tag") {
                                setSelectedClipTags((prev) =>
                                  isSelected ? prev.filter((t) => t !== item.value) : [...prev, item.value],
                                );
                              } else {
                                const current = selectedCategories[item.category] || [];
                                const next = isSelected
                                  ? current.filter((v) => v !== item.value)
                                  : [...current, item.value];
                                setSelectedCategories((prev) => ({
                                  ...prev,
                                  [item.category]: next,
                                }));
                              }
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition ${
                              isSelected
                                ? "bg-amber-400/10 text-amber-300 font-semibold"
                                : "text-white/80 hover:bg-white/[0.04]"
                            }`}
                          >
                            <span>{item.value}</span>
                            {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Active Filters Pills List */}
        {isFilterActive && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.04] bg-[#14171B]/30 p-2.5">
            <span className="font-mono text-[0.55rem] uppercase tracking-wider text-white/30 mr-1.5">
              Active filters:
            </span>
            {selectedVideoTags.map((tag) => (
              <span
                key={`active-v-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/[0.06] pl-2.5 pr-1 py-0.5 text-[0.62rem] text-amber-300 font-medium"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => setSelectedVideoTags((prev) => prev.filter((t) => t !== tag))}
                  className="rounded-full p-0.5 hover:bg-amber-400/25 text-amber-400/70 hover:text-amber-300 transition"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {selectedClipTags.map((tag) => (
              <span
                key={`active-c-${tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/[0.06] pl-2.5 pr-1 py-0.5 text-[0.62rem] text-sky-300 font-medium"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => setSelectedClipTags((prev) => prev.filter((t) => t !== tag))}
                  className="rounded-full p-0.5 hover:bg-sky-400/25 text-sky-400/70 hover:text-sky-300 transition"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {Object.entries(selectedCategories).map(([category, vals]) =>
              vals.map((val) => (
                <span
                  key={`active-cat-${category}-${val}`}
                  className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-400/[0.06] pl-2.5 pr-1 py-0.5 text-[0.62rem] text-purple-300 font-medium"
                >
                  <span className="opacity-75">{category}:</span>
                  <span className="font-semibold">{val}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const current = selectedCategories[category] || [];
                      const next = current.filter((v) => v !== val);
                      setSelectedCategories((prev) => ({ ...prev, [category]: next }));
                    }}
                    className="rounded-full p-0.5 hover:bg-purple-400/25 text-purple-400/70 hover:text-purple-300 transition"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )),
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedVideoTags([]);
                setSelectedClipTags([]);
                setSelectedCategories({});
              }}
              className="ml-auto text-[0.58rem] font-semibold text-rose-400 hover:text-rose-300 uppercase tracking-wider px-2 py-0.5 transition"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Collapsible Categories Grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 pt-2">
          {/* Card: Video Tags */}
          <div className="flex flex-col rounded-xl border border-white/[0.06] bg-[#14171B]/40 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory("Video Tags")}
              className="flex items-center justify-between w-full p-3 font-semibold text-left border-b border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-amber-300">
                  Video Tags
                </span>
                {selectedVideoTags.length > 0 && (
                  <span className="rounded bg-amber-400/25 px-1.5 py-0.5 text-[0.58rem] font-bold text-amber-300">
                    {selectedVideoTags.length}
                  </span>
                )}
              </div>
              {isCollapsed("Video Tags") ? (
                <ChevronRight className="h-3.5 w-3.5 text-white/50" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-white/50" />
              )}
            </button>
            {!isCollapsed("Video Tags") && (
              <div className="p-3 overflow-y-auto max-h-48 flex flex-wrap gap-1.5 animate-[rv-slide-down_0.2s_ease-out]">
                {isLoading ? (
                  <div className="h-6 w-full rounded bg-white/[0.03] animate-pulse" />
                ) : videoTagsList.length === 0 ? (
                  <span className="text-[0.68rem] text-white/30 italic">No tags</span>
                ) : (
                  videoTagsList.map((tag) => {
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
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] transition ${
                          isSelected
                            ? "border-amber-400 bg-amber-400/10 text-amber-300 font-semibold"
                            : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
                        }`}
                      >
                        <span>{tag}</span>
                        <span className="opacity-40 font-mono text-[0.58rem]">
                          ({videoTagCounts[tag] || 0})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Card: Clip Tags */}
          <div className="flex flex-col rounded-xl border border-white/[0.06] bg-[#14171B]/40 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory("Clip Tags")}
              className="flex items-center justify-between w-full p-3 font-semibold text-left border-b border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-sky-300">
                  Clip Tags
                </span>
                {selectedClipTags.length > 0 && (
                  <span className="rounded bg-sky-400/25 px-1.5 py-0.5 text-[0.58rem] font-bold text-sky-300">
                    {selectedClipTags.length}
                  </span>
                )}
              </div>
              {isCollapsed("Clip Tags") ? (
                <ChevronRight className="h-3.5 w-3.5 text-white/50" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-white/50" />
              )}
            </button>
            {!isCollapsed("Clip Tags") && (
              <div className="p-3 overflow-y-auto max-h-48 flex flex-wrap gap-1.5 animate-[rv-slide-down_0.2s_ease-out]">
                {isLoading ? (
                  <div className="h-6 w-full rounded bg-white/[0.03] animate-pulse" />
                ) : clipTagsList.length === 0 ? (
                  <span className="text-[0.68rem] text-white/30 italic">No tags</span>
                ) : (
                  clipTagsList.map((tag) => {
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
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] transition ${
                          isSelected
                            ? "border-sky-400 bg-sky-400/10 text-sky-300 font-semibold"
                            : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
                        }`}
                      >
                        <span>{tag}</span>
                        <span className="opacity-40 font-mono text-[0.58rem]">
                          ({clipTagCounts[tag] || 0})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Cards for Dynamic categories */}
          {libraryConfig?.fields.map((field) => {
            const activeCount = (selectedCategories[field.name] || []).length;
            const valuesCount = categoryCounts[field.name] || {};
            return (
              <div
                key={field.name}
                className="flex flex-col rounded-xl border border-white/[0.06] bg-[#14171B]/40 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(field.name)}
                  className="flex items-center justify-between w-full p-3 font-semibold text-left border-b border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.04] transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase tracking-wider text-purple-300">
                      {field.name}
                    </span>
                    <span className="font-mono text-[0.58rem] text-white/30">
                      ({field.type})
                    </span>
                    {activeCount > 0 && (
                      <span className="rounded bg-purple-400/25 px-1.5 py-0.5 text-[0.58rem] font-bold text-purple-300">
                        {activeCount}
                      </span>
                    )}
                  </div>
                  {isCollapsed(field.name) ? (
                    <ChevronRight className="h-3.5 w-3.5 text-white/50" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-white/50" />
                  )}
                </button>
                {!isCollapsed(field.name) && (
                  <div className="p-3 overflow-y-auto max-h-48 flex flex-wrap gap-1.5 animate-[rv-slide-down_0.2s_ease-out]">
                    {field.values.map((val) => {
                      const isSelected = (selectedCategories[field.name] || []).includes(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const current = selectedCategories[field.name] || [];
                            const next = isSelected
                              ? current.filter((v) => v !== val)
                              : [...current, val];
                            setSelectedCategories((prev) => ({
                              ...prev,
                              [field.name]: next,
                            }));
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] transition ${
                            isSelected
                              ? "border-purple-400 bg-purple-400/10 text-purple-300 font-semibold"
                              : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
                          }`}
                        >
                          <span>{val}</span>
                          <span className="opacity-40 font-mono text-[0.58rem]">
                            ({valuesCount[val] || 0})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Matches Area */}
        <div className="pt-4 border-t border-white/[0.04]">
          {!isFilterActive ? (
            <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
              Select one or more filters above or type in the search box to find matching clips.
            </div>
          ) : matchedClips.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.10] px-4 py-10 text-center text-sm text-white/40">
              No clips match the selected combination of filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {matchedClips.map((entry) => {
                const scannedVideo = videoMap.get(entry.video.relativePath);
                return (
                  <TagBrowserClipCard
                    key={`${entry.video.relativePath}:${entry.clip.mediaPath}`}
                    rootPath={rootPath}
                    entry={entry}
                    video={scannedVideo}
                    onSelect={onSelectVideo}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
