import { rename, mkdir, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";
import type {
  ApiErrorResponse,
  CategorizeMediaResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import { getVaultDb } from "./db.js";

type CategorizeMediaResult =
  | { ok: true; value: CategorizeMediaResponse }
  | { ok: false; error: ApiErrorResponse };

function toForwardSlash(p: string): string {
  return p.split(sep).join("/");
}

function extractTagsFromPath(relativePath: string): string[] {
  const parts = relativePath.split("/");
  if (parts.length <= 2) return [];
  const tags: string[] = [];
  const intermediate = parts.slice(1, -1);
  let currentPath = "";
  for (const segment of intermediate) {
    if (!segment) continue;
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    tags.push(currentPath);
  }
  return tags;
}

/**
 * Physically moves a media file to a category directory on disk and syncs SQLite cache.
 */
export async function categorizeMediaItem(
  rootPath: string,
  mediaRelativePath: string,
  category: string | null,
): Promise<CategorizeMediaResult> {
  const rootValidation = await validateLibraryRoot(rootPath);
  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;
  const sourceFilePath = join(libraryRootPath, mediaRelativePath);

  // Validate containment of source file
  const sourceRel = relative(libraryRootPath, sourceFilePath);
  const isSourceContained =
    sourceRel !== "" && !sourceRel.startsWith("..") && !isAbsolute(sourceRel);

  if (!isSourceContained) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: "Media file path must stay within the library root.",
      },
    };
  }

  // Check if file exists
  let fileStats;
  try {
    fileStats = await stat(sourceFilePath);
    if (!fileStats.isFile()) {
      throw new Error("Not a file");
    }
  } catch {
    return {
      ok: false,
      error: {
        error: "MEDIA_NOT_FOUND",
        message: "The requested media file was not found.",
      },
    };
  }

  const fileName = basename(sourceFilePath);
  const mediaType = inferMediaType(fileName) || "image";
  let expectedPrefix = "images";
  if (mediaType === "video") {
    expectedPrefix = "videos";
  } else if (mediaType === "gif") {
    expectedPrefix = "gifs";
  }

  // Resolve target directory
  let targetCategory = category ? category.trim() : "";
  if (!targetCategory) {
    targetCategory = expectedPrefix;
  }

  // Validate containment of target category to the expected prefix
  const targetCategoryNormalized = toForwardSlash(targetCategory);
  if (
    targetCategoryNormalized !== expectedPrefix &&
    !targetCategoryNormalized.startsWith(expectedPrefix + "/")
  ) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: `Media files of type "${mediaType}" must stay within the "${expectedPrefix}" folder.`,
      },
    };
  }

  const targetDir = join(libraryRootPath, targetCategory);

  // Validate target directory containment
  const targetDirRel = relative(libraryRootPath, targetDir);
  const isTargetContained =
    targetDir === libraryRootPath ||
    (targetDirRel !== "" && !targetDirRel.startsWith("..") && !isAbsolute(targetDirRel));

  if (!isTargetContained) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: "Target category path must stay within the library root.",
      },
    };
  }

  try {
    // Create target directory if it doesn't exist
    if (targetDir !== libraryRootPath) {
      await mkdir(targetDir, { recursive: true });
    }

    const targetFilePath = join(targetDir, fileName);
    const newRelativePath = toForwardSlash(relative(libraryRootPath, targetFilePath));

    // Move file on disk
    await rename(sourceFilePath, targetFilePath);

    // Sync in SQLite cache
    const db = getVaultDb(libraryRootPath);

    // 1. Remove old path from cache
    db.prepare("DELETE FROM media_items WHERE relative_path = ?").run(mediaRelativePath);

    // 2. Insert new path into cache
    const tags = extractTagsFromPath(newRelativePath);
    const mediaType = inferMediaType(fileName) || "image";

    db.prepare(`
      INSERT OR REPLACE INTO media_items (relative_path, type, size_bytes, tags_json, mtime_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      newRelativePath,
      mediaType,
      fileStats.size,
      JSON.stringify(tags),
      Date.now(),
    );

    return {
      ok: true,
      value: {
        success: true,
        newRelativePath,
        tags,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to categorize media: ${(error as Error).message}`,
      },
    };
  }
}

function inferMediaType(filename: string): string | null {
  const ext = extname(filename).toLowerCase();
  if (ext === ".gif") return "gif";
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov") return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) return "image";
  return null;
}
