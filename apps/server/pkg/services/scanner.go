package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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

	dirParts := parts[:len(parts)-1]
	strippedRoot := false

	// 1. Strip project media root container (refvault_media / refVault_Media / media)
	if len(dirParts) > 0 {
		firstLower := strings.ToLower(dirParts[0])
		if firstLower == "refvault_media" || firstLower == "refvault_videos" || firstLower == "media" {
			dirParts = dirParts[1:]
			strippedRoot = true
		}
	}

	// 2. Strip media category subfolder (images / gifs / videos)
	if len(dirParts) > 0 {
		firstLower := strings.ToLower(dirParts[0])
		if firstLower == "images" || firstLower == "gifs" || firstLower == "videos" {
			dirParts = dirParts[1:]
			strippedRoot = true
		}
	}

	// 3. Fallback: if no recognized root container was stripped, strip top-level root directory
	if !strippedRoot && len(dirParts) > 1 {
		dirParts = dirParts[1:]
	}

	var tags []string
	var current string

	for _, segment := range dirParts {
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
	hasClipsDir := false
	var maxMtime int64

	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if !entry.IsDir() && name == "main.mp4" {
			hasMainMP4 = true
			if info, err := entry.Info(); err == nil {
				if info.ModTime().UnixMilli() > maxMtime {
					maxMtime = info.ModTime().UnixMilli()
				}
			}
		} else if entry.IsDir() && name == "clips" {
			hasClipsDir = true
		} else if !entry.IsDir() && (name == "metadata.json" || name == "clips.json") {
			if info, err := entry.Info(); err == nil {
				if info.ModTime().UnixMilli() > maxMtime {
					maxMtime = info.ModTime().UnixMilli()
				}
			}
		}
	}

	if hasMainMP4 && hasClipsDir {
		relPath, _ := filepath.Rel(rootPath, currentPath)
		results = append(results, discoveredVideo{
			dirPath:      currentPath,
			videoRelPath: toForwardSlash(relPath),
			mtimeMs:      maxMtime,
			entries:      entries,
		})
	}

	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && name != ".vault" && name != "node_modules" && name != "clips" && name != "refvault_media" && name != "refVault_Media" {
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

	videoRootDir := filepath.Join(libraryRoot, "refvault_videos")
	if _, err := os.Stat(videoRootDir); os.IsNotExist(err) {
		altVideoRootDir := filepath.Join(libraryRoot, "refVault_Videos")
		if info, err := os.Stat(altVideoRootDir); err == nil && info.IsDir() {
			videoRootDir = altVideoRootDir
		} else {
			videoRootDir = libraryRoot
		}
	}

	discovered, err := findVideoDirs(libraryRoot, videoRootDir)
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
	database.Exec("DELETE FROM clips WHERE video_relative_path = ?", videoRelPath)
	clipsDir := filepath.Join(videoDirPath, "clips")
	entries, err := os.ReadDir(clipsDir)
	if err != nil {
		return
	}

	clipsMetadataPath := filepath.Join(videoDirPath, "clips.json")
	var clipsMetadata map[string]interface{}
	if data, err := os.ReadFile(clipsMetadataPath); err == nil {
		_ = json.Unmarshal(data, &clipsMetadata)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		mType := inferMediaType(name)
		if mType == "video" || mType == "gif" {
			fullPath := filepath.Join(clipsDir, name)
			info, err := entry.Info()
			if err != nil {
				continue
			}
			mtime := info.ModTime().UnixMilli()

			relMedia, _ := filepath.Rel(libraryRoot, fullPath)
			mediaPathStr := toForwardSlash(relMedia)

			clipKey := strings.TrimSuffix(name, filepath.Ext(name))
			var metaJSON *string
			if clipsMetadata != nil {
				if metaObj, ok := clipsMetadata[clipKey]; ok {
					if bytes, err := json.Marshal(metaObj); err == nil {
						s := string(bytes)
						metaJSON = &s
					}
				}
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

// ResequenceSceneClips handles deleting scene_XX.mp4, resequencing remaining scene clips, updating clips.json & split_plan.json, and re-syncing cache.
func ResequenceSceneClips(libraryRoot, videoDirPath, videoRelPath, clipPath string) error {
	clipFileName := filepath.Base(clipPath)
	re := regexp.MustCompile(`(?i)^scene_(\d+)\.mp4$`)
	match := re.FindStringSubmatch(clipFileName)

	// Remove target clip file
	_ = os.Remove(clipPath)

	clipsMetadataPath := filepath.Join(videoDirPath, "clips.json")
	var clipsMetadata map[string]interface{}
	_ = ReadJSONFile(clipsMetadataPath, &clipsMetadata)
	if clipsMetadata == nil {
		clipsMetadata = make(map[string]interface{})
	}

	clipKey := strings.TrimSuffix(clipFileName, filepath.Ext(clipFileName))

	if match == nil {
		// Non-scene clip: just delete key from clips.json if present
		delete(clipsMetadata, clipKey)
		_ = WriteJSONFile(clipsMetadataPath, clipsMetadata)
		return SyncVaultCache(libraryRoot)
	}

	// Resequence scene clips
	var deletedIndex int
	fmt.Sscanf(match[1], "%d", &deletedIndex)
	clipsDir := filepath.Dir(clipPath)

	entries, _ := os.ReadDir(clipsDir)
	var remainingIndices []int
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if m := re.FindStringSubmatch(entry.Name()); m != nil {
			var idx int
			fmt.Sscanf(m[1], "%d", &idx)
			if idx > deletedIndex {
				remainingIndices = append(remainingIndices, idx)
			}
		}
	}

	sort.Ints(remainingIndices)

	for _, idx := range remainingIndices {
		oldName := fmt.Sprintf("scene_%02d.mp4", idx)
		newName := fmt.Sprintf("scene_%02d.mp4", idx-1)
		_ = os.Rename(filepath.Join(clipsDir, oldName), filepath.Join(clipsDir, newName))
	}

	// Update clips.json keys
	updatedMetadata := make(map[string]interface{})
	keyRe := regexp.MustCompile(`(?i)^scene_(\d+)$`)
	for k, v := range clipsMetadata {
		if m := keyRe.FindStringSubmatch(k); m != nil {
			var idx int
			fmt.Sscanf(m[1], "%d", &idx)
			if idx == deletedIndex {
				continue
			} else if idx > deletedIndex {
				newKey := fmt.Sprintf("scene_%02d", idx-1)
				updatedMetadata[newKey] = v
			} else {
				updatedMetadata[k] = v
			}
		} else {
			updatedMetadata[k] = v
		}
	}
	_ = WriteJSONFile(clipsMetadataPath, updatedMetadata)

	// Sync split_plan.json if exists
	splitPlanPath := filepath.Join(videoDirPath, "split_plan.json")
	var splitPlan map[string]interface{}
	if err := ReadJSONFile(splitPlanPath, &splitPlan); err == nil && splitPlan != nil {
		if segsRaw, ok := splitPlan["segments"].([]interface{}); ok && len(segsRaw) > 0 {
			segmentIndex := deletedIndex - 1
			if segmentIndex >= 0 && segmentIndex < len(segsRaw) {
				splitPlan["segments"] = append(segsRaw[:segmentIndex], segsRaw[segmentIndex+1:]...)
				_ = WriteJSONFile(splitPlanPath, splitPlan)
			}
		}
	}

	return SyncVaultCache(libraryRoot)
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

	mediaRootDir := filepath.Join(libraryRoot, "refvault_media")
	if _, err := os.Stat(mediaRootDir); os.IsNotExist(err) {
		altMediaRootDir := filepath.Join(libraryRoot, "refVault_Media")
		if info, err := os.Stat(altMediaRootDir); err == nil && info.IsDir() {
			mediaRootDir = altMediaRootDir
		} else {
			mediaRootDir = libraryRoot
		}
	}

	foundPaths := make(map[string]bool)

	err = filepath.WalkDir(mediaRootDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if d.IsDir() {
			name := d.Name()
			if name == ".vault" || name == "node_modules" || name == ".git" || name == "refvault_videos" || name == "refVault_Videos" {
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
