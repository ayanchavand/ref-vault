import { useEffect, useRef, useState } from "react";

/**
 * Caps how many hidden <video> elements can be decoding a frame at once.
 * Without this, a grid of 20+ cards would all start downloading video
 * just to render a thumbnail, competing for bandwidth and CPU.
 */
const MAX_CONCURRENT_THUMBNAILS = 8;

/** If a held slot isn't released within this window, force-release it. */
const SLOT_TIMEOUT_MS = 8000;

let activeCount = 0;
const waiters: Array<() => void> = [];

/**
 * Helper to open and retrieve list of frames from the client-side Cache Storage.
 */
async function getFromClientCache(key: string): Promise<string[] | null> {
  try {
    const cache = await caches.open("thumbnail-extraction-cache");
    const response = await cache.match(key);
    if (response) {
      const data = await response.json();
      return data.frames || null;
    }
  } catch {
    // Ignore cache errors (e.g. private browsing mode)
  }
  return null;
}

/**
 * Helper to save extracted frames to the client-side Cache Storage.
 */
async function saveToClientCache(key: string, frames: string[]): Promise<void> {
  try {
    const cache = await caches.open("thumbnail-extraction-cache");
    const response = new Response(JSON.stringify({ frames }), {
      headers: { "Content-Type": "application/json" },
    });
    await cache.put(key, response);
  } catch {
    // Ignore cache errors
  }
}

/**
 * Acquires a decoding slot with a customizable concurrency limit.
 * Returns a release function that:
 *  - is idempotent (safe to call more than once, or never)
 *  - auto-fires after SLOT_TIMEOUT_MS so a stuck decode/seek/network
 *    stall can never hold a slot forever.
 */
function acquireSlotWithLimit(
  limit: number,
  timeoutMs: number = SLOT_TIMEOUT_MS,
): Promise<() => void> {
  const promise =
    activeCount < limit
      ? ((activeCount += 1), Promise.resolve())
      : new Promise<void>((resolve) => {
          waiters.push(() => {
            activeCount += 1;
            resolve();
          });
        });

  return promise.then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      activeCount = Math.max(0, activeCount - 1);
      const next = waiters.shift();
      if (next) {
        next();
      }
    };
    const timer = setTimeout(release, timeoutMs);
    return release;
  });
}

interface UseLazyThumbnailOptions {
  mediaUrl: string;
  posterUrl?: string;
  /** How far outside the viewport to start decoding, e.g. "200px" */
  rootMargin?: string;
}

/**
 * Only starts client-side thumbnail generation once the element is
 * scrolled near the viewport, and queues behind a global concurrency
 * cap so at most a few decode at once.
 */
export function useLazyThumbnail({
  mediaUrl,
  posterUrl,
  rootMargin = "200px",
}: UseLazyThumbnailOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [poster, setPoster] = useState<string | undefined>(undefined);
  const [isCached, setIsCached] = useState(false);

  // Set initial poster if posterUrl is provided
  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
    }
  }, [posterUrl]);

  // Watch for the card entering (or nearing) the viewport, then stop watching.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || posterUrl) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [posterUrl, rootMargin]);

  // Try loading from client-side Cache Storage
  useEffect(() => {
    if (posterUrl || !isVisible || isCached) {
      return;
    }

    let active = true;
    getFromClientCache(mediaUrl).then((cachedFrames) => {
      if (active && cachedFrames && cachedFrames.length > 0) {
        setPoster(cachedFrames[0]);
        setIsCached(true);
      }
    });

    return () => {
      active = false;
    };
  }, [isVisible, mediaUrl, posterUrl, isCached]);

  // Client-side extraction fallback
  useEffect(() => {
    if (posterUrl) {
      return;
    }

    if (!isVisible || isCached) {
      return;
    }

    let cancelled = false;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    acquireSlotWithLimit(MAX_CONCURRENT_THUMBNAILS).then((release) => {
      if (cancelled) {
        release();
        return;
      }

      videoElement.src = mediaUrl;
      videoElement.muted = true;
      videoElement.preload = "metadata";
      videoElement.crossOrigin = "anonymous";

      const onLoadedData = () => {
        if (cancelled) {
          return;
        }

        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          release();
          return;
        }

        try {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
          setPoster(dataUrl);
          setIsCached(true);
          saveToClientCache(mediaUrl, [dataUrl]);
        } catch (e) {
          // Cross-origin video without proper CORS headers taints the canvas
          if (!cancelled) {
            setPoster(undefined);
          }
        } finally {
          release();
        }
      };

      const onError = () => {
        if (!cancelled) {
          setPoster(undefined);
        }
        release();
      };

      videoElement.addEventListener("loadeddata", onLoadedData);
      videoElement.addEventListener("error", onError);
    });

    return () => {
      cancelled = true;
      videoElement.src = "";
    };
  }, [mediaUrl, posterUrl, isVisible, isCached]);

  return { containerRef, poster };
}

interface UseDynamicThumbnailOptions extends UseLazyThumbnailOptions {
  frameCount?: number;
  isHovering?: boolean;
}

/**
 * Hook that extracts and cycles through multiple frames from a video when hovering,
 * changing the displayed frame every 2-3 seconds for a dynamic effect.
 *
 * Optimized for mobile: skips dynamic cycling and limits concurrent extraction.
 * Optimized for desktop: only extracts additional frames when the user actually hovers.
 */
export function useDynamicThumbnail({
  mediaUrl,
  posterUrl,
  rootMargin = "200px",
  frameCount = 4,
  isHovering = false,
}: UseDynamicThumbnailOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [poster, setPoster] = useState<string | undefined>(undefined);
  const [frames, setFrames] = useState<string[]>([]);
  const currentFrameIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstFrameRef = useRef<string | undefined>(undefined);
  const [isMobile, setIsMobile] = useState(false);
  const [shouldExtract, setShouldExtract] = useState(false);

  // Check if this is a touch device (no hover capability)
  useEffect(() => {
    setIsMobile(window.matchMedia("(hover: none)").matches);
  }, []);

  // Watch for the card entering (or nearing) the viewport
  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    // If we have a server-side posterUrl and we are on mobile, we will never hover
    // and never cycle. We can return the poster immediately and avoid observer setup.
    if (posterUrl && isMobile) {
      setPoster(posterUrl);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [posterUrl, rootMargin, isMobile]);

  // Set the default poster instantly if provided
  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
    }
  }, [posterUrl]);

  // Load from client-side Cache Storage if available
  useEffect(() => {
    if (!isVisible || frames.length > 0) {
      return;
    }

    let active = true;
    getFromClientCache(mediaUrl).then((cachedFrames) => {
      if (active && cachedFrames && cachedFrames.length > 0) {
        setFrames(cachedFrames);
        const randomIndex =
          cachedFrames.length > 1
            ? 1 + Math.floor(Math.random() * (cachedFrames.length - 1))
            : 0;
        firstFrameRef.current = cachedFrames[randomIndex];
        setPoster(cachedFrames[randomIndex]);
        currentFrameIndexRef.current = randomIndex;
      }
    });

    return () => {
      active = false;
    };
  }, [isVisible, mediaUrl, frames.length]);

  // Determine when to extract frames client-side
  useEffect(() => {
    if (!isVisible || frames.length > 0) {
      return;
    }

    // Trigger extraction if:
    // 1. There is no posterUrl (needs static poster immediately).
    // 2. Or, user is hovering (desktop only) and we need the frames to cycle.
    if (!posterUrl || (isHovering && !isMobile)) {
      setShouldExtract(true);
    }
  }, [isVisible, posterUrl, isHovering, isMobile, frames.length]);

  // Client-side extraction effect
  useEffect(() => {
    if (!shouldExtract || frames.length > 0) {
      return;
    }

    let cancelled = false;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    // Reduce concurrent decodes on mobile to prevent blocking UI thread
    const maxConcurrency = isMobile ? 3 : MAX_CONCURRENT_THUMBNAILS;

    acquireSlotWithLimit(maxConcurrency).then((release) => {
      if (cancelled) {
        release();
        return;
      }

      videoElement.src = mediaUrl;
      videoElement.muted = true;
      videoElement.preload = "metadata";
      videoElement.crossOrigin = "anonymous";

      const onLoadedMetadata = () => {
        if (cancelled) {
          return;
        }

        const duration = videoElement.duration;
        if (!duration || duration === Infinity) {
          release();
          return;
        }

        // On mobile fallback, only extract 1 frame to save resources
        const actualFrameCount = isMobile ? 1 : frameCount;

        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          release();
          return;
        }

        const extractedFrames: string[] = [];
        let framesExtracted = 0;

        const captureCurrentFrame = (): string => {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.85);
        };

        const finish = () => {
          if (!cancelled && extractedFrames.length > 0) {
            const randomIndex =
              extractedFrames.length > 1
                ? 1 + Math.floor(Math.random() * (extractedFrames.length - 1))
                : 0;
            
            setFrames(extractedFrames);
            firstFrameRef.current = extractedFrames[randomIndex];
            setPoster(extractedFrames[randomIndex]);
            currentFrameIndexRef.current = randomIndex;

            // Cache generated frames
            saveToClientCache(mediaUrl, extractedFrames);
          }
          release();
          videoElement.removeEventListener("seeked", onSeeked);
        };

        const advance = () => {
          framesExtracted += 1;
          if (framesExtracted < actualFrameCount) {
            videoElement.currentTime = (duration / actualFrameCount) * framesExtracted;
          } else {
            finish();
          }
        };

        const onSeeked = () => {
          if (cancelled) return;
          try {
            extractedFrames.push(captureCurrentFrame());
            advance();
          } catch (e) {
            release();
            videoElement.removeEventListener("seeked", onSeeked);
          }
        };

        videoElement.addEventListener("seeked", onSeeked);
        videoElement.addEventListener("error", () => {
          if (!cancelled) {
            setPoster(posterUrl);
          }
          release();
          videoElement.removeEventListener("seeked", onSeeked);
        });

        try {
          extractedFrames.push(captureCurrentFrame());
          advance();
        } catch (e) {
          release();
        }
      };

      videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
    });

    return () => {
      cancelled = true;
      videoElement.src = "";
    };
  }, [mediaUrl, shouldExtract, frameCount, isMobile, posterUrl, frames.length]);

  // Start/stop cycling based on hover state
  useEffect(() => {
    if (!isHovering || frames.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (firstFrameRef.current) {
        setPoster(firstFrameRef.current);
      } else if (posterUrl) {
        setPoster(posterUrl);
      }
      return;
    }

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      currentFrameIndexRef.current = (currentFrameIndexRef.current + 1) % frames.length;
      setPoster(frames[currentFrameIndexRef.current]);
    }, 2500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isHovering, frames, posterUrl]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { containerRef, poster };
}

// Avoid warming the same URL twice in one session.
const prefetchedUrls = new Set<string>();

/**
 * Warms the browser's connection/cache for a media URL on hover or focus,
 * so playback starts faster if the user actually clicks. Uses
 * preload="metadata" rather than a full fetch, so it stays cheap.
 */
export function usePrefetchOnHover(mediaUrl: string) {
  function prefetch() {
    if (prefetchedUrls.has(mediaUrl)) {
      return;
    }
    prefetchedUrls.add(mediaUrl);

    acquireSlotWithLimit(MAX_CONCURRENT_THUMBNAILS).then((release) => {
      const warmupVideo = document.createElement("video");
      warmupVideo.preload = "metadata";
      warmupVideo.muted = true;

      const cleanup = () => release();
      warmupVideo.addEventListener("loadedmetadata", cleanup, { once: true });
      warmupVideo.addEventListener("error", cleanup, { once: true });

      warmupVideo.src = mediaUrl;
    });
  }

  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
  };
}