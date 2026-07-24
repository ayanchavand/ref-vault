package db

import (
	"path/filepath"
	"testing"
)

func TestGetVaultDb(t *testing.T) {
	tempDir := t.TempDir()

	database, err := GetVaultDb(tempDir)
	if err != nil {
		t.Fatalf("GetVaultDb failed: %v", err)
	}

	if database == nil {
		t.Fatal("Expected non-nil database instance")
	}

	// Verify caching - calling again returns same database pointer
	cachedDb, err := GetVaultDb(tempDir)
	if err != nil {
		t.Fatalf("GetVaultDb cached call failed: %v", err)
	}

	if database != cachedDb {
		t.Error("Expected GetVaultDb to return cached instance for same root path")
	}

	// Verify tables were created
	var tableName string
	err = database.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'").Scan(&tableName)
	if err != nil || tableName != "videos" {
		t.Errorf("Expected 'videos' table to exist, got %v", err)
	}

	dbPath := filepath.Join(tempDir, ".vault", "cache.db")
	_ = dbPath
}
