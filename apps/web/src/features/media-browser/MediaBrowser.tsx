import { useState, useEffect, useRef, useCallback } from "react";
import type { ScannedMediaItem } from "@reference-vault/shared";
import { scanMedia, ApiError } from "../../lib/api";

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
}: MediaCardProps) {
  const url = buildMediaUrl(rootPath, item.relativePath);
  const isVideo = item.type === "video";
  const isGif = item.type === "gif";
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

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
      onTransitionEnd={exitDirection !== null ? onAnimationEnd : undefined}
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
        className="tiktok-card"
        style={{
          opacity: loaded ? 1 : 0,
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
            onLoadedData={() => setLoaded(true)}
            onError={() => { setLoaded(false); setImgError(true); }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <img
            key={url}
            src={url}
            alt={item.relativePath.split("/").pop() ?? "media"}
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(false); setImgError(true); }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
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
  onBack: () => void;
}

export function MediaBrowser({ onBack }: MediaBrowserProps) {
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

  // drag state
  const dragRef = useRef<{ startY: number; dragging: boolean } | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

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
      if (exitDir !== null || items.length === 0) return;
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
  }, [items, exitDir]);

  function advance(dir: "up" | "down") {
    if (exitDir !== null || items.length === 0) return;
    setPendingDir(dir);
    setExitDir(dir);
    setDragDelta(0);
  }

  function handleAnimationEnd() {
    setExitDir(null);
    if (pendingDir !== null) {
      setIndex((i) =>
        pendingDir === "up" ? (i + 1) % items.length : (i - 1 + items.length) % items.length,
      );
      setPendingDir(null);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { startY: e.clientY, dragging: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current?.dragging) return;
    setDragDelta(e.clientY - dragRef.current.startY);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    dragRef.current = null;
    setDragDelta(0);
    if (Math.abs(dy) > 72) advance(dy > 0 ? "down" : "up");
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

  const currentItem = items[index];
  const nextItem = items[(index + 1) % items.length];
  const hasSavedRoot = !!mediaRoot && !error;

  // Decide what the stage shows
  const showSkeleton = isLoading;
  const showPicker = !isLoading && (!hasSavedRoot || items.length === 0) && !error;
  const showCard = !isLoading && !error && !!currentItem;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
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
        .tiktok-card-container {
          position: absolute;
          inset: 0;
          display: flex;
          alignItems: center;
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

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 0 16px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "rgba(255,255,255,0.6)",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              padding: "6px 12px",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            ← Back
          </button>
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
            {items.length > 0 && !isLoading && (
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, margin: "2px 0 0" }}>
                {index + 1} / {items.length}
              </p>
            )}
            {isLoading && (
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, margin: "2px 0 0", fontFamily: "monospace" }}>
                scanning…
              </p>
            )}
          </div>
        </div>

        {/* Right side: folder pill + locations button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {mediaRoot && !isLoading && (
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                color: "rgba(255,255,255,0.25)",
                maxWidth: 180,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "none", // hide on mobile, show via media query below
              }}
              className="mb-root-label"
              title={mediaRoot}
            >
              {mediaRoot.split("/").pop() || mediaRoot}
            </span>
          )}
          <button
            onClick={() => setShowLocations((v) => !v)}
            style={{
              background: showLocations ? "rgba(240,192,96,0.12)" : "rgba(255,255,255,0.04)",
              border: showLocations ? "1px solid rgba(240,192,96,0.3)" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: showLocations ? "#f0c060" : "rgba(255,255,255,0.5)",
              fontFamily: "monospace",
              fontSize: 11,
              letterSpacing: "0.08em",
              padding: "6px 12px",
              cursor: "pointer",
              textTransform: "uppercase",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13 }}>📁</span>
            Locations
            {savedLocations.length > 0 && (
              <span
                style={{
                  background: "rgba(240,192,96,0.2)",
                  color: "#f0c060",
                  borderRadius: 10,
                  padding: "1px 6px",
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {savedLocations.length}
              </span>
            )}
          </button>
        </div>

        {/* Location manager dropdown */}
        {showLocations && (
          <LocationManager
            savedLocations={savedLocations}
            activeRoot={mediaRoot}
            isLoading={isLoading}
            onSelect={loadMedia}
            onAdd={loadMedia}
            onRemove={handleRemoveLocation}
            onClose={() => setShowLocations(false)}
          />
        )}
      </div>

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
                onClick={handleClearRoot}
                style={{
                  background: "rgba(252,165,165,0.1)",
                  border: "1px solid rgba(252,165,165,0.2)",
                  borderRadius: 8,
                  color: "#fca5a5",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Try another folder
              </button>
              <button
                onClick={() => setShowLocations(true)}
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
                Manage locations
              </button>
            </div>
          </div>
        )}

        {showPicker && (
          <div style={{ position: "absolute", inset: 0, animation: "mb-fadein 0.3s ease" }}>
            <RootPicker
              onRoot={loadMedia}
              savedLocations={savedLocations}
              isLoading={isLoading}
            />
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
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
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
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom controls tip */}
      {!isLoading && !error && items.length > 0 && (
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
