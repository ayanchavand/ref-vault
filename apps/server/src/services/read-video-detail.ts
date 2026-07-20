import { isAbsolute, relative, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";

import type {
  ApiErrorResponse,
  GetVideoDetailResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import { syncVaultCache, getCachedVideoDetail } from "./cache-sync.js";

type VideoDetailResult =
  | { ok: true; value: GetVideoDetailResponse }
  | { ok: false; error: ApiErrorResponse };

export async function readVideoDetail(
  rootPath: string,
  videoRelativePath: string,
): Promise<VideoDetailResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;
  const videoDirectory = await resolveVideoDirectory(
    libraryRootPath,
    videoRelativePath,
  );

  if (!videoDirectory.ok) {
    return videoDirectory;
  }

  try {
    const relativePath = toLibraryRelativePath(
      libraryRootPath,
      videoDirectory.value,
    );

    let cachedVideo = getCachedVideoDetail(libraryRootPath, relativePath);

    if (!cachedVideo) {
      // Run cache sync to populate missing video item
      await syncVaultCache(libraryRootPath);
      cachedVideo = getCachedVideoDetail(libraryRootPath, relativePath);
    }

    if (!cachedVideo) {
      return videoNotFound();
    }

    return {
      ok: true,
      value: { rootPath: libraryRootPath, video: cachedVideo },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_READ_FAILED",
        message: "The video details could not be read.",
      },
    };
  }
}

async function resolveVideoDirectory(
  libraryRootPath: string,
  videoRelativePath: string,
): Promise<{ ok: true; value: string } | { ok: false; error: ApiErrorResponse }> {
  if (
    videoRelativePath.trim().length === 0 ||
    isAbsolute(videoRelativePath) ||
    !isContainedPath(libraryRootPath, resolve(libraryRootPath, videoRelativePath))
  ) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: "videoRelativePath must stay within the library root.",
      },
    };
  }

  try {
    const canonicalVideoPath = await realpath(
      resolve(libraryRootPath, videoRelativePath),
    );

    if (!isContainedPath(libraryRootPath, canonicalVideoPath)) {
      return {
        ok: false,
        error: {
          error: "INVALID_VIDEO_PATH",
          message: "videoRelativePath must stay within the library root.",
        },
      };
    }

    return { ok: true, value: canonicalVideoPath };
  } catch {
    return videoNotFound();
  }
}

function videoNotFound(): { ok: false; error: ApiErrorResponse } {
  return {
    ok: false,
    error: {
      error: "VIDEO_NOT_FOUND",
      message: "The requested video directory was not found.",
    },
  };
}

function isContainedPath(libraryRootPath: string, targetPath: string): boolean {
  const pathFromRoot = relative(libraryRootPath, targetPath);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..");
}

function toLibraryRelativePath(libraryRootPath: string, targetPath: string): string {
  const path = relative(libraryRootPath, targetPath);
  return path.length === 0 ? "." : path.split(sep).join("/");
}
