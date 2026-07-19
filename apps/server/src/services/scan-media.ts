import { readdir, stat, rm } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";

import type {
  ApiErrorResponse,
  ScannedMediaItem,
  ScannedMediaType,
  ScanMediaResponse,
  DeleteMediaResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type ScanMediaResult =
  | { ok: true; value: ScanMediaResponse }
  | { ok: false; error: ApiErrorResponse };

function inferMediaType(filename: string): ScannedMediaType | null {
  const ext = extname(filename).toLowerCase();
  if (ext === ".gif") return "gif";
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov") return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) return "image";
  return null;
}

function toForwardSlash(p: string): string {
  return p.split(sep).join("/");
}

/**
 * Recursively collect all supported media files under dirPath.
 * Sub-directories are walked in parallel; stat() calls for files
 * within each directory are also parallel — so large flat folders
 * (hundreds of GIFs) are scanned in O(depth) awaits instead of O(n).
 */
async function collectMedia(
  dirPath: string,
  rootPath: string,
): Promise<ScannedMediaItem[]> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return []; // skip unreadable dirs
  }

  const dirs: string[] = [];
  const filePromises: Promise<ScannedMediaItem | null>[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs.push(join(dirPath, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;

    const type = inferMediaType(entry.name);
    if (!type) continue;

    const fullPath = join(dirPath, entry.name);
    filePromises.push(
      stat(fullPath)
        .then((fileStats): ScannedMediaItem => ({
          relativePath: toForwardSlash(relative(rootPath, fullPath)),
          type,
          sizeBytes: fileStats.size,
        }))
        .catch(() => null), // skip unreadable files
    );
  }

  // Kick off all sub-directory walks and file stats in parallel
  const [fileResults, ...dirResults] = await Promise.all([
    Promise.all(filePromises),
    ...dirs.map((d) => collectMedia(d, rootPath)),
  ]);

  const items: ScannedMediaItem[] = [];
  for (const r of fileResults) {
    if (r !== null) items.push(r);
  }
  for (const dirItems of dirResults) {
    items.push(...dirItems);
  }
  return items;
}

export async function scanMedia(rootPath: string): Promise<ScanMediaResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  try {
    const items = await collectMedia(
      rootValidation.value.rootPath,
      rootValidation.value.rootPath,
    );

    // Fisher-Yates shuffle so every scan starts at a random position
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }

    return {
      ok: true,
      value: { rootPath: rootValidation.value.rootPath, items },
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
    } else {
      await rm(targetFilePath, { recursive: true, force: true });
    }

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
