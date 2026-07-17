import { useEffect, useRef, useState } from "react";

/**
 * Caps how many hidden <video> elements can be decoding a frame at once.
 * Without this, a grid of 20+ cards would all start downloading video
 * just to render a thumbnail, competing for bandwidth and CPU.
 */
const MAX_CONCURRENT_THUMBNAILS = 3;

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
    let releaseOnCleanup: (() => void) | null = null;
    const videoElement = document.createElement("video");
    const canvas = document.createElement("canvas");

    acquireSlot().then(() => {
      if (cancelled) {
        releaseSlot();
        return;
      }

      releaseOnCleanup = releaseSlot;

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
          return;
        }

        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL("image/jpeg", 0.75));
      };

      videoElement.addEventListener("loadeddata", onLoadedData);
      videoElement.addEventListener("error", () => {
        if (!cancelled) {
          setPoster(undefined);
        }
      });
    });

    return () => {
      cancelled = true;
      videoElement.src = "";
      if (releaseOnCleanup) {
        releaseOnCleanup();
      }
    };
  }, [mediaUrl, posterUrl, isVisible]);

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

    const warmupVideo = document.createElement("video");
    warmupVideo.preload = "metadata";
    warmupVideo.muted = true;
    warmupVideo.src = mediaUrl;
    // Not attached to the DOM and not retained — the browser/OS media
    // cache is the thing we're warming, not this element.
  }

  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
  };
}