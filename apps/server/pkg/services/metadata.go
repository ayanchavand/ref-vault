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

// GetLibraryConfig reads library.json or returns default empty fields config.
func GetLibraryConfig(libraryRoot string) (models.LibraryConfig, error) {
	configPath := filepath.Join(libraryRoot, "library.json")
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

// SaveLibraryConfig saves config to library.json.
func SaveLibraryConfig(libraryRoot string, cfg models.LibraryConfig) error {
	configPath := filepath.Join(libraryRoot, "library.json")
	return WriteJSONFile(configPath, cfg)
}

