import { readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  ApiErrorResponse,
  DetailedClip,
  GetVideoDetailResponse,
  JsonObject,
  ScannedClip,
  VideoDetail,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type VideoDetailResult =
  | { ok: true; value: GetVideoDetailResponse }
  | { ok: false; error: ApiErrorResponse };

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

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
    const entries = (await readdir(videoDirectory.value, {
      withFileTypes: true,
    })) as DirectoryEntry[];
    const mainVideo = entries.find(
      (entry) => entry.name === "main.mp4" && entry.isFile(),
    );

    if (!mainVideo) {
      return videoNotFound();
    }

    const videoMetadataPath = join(videoDirectory.value, "metadata.json");
    const metadata = await readOptionalMetadata(
      videoMetadataPath,
      entries.some((entry) => entry.name === "metadata.json" && entry.isFile()),
      libraryRootPath,
    );

    if (!metadata.ok) {
      return metadata;
    }

    const clipsDirectory = entries.find(
      (entry) => entry.name === "clips" && entry.isDirectory(),
    );

    if (!clipsDirectory) {
      return videoNotFound();
    }

    const clipsJsonPath = join(videoDirectory.value, "clips.json");
    const clipsMetadataResult = await readOptionalClipsMetadata(
      clipsJsonPath,
      entries.some((entry) => entry.name === "clips.json" && entry.isFile()),
      libraryRootPath,
    );

    if (!clipsMetadataResult.ok) {
      return clipsMetadataResult;
    }

    const clips = await readClipsWithMetadata(
      join(videoDirectory.value, clipsDirectory.name),
      libraryRootPath,
      clipsMetadataResult.value ?? {},
      entries.some((entry) => entry.name === "clips.json" && entry.isFile())
        ? toLibraryRelativePath(libraryRootPath, clipsJsonPath)
        : undefined,
    );

    if (!clips.ok) {
      return clips;
    }

    const video: VideoDetail = {
      relativePath: toLibraryRelativePath(libraryRootPath, videoDirectory.value),
      mainVideoPath: toLibraryRelativePath(
        libraryRootPath,
        join(videoDirectory.value, "main.mp4"),
      ),
      clips: clips.value,
    };

    if (entries.some((entry) => entry.name === "thumbnail.jpg" && entry.isFile())) {
      video.thumbnailPath = toLibraryRelativePath(
        libraryRootPath,
        join(videoDirectory.value, "thumbnail.jpg"),
      );
    }

    if (entries.some((entry) => entry.name === "clips.json" && entry.isFile())) {
      video.clipsMetadataPath = toLibraryRelativePath(
        libraryRootPath,
        join(videoDirectory.value, "clips.json"),
      );
    }

    if (metadata.value) {
      video.metadata = metadata.value;
    }

    return {
      ok: true,
      value: { rootPath: libraryRootPath, video },
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

async function readClipsWithMetadata(
  clipsDirectoryPath: string,
  libraryRootPath: string,
  clipsMetadata: JsonObject,
  clipsMetadataPath?: string,
): Promise<
  | { ok: true; value: DetailedClip[] }
  | { ok: false; error: ApiErrorResponse }
> {
  const clips = await findClips(clipsDirectoryPath, libraryRootPath);
  const detailedClips: DetailedClip[] = [];

  for (const clip of clips) {
    const detailedClip: DetailedClip = { ...clip };
    const clipKey = clip.mediaPath.split("/").pop()!.replace(/\.mp4$/u, "");

    if (Object.prototype.hasOwnProperty.call(clipsMetadata, clipKey)) {
      const clipMeta = clipsMetadata[clipKey];

      if (typeof clipMeta !== "object" || clipMeta === null || Array.isArray(clipMeta)) {
        return invalidMetadata(clipsMetadataPath ?? "clips.json");
      }

      detailedClip.metadata = clipMeta as JsonObject;
    }

    detailedClips.push(detailedClip);
  }

  return { ok: true, value: detailedClips };
}

async function findClips(
  directoryPath: string,
  libraryRootPath: string,
): Promise<ScannedClip[]> {
  const entries = (await readdir(directoryPath, { withFileTypes: true })) as DirectoryEntry[];
  const fileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );
  const clips: ScannedClip[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      clips.push(...(await findClips(entryPath, libraryRootPath)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".mp4")) {
      continue;
    }

    const clip: ScannedClip = {
      mediaPath: toLibraryRelativePath(libraryRootPath, entryPath),
    };

    clips.push(clip);
  }

  return clips.sort((left, right) => left.mediaPath.localeCompare(right.mediaPath));
}

async function readOptionalMetadata(
  filePath: string,
  exists: boolean,
  libraryRootPath: string,
): Promise<{ ok: true; value?: JsonObject } | { ok: false; error: ApiErrorResponse }> {
  if (!exists) {
    return { ok: true };
  }

  return readMetadata(filePath, toLibraryRelativePath(libraryRootPath, filePath));
}

async function readOptionalClipsMetadata(
  filePath: string,
  exists: boolean,
  libraryRootPath: string,
): Promise<{ ok: true; value?: JsonObject } | { ok: false; error: ApiErrorResponse }> {
  if (!exists) {
    return { ok: true };
  }

  return readMetadata(filePath, toLibraryRelativePath(libraryRootPath, filePath));
}

async function readMetadata(
  filePath: string,
  relativeMetadataPath: string,
): Promise<{ ok: true; value: JsonObject } | { ok: false; error: ApiErrorResponse }> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return invalidMetadata(relativeMetadataPath);
    }

    return { ok: true, value: parsed as JsonObject };
  } catch {
    return invalidMetadata(relativeMetadataPath);
  }
}

function invalidMetadata(relativeMetadataPath: string): {
  ok: false;
  error: ApiErrorResponse;
} {
  return {
    ok: false,
    error: {
      error: "INVALID_METADATA_JSON",
      message: "Metadata must be a valid JSON object.",
      path: relativeMetadataPath,
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
