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

// WriteJSONFile marshals and writes target struct/map as formatted JSON.
func WriteJSONFile(filePath string, target interface{}) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create parent directories for %s: %w", filePath, err)
	}

	data, err := json.MarshalIndent(target, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal json: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write json file %s: %w", filePath, err)
	}

	return nil
}

// GetLibraryConfig reads .vault/config.json or returns default empty fields config.
func GetLibraryConfig(libraryRoot string) (models.LibraryConfig, error) {
	configPath := filepath.Join(libraryRoot, ".vault", "config.json")
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

// SaveLibraryConfig saves config to .vault/config.json.
func SaveLibraryConfig(libraryRoot string, cfg models.LibraryConfig) error {
	configPath := filepath.Join(libraryRoot, ".vault", "config.json")
	return WriteJSONFile(configPath, cfg)
}
