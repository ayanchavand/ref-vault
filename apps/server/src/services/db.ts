import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dbCache = new Map<string, DatabaseSync>();

export function getVaultDb(libraryRootPath: string): DatabaseSync {
  const existingDb = dbCache.get(libraryRootPath);
  if (existingDb) {
    return existingDb;
  }

  const vaultDir = join(libraryRootPath, ".vault");
  mkdirSync(vaultDir, { recursive: true });

  const dbPath = join(vaultDir, "cache.db");
  const db = new DatabaseSync(dbPath);

  // Optimizations for fast embedded operations
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  // Initialize tables and indices
  db.exec(`
    CREATE TABLE IF NOT EXISTS library_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS videos (
      relative_path TEXT PRIMARY KEY,
      main_video_path TEXT NOT NULL,
      thumbnail_path TEXT,
      metadata_path TEXT,
      metadata_json TEXT,
      clips_metadata_path TEXT,
      clips_metadata_json TEXT,
      width INTEGER,
      height INTEGER,
      framerate TEXT,
      mtime_ms INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clips (
      media_path TEXT PRIMARY KEY,
      video_relative_path TEXT NOT NULL,
      metadata_json TEXT,
      mtime_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      relative_path TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      tags_json TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clips_video ON clips(video_relative_path);
    CREATE INDEX IF NOT EXISTS idx_media_type ON media_items(type);
  `);

  dbCache.set(libraryRootPath, db);
  return db;
}
