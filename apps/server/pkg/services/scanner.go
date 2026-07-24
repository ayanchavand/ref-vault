package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"reference-vault/server/pkg/db"
	"reference-vault/server/pkg/models"
)

func toForwardSlash(p string) string {
	return filepath.ToSlash(p)
}

func inferMediaType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".gif" {
		return "gif"
	}
	if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
		return "video"
	}
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".avif" {
		return "image"
	}
	return ""
}

func ExtractTagsFromPath(relativePath string) []string {
	parts := strings.Split(toForwardSlash(relativePath), "/")
	if len(parts) <= 2 {
		return []string{}
	}

	intermediate := parts[1 : len(parts)-1]
	var tags []string
	var current string

	for _, segment := range intermediate {
		if segment == "" {
			continue
		}
		if current == "" {
			current = segment
		} else {
			current = current + "/" + segment
		}
		tags = append(tags, current)
	}

	return tags
}

type discoveredVideo struct {
	dirPath      string
	videoRelPath string
	mtimeMs      int64
	entries      []os.DirEntry
}

func findVideoDirs(rootPath, currentPath string) ([]discoveredVideo, error) {
	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil, err
	}

	var results []discoveredVideo
	hasMainMP4 := false
	var dirMtime int64

	for _, entry := range entries {
		if !entry.IsDir() && strings.ToLower(entry.Name()) == "main.mp4" {
			hasMainMP4 = true
			if info, err := entry.Info(); err == nil {
				dirMtime = info.ModTime().UnixMilli()
			}
		}
	}

	if hasMainMP4 {
		relPath, _ := filepath.Rel(rootPath, currentPath)
		results = append(results, discoveredVideo{
			dirPath:      currentPath,
			videoRelPath: toForwardSlash(relPath),
			mtimeMs:      dirMtime,
			entries:      entries,
		})
	}

	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != ".vault" && entry.Name() != "node_modules" {
			subResults, err := findVideoDirs(rootPath, filepath.Join(currentPath, entry.Name()))
			if err == nil {
				results = append(results, subResults...)
			}
		}
	}

	return results, nil
}

// SyncVaultCache scans disk video directories and updates SQLite cache.
func SyncVaultCache(libraryRoot string) error {
	database, err := db.GetVaultDb(libraryRoot)
	if err != nil {
		return err
	}

	discovered, err := findVideoDirs(libraryRoot, libraryRoot)
	if err != nil {
		return fmt.Errorf("failed scanning video directories: %w", err)
	}

	foundRelPaths := make(map[string]bool)

	for _, v := range discovered {
		foundRelPaths[v.videoRelPath] = true

		var existingMtime int64
		err := database.QueryRow("SELECT mtime_ms FROM videos WHERE relative_path = ?", v.videoRelPath).Scan(&existingMtime)

		if err == nil && existingMtime >= v.mtimeMs {
			continue
		}

		mainVideoPath := toForwardSlash(filepath.Join(v.videoRelPath, "main.mp4"))

		var thumbnailPath *string
		var metadataPath *string
		var metadataJSON *string
		var clipsMetadataPath *string
		var clipsMetadataJSON *string

		for _, entry := range v.entries {
			name := entry.Name()
			if !entry.IsDir() {
				if name == "thumbnail.jpg" {
					str := toForwardSlash(filepath.Join(v.videoRelPath, "thumbnail.jpg"))
					thumbnailPath = &str
				} else if name == "metadata.json" {
					str := toForwardSlash(filepath.Join(v.videoRelPath, "metadata.json"))
					metadataPath = &str
					if data, err := os.ReadFile(filepath.Join(v.dirPath, "metadata.json")); err == nil {
						s := string(data)
						metadataJSON = &s
					}
				} else if name == "clips.json" {
					str := toForwardSlash(filepath.Join(v.videoRelPath, "clips.json"))
					clipsMetadataPath = &str
					if data, err := os.ReadFile(filepath.Join(v.dirPath, "clips.json")); err == nil {
						s := string(data)
						clipsMetadataJSON = &s
					}
				}
			}
		}

		probe, _ := ProbeVideo(filepath.Join(v.dirPath, "main.mp4"))
		now := time.Now().UnixMilli()

		_, err = database.Exec(`
			INSERT INTO videos (
				relative_path, main_video_path, thumbnail_path, metadata_path, metadata_json,
				clips_metadata_path, clips_metadata_json, width, height, framerate, mtime_ms, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(relative_path) DO UPDATE SET
				main_video_path = excluded.main_video_path,
				thumbnail_path = excluded.thumbnail_path,
				metadata_path = excluded.metadata_path,
				metadata_json = excluded.metadata_json,
				clips_metadata_path = excluded.clips_metadata_path,
				clips_metadata_json = excluded.clips_metadata_json,
				width = excluded.width,
				height = excluded.height,
				framerate = excluded.framerate,
				mtime_ms = excluded.mtime_ms,
				updated_at = excluded.updated_at
		`, v.videoRelPath, mainVideoPath, thumbnailPath, metadataPath, metadataJSON,
			clipsMetadataPath, clipsMetadataJSON, probe.Width, probe.Height, probe.Framerate, v.mtimeMs, now)

		if err != nil {
			fmt.Printf("Error inserting video into sqlite: %v\n", err)
		}

		// Scan clips inside video directory
		scanClipsForVideo(database, libraryRoot, v.dirPath, v.videoRelPath)
	}

	// Clean up stale video records in DB
	rows, err := database.Query("SELECT relative_path FROM videos")
	if err == nil {
		defer rows.Close()
		var stale []string
		for rows.Next() {
			var rel string
			if err := rows.Scan(&rel); err == nil {
				if !foundRelPaths[rel] {
					stale = append(stale, rel)
				}
			}
		}
		for _, rel := range stale {
			database.Exec("DELETE FROM videos WHERE relative_path = ?", rel)
			database.Exec("DELETE FROM clips WHERE video_relative_path = ?", rel)
		}
	}

	return nil
}

func scanClipsForVideo(database *sql.DB, libraryRoot, videoDirPath, videoRelPath string) {
	clipsDir := filepath.Join(videoDirPath, "clips")
	entries, err := os.ReadDir(clipsDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if inferMediaType(name) != "" {
			fullPath := filepath.Join(clipsDir, name)
			info, err := entry.Info()
			if err != nil {
				continue
			}
			mtime := info.ModTime().UnixMilli()

			relMedia, _ := filepath.Rel(libraryRoot, fullPath)
			mediaPathStr := toForwardSlash(relMedia)

			// Look for matching json
			metaName := strings.TrimSuffix(name, filepath.Ext(name)) + ".json"
			metaFullPath := filepath.Join(clipsDir, metaName)
			var metaJSON *string
			if data, err := os.ReadFile(metaFullPath); err == nil {
				s := string(data)
				metaJSON = &s
			}

			database.Exec(`
				INSERT INTO clips (media_path, video_relative_path, metadata_json, mtime_ms)
				VALUES (?, ?, ?, ?)
				ON CONFLICT(media_path) DO UPDATE SET
					video_relative_path = excluded.video_relative_path,
					metadata_json = excluded.metadata_json,
					mtime_ms = excluded.mtime_ms
			`, mediaPathStr, videoRelPath, metaJSON, mtime)
		}
	}
}

// GetCachedVideos fetches all scanned videos and clips from SQLite cache.
func GetCachedVideos(libraryRoot string) ([]models.ScannedVideo, error) {
	database, err := db.GetVaultDb(libraryRoot)
	if err != nil {
		return nil, err
	}

	rows, err := database.Query(`
		SELECT relative_path, main_video_path, thumbnail_path, metadata_path, metadata_json, clips_metadata_path
		FROM videos
		ORDER BY relative_path ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []models.ScannedVideo

	for rows.Next() {
		var v models.ScannedVideo
		var thumb, metaP, metaJ, clipsP sql.NullString

		if err := rows.Scan(&v.RelativePath, &v.MainVideoPath, &thumb, &metaP, &metaJ, &clipsP); err != nil {
			continue
		}

		if thumb.Valid {
			v.ThumbnailPath = thumb.String
		}
		if metaP.Valid {
			v.MetadataPath = metaP.String
		}
		if metaJ.Valid {
			var m map[string]interface{}
			if err := json.Unmarshal([]byte(metaJ.String), &m); err == nil {
				v.Metadata = m
			}
		}
		if clipsP.Valid {
			v.ClipsMetadataPath = clipsP.String
		}

		// Query clips for video
		clipRows, err := database.Query("SELECT media_path, metadata_json FROM clips WHERE video_relative_path = ?", v.RelativePath)
		if err == nil {
			var clips []models.ScannedClip
			for clipRows.Next() {
				var c models.ScannedClip
				var cMetaJ sql.NullString
				if err := clipRows.Scan(&c.MediaPath, &cMetaJ); err == nil {
					if cMetaJ.Valid {
						var cm map[string]interface{}
						if err := json.Unmarshal([]byte(cMetaJ.String), &cm); err == nil {
							c.Metadata = cm
						}
					}
					clips = append(clips, c)
				}
			}
			clipRows.Close()
			v.Clips = clips
		}
		if v.Clips == nil {
			v.Clips = []models.ScannedClip{}
		}

		result = append(result, v)
	}

	return result, nil
}

// SyncMediaCache scans all media items in library and populates media_items SQLite table.
func SyncMediaCache(libraryRoot string) error {
	database, err := db.GetVaultDb(libraryRoot)
	if err != nil {
		return err
	}

	foundPaths := make(map[string]bool)

	err = filepath.WalkDir(libraryRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			name := d.Name()
			if name == ".vault" || name == "node_modules" || name == ".git" {
				return filepath.SkipDir
			}
			return nil
		}

		mType := inferMediaType(d.Name())
		if mType == "" {
			return nil
		}

		relPath, _ := filepath.Rel(libraryRoot, path)
		forwardRel := toForwardSlash(relPath)
		foundPaths[forwardRel] = true

		info, err := d.Info()
		if err != nil {
			return nil
		}

		tags := ExtractTagsFromPath(forwardRel)
		tagsBytes, _ := json.Marshal(tags)

		_, err = database.Exec(`
			INSERT INTO media_items (relative_path, type, size_bytes, tags_json, mtime_ms)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(relative_path) DO UPDATE SET
				type = excluded.type,
				size_bytes = excluded.size_bytes,
				tags_json = excluded.tags_json,
				mtime_ms = excluded.mtime_ms
		`, forwardRel, mType, info.Size(), string(tagsBytes), info.ModTime().UnixMilli())

		return nil
	})

	if err != nil {
		return err
	}

	// Purge deleted items
	rows, err := database.Query("SELECT relative_path FROM media_items")
	if err == nil {
		defer rows.Close()
		var stale []string
		for rows.Next() {
			var rel string
			if err := rows.Scan(&rel); err == nil {
				if !foundPaths[rel] {
					stale = append(stale, rel)
				}
			}
		}
		for _, rel := range stale {
			database.Exec("DELETE FROM media_items WHERE relative_path = ?", rel)
		}
	}

	return nil
}

// GetCachedMediaItems returns scanned media items shuffled for Tinder-style browser.
func GetCachedMediaItems(libraryRoot string) ([]models.ScannedMediaItem, error) {
	database, err := db.GetVaultDb(libraryRoot)
	if err != nil {
		return nil, err
	}

	rows, err := database.Query("SELECT relative_path, type, size_bytes, tags_json FROM media_items")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.ScannedMediaItem

	for rows.Next() {
		var item models.ScannedMediaItem
		var tagsJ string

		if err := rows.Scan(&item.RelativePath, &item.Type, &item.SizeBytes, &tagsJ); err == nil {
			var tags []string
			_ = json.Unmarshal([]byte(tagsJ), &tags)
			item.Tags = tags
			if item.Tags == nil {
				item.Tags = []string{}
			}
			items = append(items, item)
		}
	}

	// Shuffle
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(items), func(i, j int) {
		items[i], items[j] = items[j], items[i]
	})

	return items, nil
}
