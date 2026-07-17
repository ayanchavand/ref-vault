import { spawn } from "node:child_process";
import { stat, realpath } from "node:fs/promises";
import { dirname, join, extname, basename, resolve, relative } from "node:path";
import type { ApiErrorResponse } from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type GenerateThumbnailResult =
  | { ok: true; value: { filePath: string; fileStats: import("node:fs").Stats } }
  | { ok: false; error: ApiErrorResponse };

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", args);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    process.on("error", (err) => {
      reject(err);
    });
  });
}

function isContainedPath(libraryRootPath: string, targetPath: string): boolean {
  const pathFromRoot = resolve(libraryRootPath, targetPath).startsWith(libraryRootPath)
    ? relative(libraryRootPath, targetPath)
    : "..";
  return pathFromRoot === "" || !pathFromRoot.startsWith("..");
}

export async function generateThumbnail(
  rootPath: string,
  mediaPath: string,
): Promise<GenerateThumbnailResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRoot = rootValidation.value.rootPath;
  let filePath: string;
  try {
    filePath = await realpath(resolve(libraryRoot, mediaPath));
  } catch {
    return {
      ok: false,
      error: {
        error: "MEDIA_NOT_FOUND",
        message: "The requested media file was not found.",
      },
    };
  }

  // Safety check: must stay within library root
  if (!isContainedPath(libraryRoot, filePath)) {
    return {
      ok: false,
      error: {
        error: "MEDIA_NOT_FOUND",
        message: "mediaPath must stay within the library root.",
      },
    };
  }

  if (!filePath.endsWith(".mp4")) {
    return {
      ok: false,
      error: {
        error: "INVALID_MEDIA_TYPE",
        message: "Thumbnails can only be generated for MP4 videos.",
      },
    };
  }

  const dir = dirname(filePath);
  const base = basename(filePath);
  
  let thumbnailPath: string;
  if (base === "main.mp4") {
    thumbnailPath = join(dir, "thumbnail.jpg");
  } else {
    const ext = extname(base);
    const nameWithoutExt = base.substring(0, base.length - ext.length);
    thumbnailPath = join(dir, `${nameWithoutExt}.jpg`);
  }

  try {
    // If thumbnail already exists, use it
    const fileStats = await stat(thumbnailPath);
    if (fileStats.isFile()) {
      return { ok: true, value: { filePath: thumbnailPath, fileStats } };
    }
  } catch {
    // Thumbnail does not exist, we need to generate it
  }

  // Generate thumbnail using ffmpeg
  // We scale to 480px width for mobile optimization and file size savings.
  try {
    // Try seeking to 2 seconds first for a representative thumbnail
    await runFfmpeg([
      "-y",
      "-ss",
      "00:00:02",
      "-i",
      filePath,
      "-vf",
      "scale=480:-1",
      "-vframes",
      "1",
      thumbnailPath,
    ]);
  } catch (err) {
    try {
      // Fallback: Seek to 0 seconds if the video is too short or seek fails
      await runFfmpeg([
        "-y",
        "-ss",
        "00:00:00",
        "-i",
        filePath,
        "-vf",
        "scale=480:-1",
        "-vframes",
        "1",
        thumbnailPath,
      ]);
    } catch (fallbackErr) {
      return {
        ok: false,
        error: {
          error: "THUMBNAIL_GENERATION_FAILED",
          message: `Failed to extract thumbnail using ffmpeg: ${(fallbackErr as Error).message}`,
        },
      };
    }
  }

  try {
    const fileStats = await stat(thumbnailPath);
    if (fileStats.isFile()) {
      return { ok: true, value: { filePath: thumbnailPath, fileStats } };
    }
  } catch {
    // Fallthrough to error
  }

  return {
    ok: false,
    error: {
      error: "THUMBNAIL_GENERATION_FAILED",
      message: "Thumbnail file was not created.",
    },
  };
}
