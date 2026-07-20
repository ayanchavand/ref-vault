import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import type {
  JsonObject,
  ScannedClip,
  ScannedMediaItem,
  ScannedMediaType,
  ScannedVideo,
  VideoDetail,
  DetailedClip,
} from "@reference-vault/shared";

import { getVaultDb } from "./db.js";

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

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

function inferMediaType(filename: string): ScannedMediaType | null {
  const ext = extname(filename).toLowerCase();
  if (ext === ".gif") return "gif";
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov") return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) return "image";
  return null;
}

function probeVideo(filePath: string): Promise<{ width?: number; height?: number; framerate?: string }> {
  return new Promise((resolve) => {
    const process = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,r_frame_rate",
      "-of", "json",
      filePath,
    ]);

    let stdout = "";
    process.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const stream = parsed.streams?.[0];
        if (!stream) {
          resolve({});
          return;
        }

        const width = typeof stream.width === "number" ? stream.width : undefined;
        const height = typeof stream.height === "number" ? stream.height : undefined;
        let framerate = undefined;

        if (typeof stream.r_frame_rate === "string") {
          const parts = stream.r_frame_rate.split("/");
          if (parts.length === 2) {
            const num = parseFloat(parts[0]!);
            const den = parseFloat(parts[1]!);
            if (den !== 0 && !isNaN(num) && !isNaN(den)) {
              const fps = num / den;
              framerate = `${parseFloat(fps.toFixed(2))} fps`;
            }
          }
        }

        resolve({ width, height, framerate });
      } catch {
        resolve({});
      }
    });

    process.on("error", () => {
      resolve({});
    });
  });
}

// Interface for database rows
interface VideoRow {
  relative_path: string;
  main_video_path: string;
  thumbnail_path: string | null;
  metadata_path: string | null;
  metadata_json: string | null;
  clips_metadata_path: string | null;
  clips_metadata_json: string | null;
  width: number | null;
  height: number | null;
  framerate: string | null;
  mtime_ms: number;
  updated_at: number;
}

interface ClipRow {
  media_path: string;
  video_relative_path: string;
  metadata_json: string | null;
  mtime_ms: number;
}

interface MediaItemRow {
  relative_path: string;
  type: string;
  size_bytes: number;
  tags_json: string;
  mtime_ms: number;
}

/**
 * Synchronizes the filesystem video library state into the SQLite cache.
 */
export async function syncVaultCache(libraryRootPath: string): Promise<void> {
  const db = getVaultDb(libraryRootPath);

  // Discover video directories on disk
  const discoveredVideos: {
    directoryPath: string;
    videoRelPath: string;
    entries: DirectoryEntry[];
    mtimeMs: number;
  }[] = [];

  await findVideoDirs(libraryRootPath, libraryRootPath, discoveredVideos);

  const foundRelPaths = new Set<string>();

  for (const item of discoveredVideos) {
    foundRelPaths.add(item.videoRelPath);

    // Check existing db record
    const stmt = db.prepare("SELECT mtime_ms FROM videos WHERE relative_path = ?");
    const existing = stmt.get(item.videoRelPath) as { mtime_ms: number } | undefined;

    if (existing && existing.mtime_ms >= item.mtimeMs) {
      // Up to date
      continue;
    }

    // Need to read & probe video directory details
    const mainVideoPath = toForwardSlash(relative(libraryRootPath, join(item.directoryPath, "main.mp4")));

    const thumbnailExists = item.entries.some((e) => e.name === "thumbnail.jpg" && e.isFile());
    const thumbnailPath = thumbnailExists
      ? toForwardSlash(relative(libraryRootPath, join(item.directoryPath, "thumbnail.jpg")))
      : null;

    const metadataExists = item.entries.some((e) => e.name === "metadata.json" && e.isFile());
    const metadataPath = metadataExists
      ? toForwardSlash(relative(libraryRootPath, join(item.directoryPath, "metadata.json")))
      : null;

    let metadataJson: string | null = null;
    if (metadataExists) {
      try {
        const content = await readFile(join(item.directoryPath, "metadata.json"), "utf8");
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          metadataJson = JSON.stringify(parsed);
        }
      } catch {
        // Ignore read/parse error
      }
    }

    const clipsMetaExists = item.entries.some((e) => e.name === "clips.json" && e.isFile());
    const clipsMetadataPath = clipsMetaExists
      ? toForwardSlash(relative(libraryRootPath, join(item.directoryPath, "clips.json")))
      : null;

    let clipsMetadataJson: string | null = null;
    let clipsMetadataObj: JsonObject = {};
    if (clipsMetaExists) {
      try {
        const content = await readFile(join(item.directoryPath, "clips.json"), "utf8");
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          clipsMetadataJson = JSON.stringify(parsed);
          clipsMetadataObj = parsed as JsonObject;
        }
      } catch {
        // Ignore read/parse error
      }
    }

    // Probe main.mp4
    let width: number | undefined;
    let height: number | undefined;
    let framerate: string | undefined;

    try {
      const probed = await probeVideo(join(item.directoryPath, "main.mp4"));
      width = probed.width;
      height = probed.height;
      framerate = probed.framerate;
    } catch {
      // Ignore probe failures
    }

    const now = Date.now();

    // Insert or replace video entry
    const insertVideoStmt = db.prepare(`
      INSERT OR REPLACE INTO videos 
      (relative_path, main_video_path, thumbnail_path, metadata_path, metadata_json, clips_metadata_path, clips_metadata_json, width, height, framerate, mtime_ms, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertVideoStmt.run(
      item.videoRelPath,
      mainVideoPath,
      thumbnailPath,
      metadataPath,
      metadataJson,
      clipsMetadataPath,
      clipsMetadataJson,
      width ?? null,
      height ?? null,
      framerate ?? null,
      item.mtimeMs,
      now,
    );

    // Delete existing clips for this video in DB
    const deleteClipsStmt = db.prepare("DELETE FROM clips WHERE video_relative_path = ?");
    deleteClipsStmt.run(item.videoRelPath);

    // Read clips folder
    const clipsDirectory = item.entries.find((e) => e.name === "clips" && e.isDirectory());
    if (clipsDirectory) {
      const clips = await findClips(
        join(item.directoryPath, clipsDirectory.name),
        libraryRootPath,
        clipsMetadataObj,
      );

      const insertClipStmt = db.prepare(`
        INSERT OR REPLACE INTO clips (media_path, video_relative_path, metadata_json, mtime_ms)
        VALUES (?, ?, ?, ?)
      `);

      for (const clip of clips) {
        insertClipStmt.run(
          clip.mediaPath,
          item.videoRelPath,
          clip.metadata ? JSON.stringify(clip.metadata) : null,
          item.mtimeMs,
        );
      }
    }
  }

  // Purge removed videos from DB
  const allVideosStmt = db.prepare("SELECT relative_path FROM videos");
  const allVideoRows = allVideosStmt.all() as unknown as { relative_path: string }[];
  for (const row of allVideoRows) {
    if (!foundRelPaths.has(row.relative_path)) {
      db.prepare("DELETE FROM clips WHERE video_relative_path = ?").run(row.relative_path);
      db.prepare("DELETE FROM videos WHERE relative_path = ?").run(row.relative_path);
    }
  }
}

async function findVideoDirs(
  directoryPath: string,
  libraryRootPath: string,
  out: {
    directoryPath: string;
    videoRelPath: string;
    entries: DirectoryEntry[];
    mtimeMs: number;
  }[],
): Promise<void> {
  let entries: DirectoryEntry[];
  try {
    entries = (await readdir(directoryPath, { withFileTypes: true })) as DirectoryEntry[];
  } catch {
    return;
  }

  const mainVideo = entries.find((e) => e.name === "main.mp4" && e.isFile());
  const clipsDirectory = entries.find((e) => e.name === "clips" && e.isDirectory());
  const isVideoDir = mainVideo !== undefined && clipsDirectory !== undefined;

  if (isVideoDir) {
    const videoRelPath = toForwardSlash(relative(libraryRootPath, directoryPath)) || ".";

    // Compute max mtime of key files to detect changes
    let maxMtime = 0;
    try {
      const mainStat = await stat(join(directoryPath, "main.mp4"));
      maxMtime = Math.max(maxMtime, mainStat.mtimeMs);

      if (entries.some((e) => e.name === "metadata.json" && e.isFile())) {
        const metaStat = await stat(join(directoryPath, "metadata.json"));
        maxMtime = Math.max(maxMtime, metaStat.mtimeMs);
      }

      if (entries.some((e) => e.name === "clips.json" && e.isFile())) {
        const clipsStat = await stat(join(directoryPath, "clips.json"));
        maxMtime = Math.max(maxMtime, clipsStat.mtimeMs);
      }
    } catch {
      maxMtime = Date.now();
    }

    out.push({
      directoryPath,
      videoRelPath,
      entries,
      mtimeMs: maxMtime,
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isVideoDir && entry.name === "clips") continue;

    await findVideoDirs(join(directoryPath, entry.name), libraryRootPath, out);
  }
}

async function findClips(
  directoryPath: string,
  libraryRootPath: string,
  clipsMetadata: JsonObject = {},
): Promise<ScannedClip[]> {
  let entries: DirectoryEntry[];
  try {
    entries = (await readdir(directoryPath, { withFileTypes: true })) as DirectoryEntry[];
  } catch {
    return [];
  }

  const clips: ScannedClip[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      clips.push(...(await findClips(entryPath, libraryRootPath, clipsMetadata)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".mp4")) {
      continue;
    }

    const clipKey = entry.name.replace(/\.mp4$/u, "");
    const clip: ScannedClip = {
      mediaPath: toForwardSlash(relative(libraryRootPath, entryPath)),
    };

    if (Object.prototype.hasOwnProperty.call(clipsMetadata, clipKey)) {
      clip.metadata = clipsMetadata[clipKey] as JsonObject;
    }

    clips.push(clip);
  }

  return clips.sort((left, right) => left.mediaPath.localeCompare(right.mediaPath));
}

/**
 * Reads all cached videos from SQLite.
 */
export function getCachedVideos(libraryRootPath: string): ScannedVideo[] {
  const db = getVaultDb(libraryRootPath);

  const videoRows = db.prepare(`
    SELECT relative_path, main_video_path, thumbnail_path, metadata_path, metadata_json, clips_metadata_path, clips_metadata_json 
    FROM videos 
    ORDER BY relative_path ASC
  `).all() as unknown as VideoRow[];

  const clipRows = db.prepare(`
    SELECT media_path, video_relative_path, metadata_json 
    FROM clips 
    ORDER BY media_path ASC
  `).all() as unknown as ClipRow[];

  const clipsByVideo = new Map<string, ScannedClip[]>();
  for (const clipRow of clipRows) {
    const clip: ScannedClip = {
      mediaPath: clipRow.media_path,
    };
    if (clipRow.metadata_json) {
      try {
        clip.metadata = JSON.parse(clipRow.metadata_json);
      } catch {
        // Ignore JSON parse error
      }
    }
    const list = clipsByVideo.get(clipRow.video_relative_path) ?? [];
    list.push(clip);
    clipsByVideo.set(clipRow.video_relative_path, list);
  }

  return videoRows.map((v): ScannedVideo => {
    const video: ScannedVideo = {
      relativePath: v.relative_path,
      mainVideoPath: v.main_video_path,
      clips: clipsByVideo.get(v.relative_path) ?? [],
    };

    if (v.thumbnail_path) {
      video.thumbnailPath = v.thumbnail_path;
    }

    if (v.metadata_path) {
      video.metadataPath = v.metadata_path;
    }

    if (v.metadata_json) {
      try {
        video.metadata = JSON.parse(v.metadata_json);
      } catch {
        // Ignore
      }
    }

    if (v.clips_metadata_path) {
      video.clipsMetadataPath = v.clips_metadata_path;
    }

    return video;
  });
}

/**
 * Reads a single cached video detail from SQLite.
 */
export function getCachedVideoDetail(
  libraryRootPath: string,
  videoRelativePath: string,
): VideoDetail | null {
  const db = getVaultDb(libraryRootPath);

  const v = db.prepare(`
    SELECT relative_path, main_video_path, thumbnail_path, metadata_path, metadata_json, clips_metadata_path, clips_metadata_json, width, height, framerate 
    FROM videos 
    WHERE relative_path = ?
  `).get(videoRelativePath) as unknown as VideoRow | undefined;

  if (!v) return null;

  const clipRows = db.prepare(`
    SELECT media_path, metadata_json 
    FROM clips 
    WHERE video_relative_path = ? 
    ORDER BY media_path ASC
  `).all(videoRelativePath) as unknown as ClipRow[];

  const detailedClips: DetailedClip[] = clipRows.map((c): DetailedClip => {
    const clip: DetailedClip = {
      mediaPath: c.media_path,
    };
    if (c.metadata_json) {
      try {
        clip.metadata = JSON.parse(c.metadata_json);
      } catch {
        // Ignore
      }
    }
    return clip;
  });

  const video: VideoDetail = {
    relativePath: v.relative_path,
    mainVideoPath: v.main_video_path,
    clips: detailedClips,
  };

  if (v.thumbnail_path) {
    video.thumbnailPath = v.thumbnail_path;
  }

  if (v.clips_metadata_path) {
    video.clipsMetadataPath = v.clips_metadata_path;
  }

  if (v.metadata_json) {
    try {
      video.metadata = JSON.parse(v.metadata_json);
    } catch {
      // Ignore
    }
  }

  if (v.width !== null) video.width = v.width;
  if (v.height !== null) video.height = v.height;
  if (v.framerate !== null) video.framerate = v.framerate;

  return video;
}

/**
 * Synchronizes the media files (images, gifs, videos) into the media_items cache table.
 */
export async function syncMediaCache(libraryRootPath: string): Promise<void> {
  const db = getVaultDb(libraryRootPath);

  const mediaItems = await collectMedia(libraryRootPath, libraryRootPath);
  const foundRelPaths = new Set<string>();

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO media_items (relative_path, type, size_bytes, tags_json, mtime_ms)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const item of mediaItems) {
    foundRelPaths.add(item.relativePath);
    insertStmt.run(
      item.relativePath,
      item.type,
      item.sizeBytes,
      JSON.stringify(item.tags),
      item.mtimeMs,
    );
  }

  // Purge missing items
  const allMediaStmt = db.prepare("SELECT relative_path FROM media_items");
  const allRows = allMediaStmt.all() as unknown as { relative_path: string }[];
  for (const r of allRows) {
    if (!foundRelPaths.has(r.relative_path)) {
      db.prepare("DELETE FROM media_items WHERE relative_path = ?").run(r.relative_path);
    }
  }
}

interface InternalMediaItem extends ScannedMediaItem {
  mtimeMs: number;
}

async function collectMedia(
  dirPath: string,
  rootPath: string,
): Promise<InternalMediaItem[]> {
  let entries: DirectoryEntry[];
  try {
    entries = (await readdir(dirPath, { withFileTypes: true })) as DirectoryEntry[];
  } catch {
    return [];
  }

  const dirs: string[] = [];
  const filePromises: Promise<InternalMediaItem | null>[] = [];

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
        .then((fileStats): InternalMediaItem => {
          const relativePath = toForwardSlash(relative(rootPath, fullPath));
          return {
            relativePath,
            type,
            sizeBytes: fileStats.size,
            tags: extractTagsFromPath(relativePath),
            mtimeMs: fileStats.mtimeMs,
          };
        })
        .catch(() => null),
    );
  }

  const [fileResults, ...dirResults] = await Promise.all([
    Promise.all(filePromises),
    ...dirs.map((d) => collectMedia(d, rootPath)),
  ]);

  const items: InternalMediaItem[] = [];
  for (const r of fileResults) {
    if (r !== null) items.push(r);
  }
  for (const dirItems of dirResults) {
    items.push(...dirItems);
  }
  return items;
}

/**
 * Gets cached media items from SQLite.
 */
export function getCachedMediaItems(libraryRootPath: string): ScannedMediaItem[] {
  const db = getVaultDb(libraryRootPath);

  const rows = db.prepare(`
    SELECT relative_path, type, size_bytes, tags_json 
    FROM media_items
  `).all() as unknown as MediaItemRow[];

  return rows.map((r): ScannedMediaItem => ({
    relativePath: r.relative_path,
    type: r.type as ScannedMediaType,
    sizeBytes: r.size_bytes,
    tags: JSON.parse(r.tags_json),
  }));
}

/**
 * Cache mutation helpers to update SQLite synchronously on filesystem writes.
 */
export function updateVideoMetadataInCache(
  libraryRootPath: string,
  videoRelativePath: string,
  metadata: JsonObject,
): void {
  const db = getVaultDb(libraryRootPath);
  const metadataPath = videoRelativePath === "." ? "metadata.json" : `${videoRelativePath}/metadata.json`;
  db.prepare(`
    UPDATE videos 
    SET metadata_path = ?, metadata_json = ?, updated_at = ? 
    WHERE relative_path = ?
  `).run(metadataPath, JSON.stringify(metadata), Date.now(), videoRelativePath);
}

export function updateClipsMetadataInCache(
  libraryRootPath: string,
  videoRelativePath: string,
  clipMediaPath: string,
  clipMetadata: JsonObject,
  clipsJsonObj?: JsonObject,
): void {
  const db = getVaultDb(libraryRootPath);
  const clipsMetadataPath = videoRelativePath === "." ? "clips.json" : `${videoRelativePath}/clips.json`;

  if (clipsJsonObj) {
    db.prepare(`
      UPDATE videos 
      SET clips_metadata_path = ?, clips_metadata_json = ?, updated_at = ? 
      WHERE relative_path = ?
    `).run(clipsMetadataPath, JSON.stringify(clipsJsonObj), Date.now(), videoRelativePath);
  }

  db.prepare(`
    UPDATE clips 
    SET metadata_json = ? 
    WHERE media_path = ?
  `).run(JSON.stringify(clipMetadata), clipMediaPath);
}

export function removeClipFromCache(
  libraryRootPath: string,
  clipMediaPath: string,
  clipsJsonObj?: JsonObject,
  videoRelativePath?: string,
): void {
  const db = getVaultDb(libraryRootPath);
  db.prepare("DELETE FROM clips WHERE media_path = ?").run(clipMediaPath);

  if (clipsJsonObj && videoRelativePath) {
    const clipsMetadataPath = videoRelativePath === "." ? "clips.json" : `${videoRelativePath}/clips.json`;
    db.prepare(`
      UPDATE videos 
      SET clips_metadata_path = ?, clips_metadata_json = ?, updated_at = ? 
      WHERE relative_path = ?
    `).run(clipsMetadataPath, JSON.stringify(clipsJsonObj), Date.now(), videoRelativePath);
  }
}

export function removeVideoFromCache(
  libraryRootPath: string,
  videoRelativePath: string,
): void {
  const db = getVaultDb(libraryRootPath);
  db.prepare("DELETE FROM clips WHERE video_relative_path = ?").run(videoRelativePath);
  db.prepare("DELETE FROM videos WHERE relative_path = ?").run(videoRelativePath);
}

export function removeMediaItemFromCache(
  libraryRootPath: string,
  mediaRelativePath: string,
): void {
  const db = getVaultDb(libraryRootPath);
  db.prepare("DELETE FROM media_items WHERE relative_path = ?").run(mediaRelativePath);
}
