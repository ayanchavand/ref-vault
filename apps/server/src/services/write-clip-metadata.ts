import { randomUUID } from "node:crypto";
import { readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  ApiErrorResponse,
  JsonObject,
  PutClipMetadataResponse,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type WriteClipMetadataResult =
  | { ok: true; value: PutClipMetadataResponse }
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

async function resolveVideoDirectory(
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

async function writeJsonAtomically(
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

function toLibraryRelativePath(libraryRootPath: string, targetPath: string): string {
  return relative(libraryRootPath, targetPath).split(sep).join("/");
}
