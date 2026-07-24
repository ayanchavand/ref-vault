package services

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"reference-vault/server/pkg/models"
)

func TestExtractTagsFromPath(t *testing.T) {
	tags := ExtractTagsFromPath("category/sub/video/main.mp4")
	expected := []string{"sub", "sub/video"}
	if !reflect.DeepEqual(tags, expected) {
		t.Errorf("Expected tags %v, got %v", expected, tags)
	}

	deepTags := ExtractTagsFromPath("root/a/b/c/file.mp4")
	expectedDeep := []string{"a", "a/b", "a/b/c"}
	if !reflect.DeepEqual(deepTags, expectedDeep) {
		t.Errorf("Expected deep tags %v, got %v", expectedDeep, deepTags)
	}
}

func TestWriteAndReadJSONFile(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "test.json")

	type Sample struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}

	written := Sample{Name: "vault", Count: 42}
	if err := WriteJSONFile(filePath, written); err != nil {
		t.Fatalf("Failed writing json: %v", err)
	}

	var read Sample
	if err := ReadJSONFile(filePath, &read); err != nil {
		t.Fatalf("Failed reading json: %v", err)
	}

	if read != written {
		t.Errorf("Expected %v, got %v", written, read)
	}
}

func TestGetAndSaveLibraryConfig(t *testing.T) {
	tempDir := t.TempDir()

	cfg, err := GetLibraryConfig(tempDir)
	if err != nil {
		t.Fatalf("Failed getting default library config: %v", err)
	}
	if len(cfg.Fields) != 0 {
		t.Errorf("Expected empty default fields, got %d", len(cfg.Fields))
	}

	newCfg := models.LibraryConfig{
		Fields: []models.LibraryConfigField{
			{Name: "genre", Type: "video", IsMulti: true, Values: []string{"rock", "pop"}},
		},
	}
	if err := SaveLibraryConfig(tempDir, newCfg); err != nil {
		t.Fatalf("Failed saving library config: %v", err)
	}

	// Verify library.json is written into refvault_videos directory
	expectedPath := filepath.Join(tempDir, "refvault_videos", "library.json")
	if _, err := os.Stat(expectedPath); err != nil {
		t.Errorf("Expected library.json at %s, but stat failed: %v", expectedPath, err)
	}

	loaded, err := GetLibraryConfig(tempDir)
	if err != nil {
		t.Fatalf("Failed reloading config: %v", err)
	}
	if len(loaded.Fields) != 1 || loaded.Fields[0].Name != "genre" {
		t.Errorf("Unexpected loaded config: %v", loaded)
	}

	// Test fallback reading from root library.json
	fallbackDir := t.TempDir()
	rootJson := filepath.Join(fallbackDir, "library.json")
	_ = WriteJSONFile(rootJson, newCfg)
	fallbackLoaded, err := GetLibraryConfig(fallbackDir)
	if err != nil {
		t.Fatalf("Failed loading fallback root config: %v", err)
	}
	if len(fallbackLoaded.Fields) != 1 || fallbackLoaded.Fields[0].Name != "genre" {
		t.Errorf("Unexpected fallback loaded config: %v", fallbackLoaded)
	}
}

func TestSyncAndGetCachedVideos(t *testing.T) {
	tempDir := t.TempDir()

	videoDir := filepath.Join(tempDir, "test-vid")
	clipsDir := filepath.Join(videoDir, "clips")
	_ = os.MkdirAll(clipsDir, 0755)
	_ = os.WriteFile(filepath.Join(videoDir, "main.mp4"), []byte("fake mp4 data"), 0644)
	_ = os.WriteFile(filepath.Join(videoDir, "metadata.json"), []byte(`{"title":"Test"}`), 0644)
	_ = os.WriteFile(filepath.Join(clipsDir, "scene_01.mp4"), []byte("clip mp4"), 0644)
	_ = os.WriteFile(filepath.Join(clipsDir, "scene_01.jpg"), []byte("clip thumbnail jpg"), 0644)

	if err := SyncVaultCache(tempDir); err != nil {
		t.Fatalf("SyncVaultCache failed: %v", err)
	}

	videos, err := GetCachedVideos(tempDir)
	if err != nil {
		t.Fatalf("GetCachedVideos failed: %v", err)
	}

	if len(videos) != 1 {
		t.Fatalf("Expected 1 video, got %d", len(videos))
	}
	if videos[0].RelativePath != "test-vid" {
		t.Errorf("Expected relative path test-vid, got %s", videos[0].RelativePath)
	}
	if len(videos[0].Clips) != 1 {
		t.Fatalf("Expected exactly 1 clip (scene_01.mp4), got %d", len(videos[0].Clips))
	}
	if videos[0].Clips[0].MediaPath != "test-vid/clips/scene_01.mp4" {
		t.Errorf("Expected clip path test-vid/clips/scene_01.mp4, got %s", videos[0].Clips[0].MediaPath)
	}
}

func TestSyncAndGetCachedMediaItems(t *testing.T) {
	tempDir := t.TempDir()

	mediaDir := filepath.Join(tempDir, "nature", "animals")
	_ = os.MkdirAll(mediaDir, 0755)
	_ = os.WriteFile(filepath.Join(mediaDir, "lion.jpg"), []byte("jpg content"), 0644)
	_ = os.WriteFile(filepath.Join(mediaDir, "clip.webm"), []byte("webm content"), 0644)

	if err := SyncMediaCache(tempDir); err != nil {
		t.Fatalf("SyncMediaCache failed: %v", err)
	}

	items, err := GetCachedMediaItems(tempDir)
	if err != nil {
		t.Fatalf("GetCachedMediaItems failed: %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("Expected 2 media items, got %d", len(items))
	}
}
