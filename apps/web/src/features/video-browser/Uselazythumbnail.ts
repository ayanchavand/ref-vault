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

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_THUMBNAILS) {
    activeCount += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    waiters.push(() => {
      activeCount += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeCount = Math.max(0, activeCount - 1);
  const next = waiters.shift();
  if (next) {
    next();
  }
}

/**
 * Same as acquireSlot(), but returns a release function that:
 *  - is idempotent (safe to call more than once, or never)
 *  - auto-fires after SLOT_TIMEOUT_MS so a stuck decode/seek/network
 *    stall can never hold a slot forever.
 */
function acquireSlotWithTimeout(
  timeoutMs: number = SLOT_TIMEOUT_MS,
): Promise<() => void> {
  return acquireSlot().then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      releaseSlot();
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

  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
      return;
    }

    if (!isVisible) {
      return;
    }

    let cancelled = false;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    acquireSlotWithTimeout().then((release) => {
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
          setPoster(canvas.toDataURL("image/jpeg", 0.75));
        } catch (e) {
          // Cross-origin video without proper CORS headers taints the
          // canvas; drawImage/toDataURL throw. Fall back to no poster
          // instead of leaking the slot.
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
  }, [mediaUrl, posterUrl, isVisible]);

  return { containerRef, poster };
}

interface UseDynamicThumbnailOptions extends UseLazyThumbnailOptions {
  frameCount?: number;
  isHovering?: boolean;
}

/**
 * Hook that extracts and cycles through multiple frames from a video when hovering,
 * changing the displayed frame every 2-3 seconds for a dynamic effect.
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
  const frameUrlsRef = useRef<string[]>([]);
  const currentFrameIndexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstFrameRef = useRef<string | undefined>(undefined);

  // Watch for the card entering (or nearing) the viewport
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

  // Extract frames on first load
  useEffect(() => {
    if (posterUrl) {
      setPoster(posterUrl);
      return;
    }

    if (!isVisible || frameUrlsRef.current.length > 0) {
      return;
    }

    let cancelled = false;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    acquireSlotWithTimeout().then((release) => {
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

        // Get video duration to sample frames evenly
        const duration = videoElement.duration;
        if (!duration || duration === Infinity) {
          release();
          return;
        }

        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          release();
          return;
        }

        const frames: string[] = [];
        let framesExtracted = 0;

        const captureCurrentFrame = (): string => {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.85);
        };

        const finish = () => {
          if (!cancelled && frames.length > 0) {
            // Never default to frames[0]: it's captured at/near
            // timestamp 0 and is frequently a black frame, fade-in, or
            // title card, so it makes a poor representative thumbnail.
            // Pick randomly from the remaining frames when there are
            // any; only fall back to frames[0] if it's all we have.
            const randomIndex =
              frames.length > 1
                ? 1 + Math.floor(Math.random() * (frames.length - 1))
                : 0;
            frameUrlsRef.current = frames;
            firstFrameRef.current = frames[randomIndex];
            setPoster(frames[randomIndex]);
            currentFrameIndexRef.current = randomIndex;
          }
          release();
          videoElement.removeEventListener("seeked", onSeeked);
        };

        // After capturing a frame, either seek for the next one or finish.
        const advance = () => {
          framesExtracted += 1;
          if (framesExtracted < frameCount) {
            videoElement.currentTime = (duration / frameCount) * framesExtracted;
          } else {
            finish();
          }
        };

        const onSeeked = () => {
          if (cancelled) return;
          try {
            frames.push(captureCurrentFrame());
            advance();
          } catch (e) {
            // Ignore errors during frame extraction (e.g. CORS taint)
            release();
            videoElement.removeEventListener("seeked", onSeeked);
          }
        };

        videoElement.addEventListener("seeked", onSeeked);
        videoElement.addEventListener("error", () => {
          if (!cancelled) {
            setPoster(undefined);
          }
          release();
          videoElement.removeEventListener("seeked", onSeeked);
        });

        // Capture the first frame directly from whatever timestamp the
        // video already sits at after loadedmetadata (almost always 0),
        // instead of assigning currentTime = 0. That assignment is a
        // no-op in most browsers when currentTime is already 0, so
        // "seeked" never fires and the slot leaks forever.
        try {
          frames.push(captureCurrentFrame());
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
  }, [mediaUrl, posterUrl, isVisible, frameCount]);

  // Start/stop cycling based on hover state
  useEffect(() => {
    if (!isHovering || frameUrlsRef.current.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Show first frame when not hovering
      if (firstFrameRef.current) {
        setPoster(firstFrameRef.current);
      }
      return;
    }

    // Start cycling through frames every 2-3 seconds
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      currentFrameIndexRef.current = (currentFrameIndexRef.current + 1) % frameUrlsRef.current.length;
      setPoster(frameUrlsRef.current[currentFrameIndexRef.current]);
    }, 2500); // 2.5 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isHovering]);

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
 * Goes through the same slot + timeout gate as the thumbnail hooks so
 * a burst of hover events can't stack unlimited concurrent loads.
 */
export function usePrefetchOnHover(mediaUrl: string) {
  function prefetch() {
    if (prefetchedUrls.has(mediaUrl)) {
      return;
    }
    prefetchedUrls.add(mediaUrl);

    acquireSlotWithTimeout().then((release) => {
      const warmupVideo = document.createElement("video");
      warmupVideo.preload = "metadata";
      warmupVideo.muted = true;

      const cleanup = () => release();
      warmupVideo.addEventListener("loadedmetadata", cleanup, { once: true });
      warmupVideo.addEventListener("error", cleanup, { once: true });

      warmupVideo.src = mediaUrl;
      // Not attached to the DOM and not retained — the browser/OS media
      // cache is the thing we're warming, not this element.
    });
  }

  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
  };
}