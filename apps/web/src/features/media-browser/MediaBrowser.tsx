import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ScannedMediaItem } from "@reference-vault/shared";
import { scanMedia, deleteMedia, ApiError } from "../../lib/api";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const MEDIA_ROOT_KEY = "reference-vault.media-root";
const MEDIA_LOCATIONS_KEY = "reference-vault.media-locations";

// ─── Saved locations helpers ─────────────────────────────────────────────────
function loadSavedLocations(): string[] {
  try {
    const raw = localStorage.getItem(MEDIA_LOCATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

function saveLocations(locs: string[]): void {
  localStorage.setItem(MEDIA_LOCATIONS_KEY, JSON.stringify(locs));
}

function addLocation(locs: string[], newPath: string): string[] {
  if (locs.includes(newPath)) return locs;
  return [newPath, ...locs].slice(0, 8); // keep max 8
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildMediaUrl(rootPath: string, relativePath: string): string {
  return `/api/media?rootPath=${encodeURIComponent(rootPath)}&mediaPath=${encodeURIComponent(relativePath)}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

// ─── Skeleton loader card ─────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="tiktok-card-container">
      <style>{`
        @keyframes mb-shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes mb-fadein {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes mb-spin {
          to { transform: rotate(360deg); }
        }
        .mb-skeleton {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 25%,
            rgba(255,255,255,0.09) 50%,
            rgba(255,255,255,0.04) 75%
          );
          background-size: 800px 100%;
          animation: mb-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Card shell */}
      <div
        className="mb-skeleton tiktok-skeleton"
        style={{}}
      >
        {/* Faint scan line sweep */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 40%, rgba(240,192,96,0.03) 50%, transparent 60%)",
            animation: "mb-shimmer 2s ease-in-out infinite",
            backgroundSize: "100% 300%",
          }}
        />
        {/* Corner badge placeholder */}
        <div
          className="mb-skeleton"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 40,
            height: 18,
            borderRadius: 5,
          }}
        />
      </div>

      {/* Label under card */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid rgba(240,192,96,0.15)",
            borderTopColor: "#f0c060",
            animation: "mb-spin 0.7s linear infinite",
          }}
        />
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.2)",
            margin: 0,
          }}
        >
          Scanning…
        </p>
      </div>
    </div>
  );
}

// ─── Media card ───────────────────────────────────────────────────────────────
interface MediaCardProps {
  item: ScannedMediaItem;
  rootPath: string;
  exitDirection: "up" | "down" | null;
  onAnimationEnd: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  index: number;
  onNext: () => void;
  onPrev: () => void;
  onDelete: () => void;
}

function MediaCard({
  item,
  rootPath,
  exitDirection,
  onAnimationEnd,
  isMuted,
  onToggleMute,
  index,
  onNext,
  onPrev,
  onDelete,
}: MediaCardProps) {
  const url = buildMediaUrl(rootPath, item.relativePath);
  const isVideo = item.type === "video";
  const isGif = item.type === "gif";
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= 640 : false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 640);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!cardRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(cardRef.current);
    return () => resizeObserver.disconnect();
  }, [loaded]);

  const mediaStyle: React.CSSProperties = (isMobile && isLandscape)
    ? {
        position: "absolute",
        width: `${cardSize.height}px`,
        height: `${cardSize.width}px`,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(90deg)",
        objectFit: "contain",
      }
    : {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: isLandscape ? "contain" : "cover",
      };

  const exitStyle: React.CSSProperties =
    exitDirection === "up"
      ? {
          transform: "translateY(-120%)",
          opacity: 0,
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
        }
      : exitDirection === "down"
        ? {
            transform: "translateY(120%)",
            opacity: 0,
            transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
          }
        : {};

  return (
    <div
      className="tiktok-card-container"
      style={{
        ...exitStyle,
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && exitDirection !== null && e.propertyName === "transform") {
          onAnimationEnd();
        }
      }}
    >
      {/* Skeleton behind the real media until it loads */}
      {!loaded && !imgError && (
        <div
          style={{
            position: "absolute",
            inset: 16,
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)",
              backgroundSize: "800px 100%",
              animation: "mb-shimmer 1.4s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {imgError && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: 24,
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              margin: 0,
              maxWidth: 240,
            }}
          >
            Could not load: {item.relativePath.split("/").pop()}
          </p>
        </div>
      )}

      <div
        ref={cardRef}
        className="tiktok-card"
        style={{
          opacity: loaded ? 1 : 0,
          maxWidth: (!isMobile && isLandscape) ? "100%" : undefined,
          height: "calc(100% - 32px)",
          aspectRatio: (!isMobile && isLandscape && mediaAspectRatio) ? `${mediaAspectRatio}` : undefined,
        }}
      >
        {isVideo ? (
          <video
            key={url}
            src={url}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            onLoadedMetadata={(e) => {
              const video = e.currentTarget;
              if (video.videoWidth && video.videoHeight) {
                setIsLandscape(video.videoWidth > video.videoHeight);
                setMediaAspectRatio(video.videoWidth / video.videoHeight);
              }
            }}
            onLoadedData={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setImgError(true);
            }}
            style={mediaStyle}
          />
        ) : (
          <img
            key={url}
            src={url}
            alt={item.relativePath.split("/").pop() ?? "media"}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setIsLandscape(img.naturalWidth > img.naturalHeight);
                setMediaAspectRatio(img.naturalWidth / img.naturalHeight);
              }
              setLoaded(true);
            }}
            onError={() => {
              setLoaded(false);
              setImgError(true);
            }}
            style={mediaStyle}
            loading="eager"
            decoding="async"
          />
        )}

        {/* Bottom-left metadata overlay inside the vertical viewport */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: 24,
            right: 80,
            color: "#fff",
            zIndex: 20,
            textShadow: "0 2px 4px rgba(0,0,0,0.8)",
            textAlign: "left",
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              fontWeight: 600,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.relativePath.split("/").pop()}
          </p>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,255,255,0.6)",
              margin: "4px 0 0",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.relativePath}
          </p>
        </div>

        {/* Right side TikTok action overlay bar */}
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: "15%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            zIndex: 30,
          }}
        >
          {/* Index Counter Badge */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f0c060",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
            }}
            title="Index"
          >
            {index + 1}
          </div>

          {/* Mute/Unmute Toggle (videos only) */}
          {isVideo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 16,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                backdropFilter: "blur(8px)",
                transition: "transform 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          )}

          {/* Copy Path */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(item.relativePath);
              alert("Copied relative path to clipboard!");
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title="Copy path"
          >
            📋
          </button>

          {/* Delete Asset */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.25)",
              border: "1px solid rgba(239, 68, 68, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#f87171",
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              transition: "transform 0.15s, background-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.1)";
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
            }}
            title="Delete media asset"
          >
            🗑️
          </button>

          {/* Up (Previous) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title="Previous (ArrowUp)"
          >
            ▲
          </button>

          {/* Down (Next) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title="Next (ArrowDown)"
          >
            ▼
          </button>
        </div>

        {/* Type badges overlay (top-right of viewport) */}
        <div style={{ position: "absolute", top: 20, right: 20, display: "flex", gap: 6, zIndex: 30 }}>
          {isGif && (
            <span
              style={{
                background: "rgba(232,163,61,0.15)",
                border: "1px solid rgba(232,163,61,0.3)",
                color: "#f0c060",
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                padding: "2px 6px",
                borderRadius: 5,
                backdropFilter: "blur(8px)",
                textTransform: "uppercase",
              }}
            >
              GIF
            </span>
          )}
          {isVideo && (
            <span
              style={{
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.3)",
                color: "#c4b5fd",
                fontFamily: "monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                padding: "2px 6px",
                borderRadius: 5,
                backdropFilter: "blur(8px)",
                textTransform: "uppercase",
              }}
            >
              LOOP
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Hidden prefetch component ────────────────────────────────────────────────
function Prefetch({ rootPath, item }: { rootPath: string; item: ScannedMediaItem | undefined }) {
  if (!item) return null;
  const url = buildMediaUrl(rootPath, item.relativePath);
  if (item.type === "video") {
    return <link rel="preload" as="fetch" href={url} crossOrigin="anonymous" />;
  }
  return <link rel="preload" as="image" href={url} />;
}

// ─── Location manager panel ───────────────────────────────────────────────────
interface LocationManagerProps {
  savedLocations: string[];
  activeRoot: string;
  isLoading: boolean;
  onSelect: (path: string) => void;
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  onClose: () => void;
}

function LocationManager({
  savedLocations,
  activeRoot,
  isLoading,
  onSelect,
  onAdd,
  onRemove,
  onClose,
}: LocationManagerProps) {
  const [newPath, setNewPath] = useState("");

  function handleAdd() {
    const trimmed = newPath.trim();
    if (!trimmed || isLoading) return;
    onAdd(trimmed);
    setNewPath("");
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: "min(380px, 100vw - 32px)",
        background: "rgba(14,15,18,0.97)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: 20,
        zIndex: 50,
        boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        backdropFilter: "blur(24px)",
        animation: "mb-fadein 0.18s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#f0c060",
            margin: 0,
          }}
        >
          Media locations
        </p>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>

      {/* Saved locations list */}
      {savedLocations.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {savedLocations.map((loc) => (
            <div
              key={loc}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: loc === activeRoot ? "rgba(240,192,96,0.08)" : "rgba(255,255,255,0.03)",
                border: loc === activeRoot ? "1px solid rgba(240,192,96,0.25)" : "1px solid rgba(255,255,255,0.06)",
                cursor: loc === activeRoot ? "default" : "pointer",
                transition: "background 0.15s",
              }}
              onClick={() => {
                if (loc !== activeRoot && !isLoading) onSelect(loc);
              }}
            >
              <span style={{ fontSize: 12, flexShrink: 0 }}>
                {loc === activeRoot ? "📂" : "🗂️"}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: loc === activeRoot ? "#f0c060" : "rgba(255,255,255,0.55)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
                title={loc}
              >
                {loc}
              </span>
              {loc !== activeRoot && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(loc);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.2)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "2px 4px",
                    flexShrink: 0,
                  }}
                  title="Remove this location"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new location */}
      <div>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Add new location
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/path/to/media/folder"
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
              fontSize: 12,
              color: "#fff",
              outline: "none",
              opacity: isLoading ? 0.5 : 1,
              minWidth: 0,
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(232,163,61,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={!newPath.trim() || isLoading}
            style={{
              background: !newPath.trim() || isLoading ? "rgba(240,192,96,0.25)" : "#f0c060",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: 13,
              color: !newPath.trim() || isLoading ? "rgba(10,11,13,0.4)" : "#0A0B0D",
              cursor: !newPath.trim() || isLoading ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
          >
            {isLoading ? "…" : "Open"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root picker (shown when no media root is set) ────────────────────────────
interface RootPickerProps {
  onRoot: (path: string) => void;
  savedLocations: string[];
  isLoading: boolean;
}

function RootPicker({ onRoot, savedLocations, isLoading }: RootPickerProps) {
  const [value, setValue] = useState("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 24,
        padding: 32,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#f0c060",
            marginBottom: 12,
          }}
        >
          02 · Media folder
        </p>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#fff",
            margin: 0,
          }}
        >
          Set your media root
        </h2>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 10, lineHeight: 1.6 }}>
          Point to any folder containing images, GIFs, or short video loops.
          Sub-folders are walked recursively.
        </p>
      </div>

      {/* Previously used locations */}
      {savedLocations.length > 0 && (
        <div style={{ width: "100%", maxWidth: 480 }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,255,255,0.25)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Recent locations
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {savedLocations.map((loc) => (
              <button
                key={loc}
                onClick={() => !isLoading && onRoot(loc)}
                disabled={isLoading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  textAlign: "left",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = "rgba(240,192,96,0.06)";
                    e.currentTarget.style.borderColor = "rgba(240,192,96,0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                <span style={{ fontSize: 14 }}>🗂️</span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.6)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                  title={loc}
                >
                  {loc}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ width: "100%", maxWidth: 480 }}>
        {savedLocations.length > 0 && (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Or enter a new path
          </p>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="/run/media/you/drive/refs"
          autoComplete="off"
          spellCheck={false}
          disabled={isLoading}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: "12px 16px",
            fontFamily: "monospace",
            fontSize: 13,
            color: "#fff",
            outline: "none",
            opacity: isLoading ? 0.5 : 1,
          }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(232,163,61,0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && !isLoading && onRoot(value.trim())}
        />
        <button
          onClick={() => value.trim() && !isLoading && onRoot(value.trim())}
          disabled={!value.trim() || isLoading}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "12px",
            background: !value.trim() || isLoading ? "rgba(240,192,96,0.3)" : "#f0c060",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            color: !value.trim() || isLoading ? "rgba(10,11,13,0.5)" : "#0A0B0D",
            cursor: !value.trim() || isLoading ? "not-allowed" : "pointer",
            transition: "background 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {isLoading && (
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid rgba(10,11,13,0.2)",
                borderTopColor: "#0A0B0D",
                animation: "mb-spin 0.7s linear infinite",
                display: "inline-block",
              }}
            />
          )}
          {isLoading ? "Scanning…" : "Open folder"}
        </button>
      </div>
    </div>
  );
}

// ─── Main MediaBrowser ────────────────────────────────────────────────────────
interface MediaBrowserProps {
  onGoToSettings: () => void;
}

export function MediaBrowser({ onGoToSettings }: MediaBrowserProps) {
  const [mediaRoot, setMediaRoot] = useState(() => localStorage.getItem(MEDIA_ROOT_KEY) ?? "");
  const [savedLocations, setSavedLocations] = useState<string[]>(loadSavedLocations);
  const [items, setItems] = useState<ScannedMediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitDir, setExitDir] = useState<"up" | "down" | null>(null);
  const [pendingDir, setPendingDir] = useState<"up" | "down" | null>(null);
  const [showLocations, setShowLocations] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<"all" | "image" | "gif" | "video">("all");
  const [isMobileLayout, setIsMobileLayout] = useState(() => typeof window !== "undefined" ? window.innerWidth <= 640 : false);

  // drag state
  const dragRef = useRef<{ startY: number; lastY: number; dragging: boolean } | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleResize() { setIsMobileLayout(window.innerWidth <= 640); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Lock body scroll while mobile full-screen is active
  useEffect(() => {
    if (!isMobileLayout) return;
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [isMobileLayout]);

  const filteredItems = useMemo(() => {
    if (mediaTypeFilter === "all") return items;
    return items.filter((item) => item.type === mediaTypeFilter);
  }, [items, mediaTypeFilter]);

  // Reset index when filter changes
  useEffect(() => {
    setIndex(0);
    setExitDir(null);
    setPendingDir(null);
    setDragDelta(0);
  }, [mediaTypeFilter]);

  const loadMedia = useCallback(async (rootPath: string) => {
    setIsLoading(true);
    setError(null);
    setShowLocations(false);
    try {
      const result = await scanMedia(rootPath);
      setItems(shuffle(result.items));
      setIndex(0);
      localStorage.setItem(MEDIA_ROOT_KEY, rootPath);
      setMediaRoot(rootPath);
      // Save to locations list
      setSavedLocations((prev) => {
        const updated = addLocation(prev, rootPath);
        saveLocations(updated);
        return updated;
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load media folder.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-load on mount if saved root exists
  useEffect(() => {
    const saved = localStorage.getItem(MEDIA_ROOT_KEY);
    if (saved) loadMedia(saved);
  }, [loadMedia]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't interfere with text inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown" || e.key === "s") advance("up");
      if (e.key === "ArrowUp" || e.key === "w") advance("down");
      if (e.key === "Escape") setShowLocations(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Wheel scroll navigation (TikTok style)
  useEffect(() => {
    let lastWheelTime = 0;
    function onWheel(e: WheelEvent) {
      if (exitDir !== null || filteredItems.length === 0) return;
      const now = Date.now();
      if (now - lastWheelTime < 600) return;
      if (Math.abs(e.deltaY) > 20) {
        lastWheelTime = now;
        if (e.deltaY > 0) {
          advance("up");
        } else {
          advance("down");
        }
      }
    }
    const container = stageRef.current;
    if (container) {
      container.addEventListener("wheel", onWheel, { passive: true });
    }
    return () => {
      if (container) container.removeEventListener("wheel", onWheel);
    };
  }, [filteredItems, exitDir]);

  function advance(dir: "up" | "down") {
    if (exitDir !== null || filteredItems.length === 0) return;
    setPendingDir(dir);
    setExitDir(dir);
    setDragDelta(0);
  }

  function handleAnimationEnd() {
    setExitDir(null);
    if (pendingDir !== null) {
      setIndex((i) =>
        pendingDir === "up"
          ? (i + 1) % filteredItems.length
          : (i - 1 + filteredItems.length) % filteredItems.length,
      );
      setPendingDir(null);
    }
  }

  // drag state handlers
  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startY: e.clientY, lastY: e.clientY, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current?.dragging) return;
    dragRef.current.lastY = e.clientY;
    setDragDelta(e.clientY - dragRef.current.startY);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = dragRef.current.lastY - dragRef.current.startY;
    dragRef.current = null;
    setDragDelta(0);
    if (Math.abs(dy) > 72) advance(dy > 0 ? "down" : "up");
  }

  function onPointerCancel() {
    dragRef.current = null;
    setDragDelta(0);
  }

  function handleRemoveLocation(path: string) {
    setSavedLocations((prev) => {
      const updated = prev.filter((l) => l !== path);
      saveLocations(updated);
      return updated;
    });
  }

  function handleClearRoot() {
    setMediaRoot("");
    setItems([]);
    setError(null);
    localStorage.removeItem(MEDIA_ROOT_KEY);
    setShowLocations(false);
  }

  const handleDeleteMedia = useCallback(async (itemToDelete: ScannedMediaItem) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${itemToDelete.relativePath.split("/").pop()}"?`
    );
    if (!confirmDelete) return;

    try {
      await deleteMedia({
        rootPath: mediaRoot,
        mediaRelativePath: itemToDelete.relativePath,
      });

      // Remove from items list
      setItems((prev) => {
        const updated = prev.filter((item) => item.relativePath !== itemToDelete.relativePath);
        setIndex((currIndex) => {
          const nextFiltered = updated.filter((item) => mediaTypeFilter === "all" || item.type === mediaTypeFilter);
          if (nextFiltered.length === 0) return 0;
          return currIndex >= nextFiltered.length ? nextFiltered.length - 1 : currIndex;
        });
        return updated;
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete media asset.");
    }
  }, [mediaRoot, mediaTypeFilter]);

  const currentItem = filteredItems[index];
  const nextItem = filteredItems.length > 0 ? filteredItems[(index + 1) % filteredItems.length] : undefined;
  const hasSavedRoot = !!mediaRoot && !error;

  // Decide what the stage shows
  const showSkeleton = isLoading;
  const showPicker = !isLoading && !hasSavedRoot && !error;
  const showEmptyFolder = !isLoading && hasSavedRoot && items.length === 0 && !error;
  const showEmptyFilter = !isLoading && !error && hasSavedRoot && items.length > 0 && filteredItems.length === 0;
  const showCard = !isLoading && !error && !!currentItem;

  const filterLabels: Record<string, string> = { all: "All", image: "Images", gif: "GIFs", video: "Videos" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        position: isMobileLayout ? "fixed" : "relative",
        inset: isMobileLayout ? 0 : undefined,
        zIndex: isMobileLayout ? 40 : undefined,
        background: isMobileLayout ? "#000" : undefined,
        userSelect: "none",
      }}
    >
      {/* Global keyframes (injected once) */}
      <style>{`
        @keyframes mb-shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
        @keyframes mb-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes mb-fadein {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes mb-drawer-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        .tiktok-card-container {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .tiktok-card {
          width: 100%;
          max-width: 420px;
          height: calc(100% - 32px);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 24px;
          background: #000;
          box-shadow: 0 24px 60px rgba(0,0,0,0.8);
          border: 1px solid rgba(255,255,255,0.08);
          overflow: hidden;
          transition: opacity 0.25s ease;
        }
        .tiktok-skeleton {
          width: 100%;
          max-width: 420px;
          height: calc(100% - 32px);
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        @media (max-width: 640px) {
          .tiktok-card-container {
            padding: 0px !important;
          }
          .tiktok-card {
            max-width: 100% !important;
            height: 100% !important;
            border-radius: 0px !important;
            border: none !important;
            box-shadow: none !important;
          }
          .tiktok-skeleton {
            max-width: 100% !important;
            height: 100% !important;
            border-radius: 0px !important;
            border: none !important;
          }
        }
      `}</style>

      {/* ── Desktop header (hidden on mobile) ─────────────────────────────── */}
      {!isMobileLayout && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0 16px 0",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            position: "relative",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  letterSpacing: "0.25em",
                  textTransform: "uppercase",
                  color: "#f0c060",
                  margin: 0,
                }}
              >
                Media Browser
              </p>
              {filteredItems.length > 0 && !isLoading && (
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, margin: "2px 0 0" }}>
                  {index + 1} / {filteredItems.length}
                </p>
              )}
              {isLoading && (
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, margin: "2px 0 0", fontFamily: "monospace" }}>
                  scanning…
                </p>
              )}
            </div>
          </div>

          {/* Middle: Filter Tabs */}
          {hasSavedRoot && items.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.05)",
                borderRadius: 12,
                padding: 3,
              }}
            >
              {(["all", "image", "gif", "video"] as const).map((type) => {
                const isActive = mediaTypeFilter === type;
                return (
                  <button
                    key={type}
                    onClick={() => setMediaTypeFilter(type)}
                    style={{
                      background: isActive ? "rgba(240, 192, 96, 0.15)" : "transparent",
                      border: isActive ? "1px solid rgba(240, 192, 96, 0.3)" : "1px solid transparent",
                      borderRadius: 9,
                      color: isActive ? "#f0c060" : "rgba(255, 255, 255, 0.5)",
                      padding: "4px 12px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: "sans-serif",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    {filterLabels[type]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right side: folder pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {mediaRoot && !isLoading && (
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.35)",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  maxWidth: 240,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={mediaRoot}
              >
                📁 {mediaRoot.split("/").pop() || mediaRoot}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile transparent overlay controls ────────────────────────────── */}
      {isMobileLayout && hasSavedRoot && !error && !isLoading && (
        <>
          {/* Top-left: title + counter */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 60,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              pointerEvents: "none",
            }}
          >
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 9,
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: "rgba(240,192,96,0.9)",
                margin: 0,
                textShadow: "0 1px 6px rgba(0,0,0,0.8)",
              }}
            >
              Media
            </p>
            {filteredItems.length > 0 && (
              <p
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.5)",
                  margin: 0,
                  textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                }}
              >
                {index + 1} / {filteredItems.length}
              </p>
            )}
          </div>

          {/* Top-right: folder button */}
          {mediaRoot && (
            <button
              onClick={() => setShowLocations((v) => !v)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 60,
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 12,
                color: "rgba(255,255,255,0.8)",
                fontSize: 11,
                fontFamily: "monospace",
                padding: "6px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                letterSpacing: "0.05em",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}
            >
              <span style={{ fontSize: 13 }}>📁</span>
              <span style={{ maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {mediaRoot.split("/").pop() || mediaRoot}
              </span>
            </button>
          )}

          {/* Bottom overlay: filter tabs */}
          {items.length > 0 && (
            <div
              style={{
                position: "absolute",
                bottom: 28,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 60,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 50,
                padding: "5px 6px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            >
              {(["all", "image", "gif", "video"] as const).map((type) => {
                const isActive = mediaTypeFilter === type;
                return (
                  <button
                    key={type}
                    onClick={() => setMediaTypeFilter(type)}
                    style={{
                      background: isActive ? "rgba(240,192,96,0.9)" : "transparent",
                      border: "none",
                      borderRadius: 50,
                      color: isActive ? "#0A0B0D" : "rgba(255,255,255,0.55)",
                      padding: "5px 14px",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 400,
                      fontFamily: "sans-serif",
                      transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filterLabels[type]}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Mobile: loading indicator overlay ─────────────────────────────── */}
      {isMobileLayout && isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "2.5px solid rgba(240,192,96,0.2)",
              borderTopColor: "#f0c060",
              animation: "mb-spin 0.7s linear infinite",
            }}
          />
          <p style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: 0 }}>scanning…</p>
        </div>
      )}

      {/* ── Mobile: LocationManager as bottom-sheet drawer ─────────────────── */}
      {isMobileLayout && showLocations && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowLocations(false)}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 70,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 80,
              background: "rgba(12,13,16,0.97)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "20px 20px 0 0",
              padding: "8px 0 0",
              animation: "mb-drawer-up 0.28s cubic-bezier(0.22,1,0.36,1) both",
              boxShadow: "0 -24px 80px rgba(0,0,0,0.8)",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <div style={{ padding: "0 20px 32px" }}>
              <LocationManager
                savedLocations={savedLocations}
                activeRoot={mediaRoot}
                isLoading={isLoading}
                onSelect={(path) => { loadMedia(path); setShowLocations(false); }}
                onAdd={(path) => loadMedia(path)}
                onRemove={handleRemoveLocation}
                onClose={() => setShowLocations(false)}
              />
            </div>
          </div>
        </>
      )}

      {/* Stage */}
      <div ref={stageRef} style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showSkeleton && <SkeletonCard />}

        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 32,
              textAlign: "center",
              animation: "mb-fadein 0.3s ease",
            }}
          >
            <p style={{ color: "#fca5a5", fontSize: 14, margin: 0 }}>{error}</p>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, margin: 0, fontFamily: "monospace" }}>
              {mediaRoot}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                onClick={onGoToSettings}
                style={{
                  background: "rgba(240,192,96,0.1)",
                  border: "1px solid rgba(240,192,96,0.2)",
                  borderRadius: 8,
                  color: "#f0c060",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Go to Settings
              </button>
            </div>
          </div>
        )}

        {showPicker && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-4" style={{ animation: "mb-fadein 0.3s ease" }}>
            <span className="text-4xl">📁</span>
            <h3 className="text-xl font-semibold text-white">Media folder not configured</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              Set up your media folder path in Settings to start browsing independent loops, GIFs, and reference images.
            </p>
            <button
              onClick={onGoToSettings}
              className="mt-2 rounded-lg bg-amber-400 px-5 py-2.5 text-xs font-semibold text-[#0A0B0D] hover:bg-amber-300 transition active:scale-[0.98]"
            >
              Go to Settings
            </button>
          </div>
        )}

        {showEmptyFolder && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-4" style={{ animation: "mb-fadein 0.3s ease" }}>
            <span className="text-4xl">📂</span>
            <h3 className="text-xl font-semibold text-white">Media library is empty</h3>
            <p className="text-sm text-white/50 leading-relaxed">
              We couldn't find any supported media files (.jpg, .png, .gif, .mp4, etc.) in your media folder:
            </p>
            <code className="px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-xs text-amber-300 font-mono break-all max-w-full">
              {mediaRoot}
            </code>
            <p className="text-xs text-white/40">
              Add some images, GIFs, or videos to this folder, then click refresh or re-scan.
            </p>
            <button
              onClick={() => loadMedia(mediaRoot)}
              className="mt-2 rounded-lg bg-amber-400 px-5 py-2.5 text-xs font-semibold text-[#0A0B0D] hover:bg-amber-300 transition active:scale-[0.98]"
            >
              Scan Folder Again
            </button>
          </div>
        )}

        {showEmptyFilter && (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto gap-3" style={{ animation: "mb-fadein 0.3s ease" }}>
            <span className="text-3xl">🔍</span>
            <h3 className="text-lg font-semibold text-white">No {mediaTypeFilter === "image" ? "images" : mediaTypeFilter === "gif" ? "GIFs" : "videos"} found</h3>
            <p className="text-xs text-white/40 leading-relaxed">
              We couldn't find any {mediaTypeFilter === "image" ? "image files (.jpg, .png, etc.)" : mediaTypeFilter === "gif" ? "animated GIFs (.gif)" : "video files (.mp4, etc.)"} in this folder.
            </p>
            <button
              onClick={() => setMediaTypeFilter("all")}
              className="mt-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12] text-white/80 px-4 py-2 text-xs font-semibold transition active:scale-[0.98]"
            >
              Show All Media
            </button>
          </div>
        )}

        {showCard && (
          <>
            {/* Prefetch next item silently */}
            <Prefetch rootPath={mediaRoot} item={nextItem} />

            {/* Swipe hint */}
            {dragDelta !== 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  padding: 32,
                }}
              >
                <div
                  style={{
                    padding: "10px 20px",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 20,
                    background:
                      dragDelta > 72
                        ? "rgba(248,113,113,0.2)"
                        : dragDelta < -72
                          ? "rgba(74,222,128,0.2)"
                          : "rgba(255,255,255,0.06)",
                    border:
                      dragDelta > 72
                        ? "2px solid rgba(248,113,113,0.5)"
                        : dragDelta < -72
                          ? "2px solid rgba(74,222,128,0.5)"
                          : "2px solid rgba(255,255,255,0.08)",
                    color:
                      dragDelta > 72 ? "#f87171" : dragDelta < -72 ? "#4ade80" : "rgba(255,255,255,0.3)",
                    backdropFilter: "blur(8px)",
                    transition: "all 0.08s",
                  }}
                >
                  {dragDelta > 0 ? "↓" : "↑"}
                </div>
              </div>
            )}

            {/* Draggable card stage */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                cursor: exitDir ? "default" : "grab",
                transform: dragDelta
                  ? `translateY(${dragDelta * 0.18}px)`
                  : undefined,
                transition: dragDelta ? "none" : "transform 0.12s ease-out",
                animation: "mb-fadein 0.3s ease",
                touchAction: "none",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <MediaCard
                key={`${index}-${currentItem.relativePath}`}
                item={currentItem}
                rootPath={mediaRoot}
                exitDirection={exitDir}
                onAnimationEnd={handleAnimationEnd}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted((m) => !m)}
                index={index}
                onNext={() => advance("up")}
                onPrev={() => advance("down")}
                onDelete={() => handleDeleteMedia(currentItem)}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom controls tip — desktop only */}
      {!isMobileLayout && !isLoading && !error && filteredItems.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "8px 0",
            animation: "mb-fadein 0.4s ease",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Drag vertical or use wheel / Up & Down keys to browse
          </p>
        </div>
      )}
    </div>
  );
}
