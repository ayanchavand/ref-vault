package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"reference-vault/server/pkg/models"
)

// ReadJSONFile reads and unmarshals any JSON file into target struct/map.
func ReadJSONFile(filePath string, target interface{}) error {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

// WriteJSONFile marshals and writes target struct/map as formatted JSON atomically.
func WriteJSONFile(filePath string, target interface{}) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create parent directories for %s: %w", filePath, err)
	}

	data, err := json.MarshalIndent(target, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal json: %w", err)
	}
	data = append(data, '\n')

	tmpFile, err := os.CreateTemp(dir, fmt.Sprintf(".%s.*.tmp", filepath.Base(filePath)))
	if err != nil {
		return fmt.Errorf("failed to create temp json file in %s: %w", dir, err)
	}
	tmpName := tmpFile.Name()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return fmt.Errorf("failed to write temp json file %s: %w", tmpName, err)
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("failed to close temp json file %s: %w", tmpName, err)
	}

	if err := os.Rename(tmpName, filePath); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("failed to rename temp json file to %s: %w", filePath, err)
	}

	return nil
}

// resolveLibraryConfigReadPath determines the path to read library.json from.
// It checks for refvault_videos/library.json (or refVault_Videos/library.json),
// directly inside libraryRoot if it is a video folder,
// and falls back to libraryRoot/library.json if present.
func resolveLibraryConfigReadPath(libraryRoot string) string {
	v1 := filepath.Join(libraryRoot, "refvault_videos", "library.json")
	if _, err := os.Stat(v1); err == nil {
		return v1
	}

	v2 := filepath.Join(libraryRoot, "refVault_Videos", "library.json")
	if _, err := os.Stat(v2); err == nil {
		return v2
	}

	base := filepath.Base(libraryRoot)
	if base == "refvault_videos" || base == "refVault_Videos" {
		vSelf := filepath.Join(libraryRoot, "library.json")
		if _, err := os.Stat(vSelf); err == nil {
			return vSelf
		}
	}

	rootConfig := filepath.Join(libraryRoot, "library.json")
	if _, err := os.Stat(rootConfig); err == nil {
		return rootConfig
	}

	if base == "refvault_videos" || base == "refVault_Videos" {
		return filepath.Join(libraryRoot, "library.json")
	}
	return v1
}

// resolveLibraryConfigWritePath determines where to save library.json.
// It targets the video folder (refvault_videos or refVault_Videos) inside libraryRoot.
func resolveLibraryConfigWritePath(libraryRoot string) string {
	base := filepath.Base(libraryRoot)
	if base == "refvault_videos" || base == "refVault_Videos" {
		return filepath.Join(libraryRoot, "library.json")
	}

	v2 := filepath.Join(libraryRoot, "refVault_Videos")
	if info, err := os.Stat(v2); err == nil && info.IsDir() {
		return filepath.Join(v2, "library.json")
	}

	v1 := filepath.Join(libraryRoot, "refvault_videos")
	return filepath.Join(v1, "library.json")
}

// GetLibraryConfig reads library.json or returns default empty fields config.
func GetLibraryConfig(libraryRoot string) (models.LibraryConfig, error) {
	configPath := resolveLibraryConfigReadPath(libraryRoot)
	var cfg models.LibraryConfig

	err := ReadJSONFile(configPath, &cfg)
	if os.IsNotExist(err) {
		return models.LibraryConfig{Fields: []models.LibraryConfigField{}}, nil
	} else if err != nil {
		return models.LibraryConfig{Fields: []models.LibraryConfigField{}}, err
	}

	if cfg.Fields == nil {
		cfg.Fields = []models.LibraryConfigField{}
	}
	return cfg, nil
}

// SaveLibraryConfig saves config to library.json in the video folder.
func SaveLibraryConfig(libraryRoot string, cfg models.LibraryConfig) error {
	configPath := resolveLibraryConfigWritePath(libraryRoot)
	return WriteJSONFile(configPath, cfg)
}

