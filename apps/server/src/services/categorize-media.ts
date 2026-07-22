import { rename, mkdir, stat, rm } from "node:fs/promises";
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
  let sourceFilePath = join(libraryRootPath, mediaRelativePath);
  let effectiveMediaRel = mediaRelativePath;

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

  // Check if file exists; if not, try smart fallback resolution
  let fileStats;
  try {
    fileStats = await stat(sourceFilePath);
    if (!fileStats.isFile()) {
      throw new Error("Not a file");
    }
  } catch {
    // Fallback 1: Try prepending "media/" if omitted by client
    const fallbackMediaRel = `media/${mediaRelativePath}`;
    const fallbackPath = join(libraryRootPath, fallbackMediaRel);
    try {
      const s = await stat(fallbackPath);
      if (s.isFile()) {
        sourceFilePath = fallbackPath;
        effectiveMediaRel = fallbackMediaRel;
        fileStats = s;
      } else {
        throw new Error("Not a file");
      }
    } catch {
      // Fallback 2: Query SQLite database cache for matching relative_path
      try {
        const db = getVaultDb(libraryRootPath);
        const row = db
          .prepare("SELECT relative_path FROM media_items WHERE relative_path = ? OR relative_path LIKE ?")
          .get(mediaRelativePath, `%/${mediaRelativePath}`) as { relative_path: string } | undefined;

        if (row) {
          const dbPath = join(libraryRootPath, row.relative_path);
          const s = await stat(dbPath);
          if (s.isFile()) {
            sourceFilePath = dbPath;
            effectiveMediaRel = row.relative_path;
            fileStats = s;
          } else {
            throw new Error("Not a file");
          }
        } else {
          throw new Error("Not found in cache");
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
    }
  }

  const fileName = basename(sourceFilePath);
  const mediaType = inferMediaType(fileName) || "image";
  let expectedSubfolder = "images";
  if (mediaType === "video") {
    expectedSubfolder = "videos";
  } else if (mediaType === "gif") {
    expectedSubfolder = "gifs";
  }

  // Determine prefix path from source file if available
  const sourceRelParts = toForwardSlash(effectiveMediaRel).split("/");
  const expectedIndex = sourceRelParts.lastIndexOf(expectedSubfolder);
  const prefixPath = expectedIndex > 0 ? sourceRelParts.slice(0, expectedIndex).join("/") : "";

  // Resolve target directory
  let targetCategory = category ? category.trim() : "";
  if (!targetCategory) {
    targetCategory = prefixPath ? `${prefixPath}/${expectedSubfolder}` : expectedSubfolder;
  }

  // Validate containment of target category to the expected subfolder
  const targetCategoryNormalized = toForwardSlash(targetCategory);
  const targetSegments = targetCategoryNormalized.split("/");
  if (!targetSegments.includes(expectedSubfolder)) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: `Media files of type "${mediaType}" must stay within the "${expectedSubfolder}" folder.`,
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

    // Move or deduplicate file on disk
    if (sourceFilePath !== targetFilePath) {
      try {
        const existingStats = await stat(targetFilePath);
        if (existingStats.size === fileStats.size) {
          // Byte duplicate! Remove source duplicate to keep library clean
          await rm(sourceFilePath);
        } else {
          // File with same name but different content exists: reject move to avoid collision/overwriting
          return {
            ok: false,
            error: {
              error: "FILE_ALREADY_EXISTS",
              message: `A different file named "${fileName}" already exists in "${targetCategory}".`,
            },
          };
        }
      } catch {
        // Target file does not exist: move file to target destination
        await rename(sourceFilePath, targetFilePath);
      }
    }

    // Sync in SQLite cache
    const db = getVaultDb(libraryRootPath);

    // 1. Remove old path from cache
    db.prepare("DELETE FROM media_items WHERE relative_path = ? OR relative_path = ?").run(
      mediaRelativePath,
      effectiveMediaRel,
    );

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

async function resolveNonCollidingPath(
  sourcePath: string,
  targetDir: string,
  fileName: string,
): Promise<string> {
  const candidatePath = join(targetDir, fileName);
  if (candidatePath === sourcePath) return candidatePath;

  try {
    await stat(candidatePath);
    // Collision detected: append counter suffix e.g. "video (1).mp4"
    const ext = extname(fileName);
    const nameWithoutExt = basename(fileName, ext);
    let counter = 1;
    while (true) {
      const candidateName = `${nameWithoutExt} (${counter})${ext}`;
      const testPath = join(targetDir, candidateName);
      try {
        await stat(testPath);
        counter++;
      } catch {
        return testPath;
      }
    }
  } catch {
    return candidatePath;
  }
}
