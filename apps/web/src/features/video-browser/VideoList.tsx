import { useMemo, useState, useEffect, memo } from "react";
import { List, LayoutGrid, Video, User, FileText, Film, Tag, AlertTriangle } from "lucide-react";
import type { ScannedVideo, JsonObject, LibraryConfig, LibraryConfigField } from "@reference-vault/shared";
import { useLazyThumbnail, usePrefetchOnHover, useDynamicThumbnail } from "./Uselazythumbnail";
import { showTitleInListKey, showTitleInBoardKey } from "../settings/Settings";

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


interface VideoListProps {
  rootPath: string;
  videos: ScannedVideo[];
  onSelectVideo(video: ScannedVideo): void;
  isLoading: boolean;
  openingVideoPath: string | null;
  error: string | null;
  libraryConfig?: LibraryConfig;
}

function ShimmerFill() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-[rv-shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
  );
}

function SkeletonCard() {
  return (
    <li className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#111316]">
      <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
        <ShimmerFill />
      </div>
      <div className="space-y-2 p-4">
        <div className="relative h-3.5 w-3/5 overflow-hidden rounded bg-white/[0.06]">
          <ShimmerFill />
        </div>
        <div className="relative h-3 w-2/5 overflow-hidden rounded bg-white/[0.04]">
          <ShimmerFill />
        </div>
      </div>
    </li>
  );
}

const VideoThumbnailCard = memo(function VideoThumbnailCard({
  rootPath,
  video,
  isOpening,
  disabled,
  onSelect,
  viewMode = "details",
  cardIndex = 0,
  libraryConfig,
  showTitleInList = true,
  showTitleInBoard = true,
}: {
  rootPath: string;
  video: ScannedVideo;
  isOpening: boolean;
  disabled: boolean;
  onSelect(video: ScannedVideo): void;
  viewMode?: "details" | "moodboard";
  cardIndex?: number;
  libraryConfig?: LibraryConfig;
  showTitleInList?: boolean;
  showTitleInBoard?: boolean;
}) {
  const artist = video.metadata?.artist ? String(video.metadata.artist) : null;
  const rating = video.metadata?.rating ? Number(video.metadata.rating) : 0;
  const notes = video.metadata?.notes ? String(video.metadata.notes) : null;
  const tags = useMemo(() => {
    if (!video.metadata) return [];
    const t = video.metadata.tags;
    if (typeof t === "string") return [t];
    if (Array.isArray(t)) {
      return t.filter((item): item is string => typeof item === "string");
    }
    return [];
  }, [video.metadata]);

  const configuredVideoFields = useMemo(() => {
    return libraryConfig?.fields.filter((f) => f.type === "video") ?? [];
  }, [libraryConfig]);

  const customFields = useMemo(() => {
    if (!video.metadata) return [];
    const configuredNames = configuredVideoFields.map((f) => f.name);
    return Object.entries(video.metadata).filter(
      ([key]) => !["tags", "rating", "artist", "notes", ...configuredNames].includes(key)
    );
  }, [video.metadata, configuredVideoFields]);

  const [isHovering, setIsHovering] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia("(hover: none)").matches);
  }, []);

  const mediaUrl = useMemo(() => {
    return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(
      video.mainVideoPath,
    )}`;
  }, [rootPath, video.mainVideoPath]);

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

  const { containerRef, poster } = useDynamicThumbnail({ mediaUrl, posterUrl, frameCount: 4, isHovering: isHovering && !isTouchDevice });
  const prefetchHandlers = usePrefetchOnHover(mediaUrl);

  const isMoodboard = viewMode === "moodboard";

  return (
    <li
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        isOpening
          ? "border-amber-400/50"
          : "border-white/[0.06] hover:-translate-y-1 hover:border-amber-400/50 hover:shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
      } bg-[#111316]/50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`}
      style={{
        animation: `rv-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both`,
        animationDelay: `${Math.min(cardIndex, 5) * 60}ms`,
      }}
      onMouseEnter={() => !isTouchDevice && setIsHovering(true)}
      onMouseLeave={() => !isTouchDevice && setIsHovering(false)}
    >
      <button
        type="button"
        onClick={() => onSelect(video)}
        disabled={disabled}
        aria-busy={isOpening}
        {...prefetchHandlers}
        className="flex h-full w-full flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-default"
      >
        <div ref={containerRef} className="relative w-full overflow-hidden bg-black/40 aspect-video">
          {poster ? (
            <img
              src={poster}
              alt=""
              className={`h-full w-full object-cover transition-all duration-300 ${
                isOpening ? "opacity-40" : "opacity-90 group-hover:opacity-100 group-hover:scale-105"
              }`}
            />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center bg-white/[0.04]">
              <ShimmerFill />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-white/25">
                indexing
              </span>
            </div>
          )}

          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-md bg-black/75 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber-300/90 backdrop-blur-sm">
            <Video className="h-3 w-3 text-amber-400" />
            {video.clips.length} clip{video.clips.length !== 1 ? "s" : ""}
          </span>

          {isOpening && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-[2px]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber-300">
                Opening…
              </span>
            </div>
          )}

          {isMoodboard && (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 flex flex-col gap-1.5">
              {showTitleInBoard && (
                <div>
                  <p className="truncate font-semibold text-white text-xs">{video.relativePath}</p>
                </div>
              )}

              {(artist || rating > 0 || tags.length > 0 || customFields.length > 0 || configuredVideoFields.some((f) => video.metadata?.[f.name])) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-1.5 mt-0.5">
                  {rating > 0 && (
                    <div className="flex items-center gap-0.5 text-amber-400 text-[0.65rem] drop-shadow-[0_0_2px_rgba(251,191,36,0.5)]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < rating ? "opacity-100" : "opacity-25"}>
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                  {artist && (
                    <span className="truncate text-[0.6rem] text-white/60 flex items-center gap-0.5">
                      <User className="h-2.5 w-2.5 text-white/40" />
                      {artist}
                    </span>
                  )}
                  {tags.slice(0, 1).map((tag, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 font-mono text-[0.55rem] leading-none ${getTagColorClass(tag)}`}
                    >
                      <Tag className="h-2 w-2 opacity-55" />
                      {tag}
                    </span>
                  ))}
                  {configuredVideoFields.slice(0, 1).map((field) => {
                    const val = video.metadata?.[field.name];
                    if (!val) return null;
                    const displayValue = Array.isArray(val) ? val.join(", ") : String(val);
                    return (
                      <span
                        key={field.name}
                        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 font-mono text-[0.55rem] leading-none ${getTagColorClass(field.name)}`}
                      >
                        <span className="font-semibold text-amber-300/80">{field.name}</span>
                        <span className="text-white/20">:</span>
                        <span className="max-w-[4rem] truncate">{displayValue}</span>
                      </span>
                    );
                  })}
                  {customFields.slice(0, 1).map(([key, value]) => {
                    const displayValue = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 font-mono text-[0.55rem] leading-none border border-white/[0.08] bg-white/[0.03] text-white/60"
                      >
                        <span className="font-semibold text-white/50">{key}</span>
                        <span className="text-white/20">:</span>
                        <span className="max-w-[4rem] truncate">{displayValue}</span>
                      </span>
                    );
                  })}
                  {(tags.length + customFields.length + configuredVideoFields.filter((f) => video.metadata?.[f.name]).length > 2) && (
                    <span className="text-[0.55rem] text-white/30">
                      +{tags.length + customFields.length + configuredVideoFields.filter((f) => video.metadata?.[f.name]).length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {!isMoodboard && (
          <div className="w-full p-4 border-t border-white/[0.02] flex flex-col gap-1">
            {showTitleInList && (
              <p className="truncate font-semibold text-white/95">{video.relativePath}</p>
            )}

            {/* Tags section */}
            {tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {tags.slice(0, 4).map((tag, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[0.6rem] leading-none ${getTagColorClass(tag)}`}
                  >
                    <Tag className="h-2.5 w-2.5 opacity-60" />
                    {tag}
                  </span>
                ))}
                {tags.length > 4 && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[0.6rem] leading-none text-white/40">
                    +{tags.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Structured Configured Fields section */}
            {configuredVideoFields.some((field) => video.metadata?.[field.name]) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {configuredVideoFields.map((field) => {
                  const val = video.metadata?.[field.name];
                  if (!val) return null;
                  const displayValue = Array.isArray(val) ? val.join(", ") : String(val);
                  return (
                    <span
                      key={field.name}
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[0.6rem] leading-none ${getTagColorClass(field.name)}`}
                    >
                      <span className="font-semibold text-amber-300/80">{field.name}</span>
                      <span className="text-white/20">·</span>
                      <span className="max-w-[8rem] truncate">{displayValue}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Custom Fields section */}
            {customFields.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {customFields.map(([key, value]) => {
                  const displayValue = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[0.6rem] leading-none text-white/60"
                    >
                      <span className="font-semibold text-white/50">{key}</span>
                      <span className="text-white/20">·</span>
                      <span className="max-w-[8rem] truncate">{displayValue}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Notes Section */}
            {notes && (
              <p className="mt-2 line-clamp-2 text-left text-[0.7rem] text-white/45 leading-relaxed bg-white/[0.02] p-2 rounded-lg border border-white/[0.03] italic flex items-start gap-1.5">
                <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white/30" />
                <span>{notes}</span>
              </p>
            )}

            {/* Artist & Rating inline footer */}
            {(artist || rating > 0) && (
              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.02] pt-2">
                {artist ? (
                  <span className="truncate text-[0.68rem] text-white/60 font-medium flex items-center gap-1">
                    <User className="h-3 w-3 text-white/40" />
                    by <span className="text-white/80">{artist}</span>
                  </span>
                ) : (
                  <span />
                )}
                {rating > 0 && (
                  <div className="flex items-center gap-0.5 text-amber-400 text-xs drop-shadow-[0_0_3px_rgba(251,191,36,0.35)]">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className={i < rating ? "opacity-100" : "opacity-20"}>
                        ★
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </button>
    </li>
  );
});


export function VideoList({
  rootPath,
  videos,
  onSelectVideo,
  isLoading,
  openingVideoPath,
  error,
  libraryConfig,
}: VideoListProps) {
  const [viewMode, setViewMode] = useState<"details" | "moodboard">("details");
  const isInitialScan = isLoading && videos.length === 0;

  const [showTitleInList, setShowTitleInList] = useState(
    () => localStorage.getItem(showTitleInListKey) !== "false"
  );
  const [showTitleInBoard, setShowTitleInBoard] = useState(
    () => localStorage.getItem(showTitleInBoardKey) !== "false"
  );

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === showTitleInListKey) {
        setShowTitleInList(e.newValue !== "false");
      }
      if (e.key === showTitleInBoardKey) {
        setShowTitleInBoard(e.newValue !== "false");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (

    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#111316]/50 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] px-4 py-4 sm:px-5 sm:py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(232,163,61,0.7)]" />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-amber-300/80">
              Library
            </p>
            <p className="mt-1 truncate font-mono text-sm text-white/50">{rootPath}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 mr-1 backdrop-blur-sm">
            <button
              onClick={() => setViewMode("details")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 font-mono text-[0.65rem] uppercase tracking-widest transition-all duration-200 active:scale-[0.97] ${
                viewMode === "details"
                  ? "bg-amber-400 font-semibold text-[#0A0B0D] shadow-[0_2px_8px_rgba(251,191,36,0.35)]"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <List className="h-3 w-3" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode("moodboard")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 sm:px-3 sm:py-1.5 font-mono text-[0.65rem] uppercase tracking-widest transition-all duration-200 active:scale-[0.97] ${
                viewMode === "moodboard"
                  ? "bg-amber-400 font-semibold text-[#0A0B0D] shadow-[0_2px_8px_rgba(251,191,36,0.35)]"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <LayoutGrid className="h-3 w-3" />
              <span>Board</span>
            </button>
          </div>
        </div>

      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">


        {isInitialScan ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </ul>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
            <Film className="h-8 w-8 text-white/20 mb-1" />
            <span className="font-mono text-[0.65rem] uppercase tracking-widest text-white/30">
              No entries
            </span>
            <p className="text-sm text-white/40">No videos were found in this library.</p>
          </div>
        ) : (
          <ul className={`grid gap-3 sm:gap-5 ${
            viewMode === "moodboard"
              ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
          }`}>

            {videos.map((video, index) => (
              <VideoThumbnailCard
                key={video.relativePath}
                rootPath={rootPath}
                video={video}
                viewMode={viewMode}
                cardIndex={index}
                isOpening={openingVideoPath === video.relativePath}
                disabled={openingVideoPath !== null}
                onSelect={onSelectVideo}
                libraryConfig={libraryConfig}
                showTitleInList={showTitleInList}
                showTitleInBoard={showTitleInBoard}
              />
            ))}
          </ul>

        )}
      </div>
    </div>
  );
}