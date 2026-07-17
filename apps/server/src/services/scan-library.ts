import { readdir } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";

import type {
  ApiErrorResponse,
  ScanLibraryResponse,
  ScannedClip,
  ScannedVideo,
} from "@reference-vault/shared";

import { validateLibraryRoot } from "./validate-library-root.js";

type ScanLibraryResult =
  | { ok: true; value: ScanLibraryResponse }
  | { ok: false; error: ApiErrorResponse };

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export async function scanLibrary(rootPath: string): Promise<ScanLibraryResult> {
  const rootValidation = await validateLibraryRoot(rootPath);

  if (!rootValidation.ok) {
    return rootValidation;
  }

  try {
    const videos: ScannedVideo[] = [];
    await findVideos(rootValidation.value.rootPath, rootValidation.value.rootPath, videos);
    videos.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    return {
      ok: true,
      value: { rootPath: rootValidation.value.rootPath, videos },
    };
  } catch {
    return {
      ok: false,
      error: {
        error: "LIBRARY_SCAN_FAILED",
        message: "The library could not be scanned.",
      },
    };
  }
}

async function findVideos(
  directoryPath: string,
  libraryRootPath: string,
  videos: ScannedVideo[],
): Promise<void> {
  const entries = (await readdir(directoryPath, { withFileTypes: true })) as DirectoryEntry[];
  const mainVideo = entries.find(
    (entry) => entry.name === "main.mp4" && entry.isFile(),
  );
  const clipsDirectory = entries.find(
    (entry) => entry.name === "clips" && entry.isDirectory(),
  );
  const isVideoDirectory = mainVideo !== undefined && clipsDirectory !== undefined;

  if (isVideoDirectory) {
    videos.push(await describeVideo(directoryPath, libraryRootPath, entries));
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    // A video's clips are media, not nested video-library roots.
    if (isVideoDirectory && entry.name === "clips") {
      continue;
    }

    await findVideos(join(directoryPath, entry.name), libraryRootPath, videos);
  }
}

async function describeVideo(
  directoryPath: string,
  libraryRootPath: string,
  entries: DirectoryEntry[],
): Promise<ScannedVideo> {
  const clipsDirectory = entries.find(
    (entry) => entry.name === "clips" && entry.isDirectory(),
  );
  const video: ScannedVideo = {
    relativePath: relativePath(libraryRootPath, directoryPath),
    mainVideoPath: relativePath(libraryRootPath, join(directoryPath, "main.mp4")),
    clips: await findClips(join(directoryPath, clipsDirectory!.name), libraryRootPath),
  };

  if (entries.some((entry) => entry.name === "clips.json" && entry.isFile())) {
    video.clipsMetadataPath = relativePath(
      libraryRootPath,
      join(directoryPath, "clips.json"),
    );
  }

  if (entries.some((entry) => entry.name === "metadata.json" && entry.isFile())) {
    video.metadataPath = relativePath(
      libraryRootPath,
      join(directoryPath, "metadata.json"),
    );
  }

  if (entries.some((entry) => entry.name === "thumbnail.jpg" && entry.isFile())) {
    video.thumbnailPath = relativePath(
      libraryRootPath,
      join(directoryPath, "thumbnail.jpg"),
    );
  }

  return video;
}

async function findClips(
  directoryPath: string,
  libraryRootPath: string,
): Promise<ScannedClip[]> {
  const entries = (await readdir(directoryPath, { withFileTypes: true })) as DirectoryEntry[];
  const clips: ScannedClip[] = [];
  const fileNames = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      clips.push(...(await findClips(entryPath, libraryRootPath)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".mp4")) {
      continue;
    }

    const metadataFileName = `${basename(entry.name, ".mp4")}.json`;
    const clip: ScannedClip = {
      mediaPath: relativePath(libraryRootPath, entryPath),
    };

    clips.push(clip);
  }

  return clips.sort((left, right) => left.mediaPath.localeCompare(right.mediaPath));
}

function relativePath(rootPath: string, targetPath: string): string {
  const path = relative(rootPath, targetPath);
  return path.length === 0 ? "." : path.split(sep).join("/");
}
