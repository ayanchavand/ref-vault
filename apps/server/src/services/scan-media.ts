import { rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

import type {
  ApiErrorResponse,
  ScanMediaResponse,
  DeleteMediaResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import {
  syncMediaCache,
  getCachedMediaItems,
  removeMediaItemFromCache,
  removeVideoFromCache,
} from "./cache-sync.js";

type ScanMediaResult =
  | { ok: true; value: ScanMediaResponse }
  | { ok: false; error: ApiErrorResponse };

export async function scanMedia(rootPath: string): Promise<ScanMediaResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  try {
    const libraryRootPath = rootValidation.value.rootPath;
    await syncMediaCache(libraryRootPath);
    const items = getCachedMediaItems(libraryRootPath);

    // Fisher-Yates shuffle so every scan starts at a random position
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }

    return {
      ok: true,
      value: { rootPath: libraryRootPath, items },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "MEDIA_SCAN_FAILED",
        message: "The media folder could not be scanned.",
      },
    };
  }
}

export type DeleteMediaResult =
  | { ok: true; value: DeleteMediaResponse }
  | { ok: false; error: ApiErrorResponse };

export async function deleteMediaItem(
  rootPath: string,
  mediaRelativePath: string,
): Promise<DeleteMediaResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;
  const targetFilePath = join(libraryRootPath, mediaRelativePath);

  // Containment check to prevent path traversal
  const pathFromParent = relative(libraryRootPath, targetFilePath);
  const isContained =
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent));

  if (!isContained) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: "Media file path must stay within the library root.",
      },
    };
  }

  try {
    const fileName = basename(targetFilePath);
    const parentDir = dirname(targetFilePath);
    const parentRel = relative(libraryRootPath, parentDir);
    const isParentContained =
      parentDir !== libraryRootPath &&
      parentRel !== "" &&
      !parentRel.startsWith("..") &&
      !isAbsolute(parentRel);

    // If deleting main.mp4 of a video directory, delete the whole video directory
    if (fileName.toLowerCase() === "main.mp4" && isParentContained) {
      await rm(parentDir, { recursive: true, force: true });
      removeVideoFromCache(libraryRootPath, parentRel);
    } else {
      await rm(targetFilePath, { recursive: true, force: true });
    }

    removeMediaItemFromCache(libraryRootPath, mediaRelativePath);

    return {
      ok: true,
      value: { success: true },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to delete media file: ${(error as Error).message}`,
      },
    };
  }
}
