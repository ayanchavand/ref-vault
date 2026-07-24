package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite"
)

var (
	dbCache = make(map[string]*sql.DB)
	mu      sync.Mutex
)

// GetVaultDb returns a cached *sql.DB connection pool for the given library root.
func GetVaultDb(libraryRootPath string) (*sql.DB, error) {
	mu.Lock()
	defer mu.Unlock()

	cleanRoot := filepath.ToSlash(filepath.Clean(libraryRootPath))
	if db, ok := dbCache[cleanRoot]; ok {
		return db, nil
	}

	vaultDir := filepath.Join(cleanRoot, ".vault")
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create .vault directory: %w", err)
	}

	dbPath := filepath.Join(vaultDir, "cache.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db at %s: %w", dbPath, err)
	}

	// Enable WAL mode & optimizations
	if _, err := db.Exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to set sqlite pragmas: %w", err)
	}

	// Schema setup
	schema := `
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
	`

	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to create sqlite tables: %w", err)
	}

	dbCache[cleanRoot] = db
	return db, nil
}
