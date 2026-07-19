import { mkdir, stat, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  ApiErrorResponse,
  CreateVideoPlaceholderRequest,
  CreateVideoPlaceholderResponse,
  DeleteVideoResponse,
  JsonObject,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";
import { writeJsonAtomically, toLibraryRelativePath } from "./write-clip-metadata.js";

type CreatePlaceholderResult =
  | { ok: true; value: CreateVideoPlaceholderResponse }
  | { ok: false; error: ApiErrorResponse };

type ResolveUploadDirResult =
  | { ok: true; value: string }
  | { ok: false; error: ApiErrorResponse };

function sanitizeDirectoryName(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isContainedPath(parentPath: string, targetPath: string): boolean {
  const pathFromParent = relative(parentPath, targetPath);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== "..")
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function createVideoPlaceholder(
  request: CreateVideoPlaceholderRequest,
): Promise<CreatePlaceholderResult> {
  const rootValidation = await validateLibraryRoot(request.rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;

  if (request.title.trim().length === 0) {
    return {
      ok: false,
      error: {
        error: "INVALID_METADATA_JSON",
        message: "Title is required and cannot be empty.",
      },
    };
  }

  let folderName = sanitizeDirectoryName(request.title);
  if (folderName.length === 0) {
    folderName = "unnamed-video";
  }

  let finalFolderName = folderName;
  let counter = 1;

  while (await pathExists(join(libraryRootPath, finalFolderName))) {
    finalFolderName = `${folderName}-${counter}`;
    counter++;
  }

  const videoDirectory = join(libraryRootPath, finalFolderName);

  // Double check containment just in case of weird folder names
  if (!isContainedPath(libraryRootPath, videoDirectory)) {
    return {
      ok: false,
      error: {
        error: "INVALID_VIDEO_PATH",
        message: "Generated directory path is outside library root.",
      },
    };
  }

  try {
    // Create directory and clips subdirectory
    await mkdir(videoDirectory, { recursive: true });
    await mkdir(join(videoDirectory, "clips"), { recursive: true });

    // Prepare metadata
    const metadata: JsonObject = {
      tags: request.tags || [],
    };

    if (request.notes && request.notes.trim().length > 0) {
      metadata.notes = request.notes;
    }

    if (request.artist && request.artist.trim().length > 0) {
      metadata.artist = request.artist;
    }

    if (request.rating && request.rating > 0) {
      metadata.rating = request.rating;
    }

    // Write metadata.json atomically
    const metadataPath = join(videoDirectory, "metadata.json");
    await writeJsonAtomically(metadataPath, metadata);

    return {
      ok: true,
      value: {
        success: true,
        videoRelativePath: finalFolderName,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to create folder or save metadata: ${(error as Error).message}`,
      },
    };
  }
}

export async function resolveUploadDirectory(
  libraryRootPath: string,
  videoRelativePath: string,
): Promise<ResolveUploadDirResult> {
  const resolvedTarget = resolve(libraryRootPath, videoRelativePath);
  if (
    videoRelativePath.trim().length === 0 ||
    isAbsolute(videoRelativePath) ||
    resolvedTarget === libraryRootPath ||
    !isContainedPath(libraryRootPath, resolvedTarget)
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
    const videoDirectory = await stat(resolve(libraryRootPath, videoRelativePath));

    if (!videoDirectory.isDirectory()) {
      return {
        ok: false,
        error: {
          error: "VIDEO_NOT_FOUND",
          message: "The target video directory does not exist or is not a directory.",
        },
      };
    }

    const canonicalPath = resolve(libraryRootPath, videoRelativePath);
    return { ok: true, value: canonicalPath };
  } catch {
    return {
      ok: false,
      error: {
        error: "VIDEO_NOT_FOUND",
        message: "The target video directory does not exist.",
      },
    };
  }
}

type DeleteVideoResult =
  | { ok: true; value: DeleteVideoResponse }
  | { ok: false; error: ApiErrorResponse };

export async function deleteVideo(
  rootPath: string,
  videoRelativePath: string,
): Promise<DeleteVideoResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  const libraryRootPath = rootValidation.value.rootPath;

  const resolvedDir = await resolveUploadDirectory(libraryRootPath, videoRelativePath);

  if (!resolvedDir.ok) {
    return resolvedDir;
  }

  const videoDirectory = resolvedDir.value;

  try {
    await rm(videoDirectory, { recursive: true, force: true });
    return {
      ok: true,
      value: { success: true },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        error: "METADATA_WRITE_FAILED",
        message: `Failed to delete video directory: ${(error as Error).message}`,
      },
    };
  }
}
