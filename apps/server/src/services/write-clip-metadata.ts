import { randomUUID } from "node:crypto";
import { readFile, realpath, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  ApiErrorResponse,
  JsonObject,
  PutClipMetadataResponse,
  DeleteClipResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type WriteClipMetadataResult =
  | { ok: true; value: PutClipMetadataResponse }
  | { ok: false; error: ApiErrorResponse };

export type DeleteClipResult =
  | { ok: true; value: DeleteClipResponse }
  | { ok: false; error: ApiErrorResponse };

export async function writeClipMetadata(
  rootPath: string,
  videoRelativePath: string,
  clipMediaPath: string,
  metadata: JsonObject,
): Promise<WriteClipMetadataResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const videoDirectory = await resolveVideoDirectory(
    rootValidation.value.rootPath,
    videoRelativePath,
  );

  if (!videoDirectory.ok) {
    return videoDirectory;
  }

  const clipPath = await resolveClipPath(
    rootValidation.value.rootPath,
    videoDirectory.value,
    clipMediaPath,
  );

  if (!clipPath.ok) {
    return clipPath;
  }

  const clipsMetadataPath = join(videoDirectory.value, "clips.json");
  let clipsMetadata: JsonObject = {};

  try {
    const existingContents = await readFile(clipsMetadataPath, "utf8");
    const parsed: unknown = JSON.parse(existingContents);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Invalid existing clips metadata");
    }

    clipsMetadata = parsed as JsonObject;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      clipsMetadata = {};
    } else {
      return {
        ok: false,
        error: {
          error: "METADATA_WRITE_FAILED",
          message: "Clip metadata could not be saved.",
        },
      };
    }
  }

  const clipKey = basename(clipPath.value, ".mp4");
  clipsMetadata[clipKey] = metadata;

  try {
    await writeJsonAtomically(clipsMetadataPath, clipsMetadata);
    return {
      ok: true,
      value: {
        metadataPath: toLibraryRelativePath(
          rootValidation.value.rootPath,
          clipsMetadataPath,
        ),
        metadata,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: "Clip metadata could not be saved.",
      },
    };
  }
}

export async function resolveVideoDirectory(
  libraryRootPath: string,
  videoRelativePath: string,
): Promise<{ ok: true; value: string } | { ok: false; error: ApiErrorResponse }> {
  if (!isSafeRelativePath(libraryRootPath, videoRelativePath)) {
    return invalidVideoPath();
  }

  try {
    const videoDirectory = await realpath(resolve(libraryRootPath, videoRelativePath));

    if (!isContainedPath(libraryRootPath, videoDirectory)) {
      return invalidVideoPath();
    }

    const [videoStats, mainVideoStats] = await Promise.all([
      stat(videoDirectory),
      stat(join(videoDirectory, "main.mp4")),
    ]);

    return videoStats.isDirectory() && mainVideoStats.isFile()
      ? { ok: true, value: videoDirectory }
      : videoNotFound();
  } catch {
    return videoNotFound();
  }
}

async function resolveClipPath(
  libraryRootPath: string,
  videoDirectory: string,
  clipMediaPath: string,
): Promise<{ ok: true; value: string } | { ok: false; error: ApiErrorResponse }> {
  const clipsDirectory = join(videoDirectory, "clips");
  const requestedClipPath = resolve(libraryRootPath, clipMediaPath);

  if (
    !isSafeRelativePath(libraryRootPath, clipMediaPath) ||
    !isContainedPath(clipsDirectory, requestedClipPath) ||
    !clipMediaPath.endsWith(".mp4")
  ) {
    return invalidClipPath();
  }

  try {
    const [canonicalClipsDirectory, canonicalClipPath] = await Promise.all([
      realpath(clipsDirectory),
      realpath(requestedClipPath),
    ]);

    if (
      !isContainedPath(canonicalClipsDirectory, canonicalClipPath) ||
      !isContainedPath(libraryRootPath, canonicalClipPath) ||
      !(await stat(canonicalClipPath)).isFile()
    ) {
      return invalidClipPath();
    }

    return { ok: true, value: canonicalClipPath };
  } catch {
    return {
      ok: false,
      error: {
        error: "CLIP_NOT_FOUND",
        message: "The requested clip file was not found.",
      },
    };
  }
}

export async function writeJsonAtomically(
  metadataPath: string,
  metadata: JsonObject,
): Promise<void> {
  const temporaryPath = join(
    dirname(metadataPath),
    `.${basename(metadataPath)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, metadataPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function invalidVideoPath(): { ok: false; error: ApiErrorResponse } {
  return {
    ok: false,
    error: {
      error: "INVALID_VIDEO_PATH",
      message: "videoRelativePath must stay within the library root.",
    },
  };
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

function invalidClipPath(): { ok: false; error: ApiErrorResponse } {
  return {
    ok: false,
    error: {
      error: "INVALID_CLIP_PATH",
      message: "clipMediaPath must identify an MP4 file inside the video's clips directory.",
    },
  };
}

function isSafeRelativePath(libraryRootPath: string, path: string): boolean {
  return (
    path.trim().length > 0 &&
    !isAbsolute(path) &&
    isContainedPath(libraryRootPath, resolve(libraryRootPath, path))
  );
}

function isContainedPath(parentPath: string, targetPath: string): boolean {
  const pathFromParent = relative(parentPath, targetPath);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..")
  );
}

export function toLibraryRelativePath(libraryRootPath: string, targetPath: string): string {
  return relative(libraryRootPath, targetPath).split(sep).join("/");
}

export async function deleteClip(
  rootPath: string,
  videoRelativePath: string,
  clipMediaPath: string,
): Promise<DeleteClipResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const videoDirectory = await resolveVideoDirectory(
    rootValidation.value.rootPath,
    videoRelativePath,
  );

  if (!videoDirectory.ok) {
    return videoDirectory;
  }

  const clipPath = await resolveClipPath(
    rootValidation.value.rootPath,
    videoDirectory.value,
    clipMediaPath,
  );

  if (!clipPath.ok) {
    return clipPath;
  }

  const resolvedClipPath = clipPath.value;
  const clipFileName = basename(resolvedClipPath);
  const match = clipFileName.match(/^scene_(\d+)\.mp4$/i);

  // If the clip to delete does not match the scene_XX format, we just delete the file and its metadata without resequencing
  if (!match) {
    try {
      await rm(resolvedClipPath, { force: true });
    } catch (err) {
      return {
        ok: false,
        error: {
          error: "METADATA_WRITE_FAILED",
          message: `Failed to delete clip file: ${(err as Error).message}`,
        },
      };
    }

    const clipsMetadataPath = join(videoDirectory.value, "clips.json");
    let clipsMetadata: JsonObject = {};
    try {
      const existingContents = await readFile(clipsMetadataPath, "utf8");
      const parsed = JSON.parse(existingContents);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        clipsMetadata = parsed;
      }
    } catch {
      // Ignore if file doesn't exist
    }

    const clipKey = basename(resolvedClipPath, ".mp4");
    delete clipsMetadata[clipKey];

    try {
      await writeJsonAtomically(clipsMetadataPath, clipsMetadata);
    } catch {
      // Ignore write errors
    }

    return {
      ok: true,
      value: {
        success: true,
      },
    };
  }

  // Resequence scene clips
  const deletedIndex = parseInt(match[1]!, 10);
  const clipsDir = dirname(resolvedClipPath);

  try {
    await rm(resolvedClipPath, { force: true });
  } catch (err) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to delete clip file: ${(err as Error).message}`,
      },
    };
  }

  let files: string[] = [];
  try {
    files = await readdir(clipsDir);
  } catch {
    // Ignore error
  }

  const remainingSceneIndices: number[] = [];
  for (const file of files) {
    const fileMatch = file.match(/^scene_(\d+)\.mp4$/i);
    if (fileMatch) {
      const idx = parseInt(fileMatch[1]!, 10);
      if (idx > deletedIndex) {
        remainingSceneIndices.push(idx);
      }
    }
  }

  remainingSceneIndices.sort((a, b) => a - b);

  for (const idx of remainingSceneIndices) {
    const oldName = `scene_${String(idx).padStart(2, "0")}.mp4`;
    const newName = `scene_${String(idx - 1).padStart(2, "0")}.mp4`;
    try {
      await rename(join(clipsDir, oldName), join(clipsDir, newName));
    } catch (err) {
      // Ignore errors
    }
  }

  const clipsMetadataPath = join(videoDirectory.value, "clips.json");
  let clipsMetadata: JsonObject = {};
  let hasMetadataFile = false;
  try {
    const existingContents = await readFile(clipsMetadataPath, "utf8");
    const parsed = JSON.parse(existingContents);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      clipsMetadata = parsed;
      hasMetadataFile = true;
    }
  } catch {
    // Ignore
  }

  if (hasMetadataFile) {
    const updatedMetadata: JsonObject = {};
    for (const key of Object.keys(clipsMetadata)) {
      const keyMatch = key.match(/^scene_(\d+)$/i);
      if (keyMatch) {
        const idx = parseInt(keyMatch[1]!, 10);
        if (idx === deletedIndex) {
          continue;
        } else if (idx > deletedIndex) {
          const newKey = `scene_${String(idx - 1).padStart(2, "0")}`;
          updatedMetadata[newKey] = clipsMetadata[key]!;
        } else {
          updatedMetadata[key] = clipsMetadata[key]!;
        }
      } else {
        updatedMetadata[key] = clipsMetadata[key]!;
      }
    }

    try {
      await writeJsonAtomically(clipsMetadataPath, updatedMetadata);
    } catch (err) {
      return {
        ok: false,
        error: {
          error: "METADATA_WRITE_FAILED",
          message: `Failed to save updated clips.json: ${(err as Error).message}`,
        },
      };
    }
  }

  // Sync split_plan.json if it exists
  const splitPlanPath = join(videoDirectory.value, "split_plan.json");
  try {
    const existingSplitPlan = await readFile(splitPlanPath, "utf8");
    const parsedPlan = JSON.parse(existingSplitPlan);
    if (
      typeof parsedPlan === "object" &&
      parsedPlan !== null &&
      Array.isArray(parsedPlan.segments)
    ) {
      const segmentIndex = deletedIndex - 1;
      if (segmentIndex >= 0 && segmentIndex < parsedPlan.segments.length) {
        parsedPlan.segments.splice(segmentIndex, 1);
        await writeJsonAtomically(splitPlanPath, parsedPlan);
      }
    }
  } catch {
    // Ignore error if split_plan.json does not exist or fails to parse
  }

  return {
    ok: true,
    value: {
      success: true,
    },
  };
}
