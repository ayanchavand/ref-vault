package routes

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"reference-vault/server/pkg/db"
	"reference-vault/server/pkg/models"
	"reference-vault/server/pkg/services"
)

func sendJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func sendError(w http.ResponseWriter, status int, code, msg, path string) {
	sendJSON(w, status, models.ApiErrorResponse{
		Error:   code,
		Message: msg,
		Path:    path,
	})
}

func isContained(root, target string) bool {
	rel, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return rel != "" && !strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel)
}

func RegisterRoutes(r chi.Router, webDistPath string) {
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api/library", func(r chi.Router) {
		// Validate root
		r.Post("/validate-root", func(w http.ResponseWriter, r *http.Request) {
			var req models.ValidateLibraryRootRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid request body", "")
				return
			}
			abs, err := filepath.Abs(req.RootPath)
			if err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid root path", req.RootPath)
				return
			}
			info, err := os.Stat(abs)
			if err != nil || !info.IsDir() {
				sendError(w, http.StatusNotFound, "LIBRARY_ROOT_NOT_FOUND", "Library root directory does not exist", req.RootPath)
				return
			}
			sendJSON(w, http.StatusOK, models.ValidateLibraryRootResponse{RootPath: filepath.ToSlash(abs)})
		})

		// Init library
		r.Post("/init", func(w http.ResponseWriter, r *http.Request) {
			var req models.InitLibraryRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid request body", "")
				return
			}
			videoDir := filepath.Join(req.TargetPath, "video")
			mediaDir := filepath.Join(req.TargetPath, "media")

			if err := os.MkdirAll(videoDir, 0755); err != nil {
				sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", "Failed creating video directory", req.TargetPath)
				return
			}
			if err := os.MkdirAll(mediaDir, 0755); err != nil {
				sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", "Failed creating media directory", req.TargetPath)
				return
			}
			sendJSON(w, http.StatusOK, models.InitLibraryResponse{
				Success:   true,
				VideoPath: filepath.ToSlash(videoDir),
				MediaPath: filepath.ToSlash(mediaDir),
			})
		})

		// Scan library
		r.Post("/scan", func(w http.ResponseWriter, r *http.Request) {
			var req models.ScanLibraryRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid request body", "")
				return
			}
			if err := services.SyncVaultCache(req.RootPath); err != nil {
				sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), req.RootPath)
				return
			}
			videos, err := services.GetCachedVideos(req.RootPath)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), req.RootPath)
				return
			}
			sendJSON(w, http.StatusOK, models.ScanLibraryResponse{
				RootPath: filepath.ToSlash(req.RootPath),
				Videos:   videos,
			})
		})

		// Scan media
		r.Post("/scan-media", func(w http.ResponseWriter, r *http.Request) {
			var req models.ScanMediaRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid request body", "")
				return
			}
			if err := services.SyncMediaCache(req.RootPath); err != nil {
				sendError(w, http.StatusInternalServerError, "MEDIA_SCAN_FAILED", err.Error(), req.RootPath)
				return
			}
			items, err := services.GetCachedMediaItems(req.RootPath)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "MEDIA_SCAN_FAILED", err.Error(), req.RootPath)
				return
			}
			sendJSON(w, http.StatusOK, models.ScanMediaResponse{
				RootPath: filepath.ToSlash(req.RootPath),
				Items:    items,
			})
		})

		// Stream media file
		r.Get("/media-file", func(w http.ResponseWriter, r *http.Request) {
			rootPath := r.URL.Query().Get("rootPath")
			relPath := r.URL.Query().Get("relativePath")

			if rootPath == "" || relPath == "" {
				sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Missing rootPath or relativePath", "")
				return
			}

			fullPath := filepath.Join(rootPath, relPath)
			if !isContained(rootPath, fullPath) {
				sendError(w, http.StatusForbidden, "INVALID_VIDEO_PATH", "Path outside library root", relPath)
				return
			}

			info, err := os.Stat(fullPath)
			if err != nil || info.IsDir() {
				sendError(w, http.StatusNotFound, "MEDIA_NOT_FOUND", "File not found", relPath)
				return
			}

			http.ServeFile(w, r, fullPath)
		})

		// Video Detail
		r.Get("/video-detail", func(w http.ResponseWriter, r *http.Request) {
			rootPath := r.URL.Query().Get("rootPath")
			videoRel := r.URL.Query().Get("videoRelativePath")

			videos, err := services.GetCachedVideos(rootPath)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), videoRel)
				return
			}

			for _, v := range videos {
				if v.RelativePath == videoRel {
					detail := models.VideoDetail{
						RelativePath:      v.RelativePath,
						MainVideoPath:     v.MainVideoPath,
						Metadata:          v.Metadata,
						ThumbnailPath:     v.ThumbnailPath,
						ClipsMetadataPath: v.ClipsMetadataPath,
						Clips:             v.Clips,
					}

					// Fetch width/height/framerate from DB
					if database, err := db.GetVaultDb(rootPath); err == nil {
						var wInt, hInt sql.NullInt64
						var fr sql.NullString
						_ = database.QueryRow("SELECT width, height, framerate FROM videos WHERE relative_path = ?", videoRel).Scan(&wInt, &hInt, &fr)
						if wInt.Valid {
							val := int(wInt.Int64)
							detail.Width = &val
						}
						if hInt.Valid {
							val := int(hInt.Int64)
							detail.Height = &val
						}
						if fr.Valid {
							detail.Framerate = &fr.String
						}
					}

					sendJSON(w, http.StatusOK, models.GetVideoDetailResponse{
						RootPath: filepath.ToSlash(rootPath),
						Video:    detail,
					})
					return
				}
			}

			sendError(w, http.StatusNotFound, "VIDEO_NOT_FOUND", "Video not found", videoRel)
		})

		// Save Split Plan
		r.Post("/split-plan", func(w http.ResponseWriter, r *http.Request) {
			var req models.SaveSplitPlanRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Invalid request body", "")
				return
			}

			planPath := filepath.Join(req.RootPath, req.VideoRelativePath, "splitplan.json")
			if err := services.WriteJSONFile(planPath, req.Segments); err != nil {
				sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), planPath)
				return
			}

			sendJSON(w, http.StatusOK, models.SaveSplitPlanResponse{
				SplitPlanPath: filepath.ToSlash(filepath.Join(req.VideoRelativePath, "splitplan.json")),
				Success:       true,
			})
		})

		// Clip metadata
		r.Put("/clip-metadata", func(w http.ResponseWriter, r *http.Request) {
			var req models.PutClipMetadataRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_CLIP_PATH", "Invalid request body", "")
				return
			}

			clipBase := strings.TrimSuffix(filepath.Base(req.ClipMediaPath), filepath.Ext(req.ClipMediaPath))
			metaPath := filepath.Join(req.RootPath, filepath.Dir(req.ClipMediaPath), clipBase+".json")

			if err := services.WriteJSONFile(metaPath, req.Metadata); err != nil {
				sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), metaPath)
				return
			}

			relMeta, _ := filepath.Rel(req.RootPath, metaPath)
			sendJSON(w, http.StatusOK, models.PutClipMetadataResponse{
				MetadataPath: filepath.ToSlash(relMeta),
				Metadata:     req.Metadata,
			})
		})

		// Video metadata
		r.Put("/video-metadata", func(w http.ResponseWriter, r *http.Request) {
			var req models.PutVideoMetadataRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Invalid request body", "")
				return
			}

			metaPath := filepath.Join(req.RootPath, req.VideoRelativePath, "metadata.json")
			if err := services.WriteJSONFile(metaPath, req.Metadata); err != nil {
				sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), metaPath)
				return
			}

			relMeta, _ := filepath.Rel(req.RootPath, metaPath)
			sendJSON(w, http.StatusOK, models.PutVideoMetadataResponse{
				MetadataPath: filepath.ToSlash(relMeta),
				Metadata:     req.Metadata,
			})
		})

		// Capture Frame
		r.Post("/capture-frame", func(w http.ResponseWriter, r *http.Request) {
			var req models.CaptureFrameRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "FRAME_CAPTURE_FAILED", "Invalid request body", "")
				return
			}

			inputPath := filepath.Join(req.RootPath, req.MediaPath)
			saveDir := filepath.Dir(inputPath)
			saveName := fmt.Sprintf("frame_%.0f.jpg", req.Timestamp*1000)
			outputPath := filepath.Join(saveDir, saveName)

			if err := services.CaptureFrame(inputPath, req.Timestamp, outputPath); err != nil {
				sendError(w, http.StatusInternalServerError, "FRAME_CAPTURE_FAILED", err.Error(), req.MediaPath)
				return
			}

			relSave, _ := filepath.Rel(req.RootPath, outputPath)
			sendJSON(w, http.StatusOK, models.CaptureFrameResponse{
				Success:   true,
				SavedPath: filepath.ToSlash(relSave),
			})
		})

		// Generate Thumbnail
		r.Post("/generate-thumbnail", func(w http.ResponseWriter, r *http.Request) {
			var req models.GenerateThumbnailRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "THUMBNAIL_GENERATION_FAILED", "Invalid request body", "")
				return
			}

			videoPath := filepath.Join(req.RootPath, req.VideoRelativePath, "main.mp4")
			outputPath := filepath.Join(req.RootPath, req.VideoRelativePath, "thumbnail.jpg")

			if err := services.GenerateThumbnail(videoPath, outputPath); err != nil {
				sendError(w, http.StatusInternalServerError, "THUMBNAIL_GENERATION_FAILED", err.Error(), req.VideoRelativePath)
				return
			}

			relThumb, _ := filepath.Rel(req.RootPath, outputPath)
			sendJSON(w, http.StatusOK, models.GenerateThumbnailResponse{
				Success:       true,
				ThumbnailPath: filepath.ToSlash(relThumb),
			})
		})

		// Config endpoints
		r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
			rootPath := r.URL.Query().Get("rootPath")
			cfg, err := services.GetLibraryConfig(rootPath)
			if err != nil {
				sendError(w, http.StatusInternalServerError, "CONFIG_READ_FAILED", err.Error(), rootPath)
				return
			}
			sendJSON(w, http.StatusOK, models.GetLibraryConfigResponse{Config: cfg})
		})

		r.Put("/config", func(w http.ResponseWriter, r *http.Request) {
			var req models.PutLibraryConfigRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "CONFIG_WRITE_FAILED", "Invalid request body", "")
				return
			}
			if err := services.SaveLibraryConfig(req.RootPath, req.Config); err != nil {
				sendError(w, http.StatusInternalServerError, "CONFIG_WRITE_FAILED", err.Error(), req.RootPath)
				return
			}
			sendJSON(w, http.StatusOK, models.PutLibraryConfigResponse{Success: true, Config: req.Config})
		})

		// Delete Media
		r.Post("/delete-media", func(w http.ResponseWriter, r *http.Request) {
			var req models.DeleteMediaRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Invalid request body", "")
				return
			}

			targetPath := filepath.Join(req.RootPath, req.MediaRelativePath)
			if err := os.RemoveAll(targetPath); err != nil {
				sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.MediaRelativePath)
				return
			}

			sendJSON(w, http.StatusOK, models.DeleteMediaResponse{Success: true})
		})

		// Categorize Media
		r.Post("/categorize-media", func(w http.ResponseWriter, r *http.Request) {
			var req models.CategorizeMediaRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				sendError(w, http.StatusBadRequest, "INVALID_MEDIA_TYPE", "Invalid request body", "")
				return
			}

			srcPath := filepath.Join(req.RootPath, req.MediaRelativePath)
			ext := filepath.Ext(srcPath)
			filename := filepath.Base(srcPath)

			destDir := req.RootPath
			if req.Category != nil && *req.Category != "" {
				destDir = filepath.Join(req.RootPath, *req.Category)
			}

			if err := os.MkdirAll(destDir, 0755); err != nil {
				sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), "")
				return
			}

			destPath := filepath.Join(destDir, filename)
			if srcPath != destPath {
				if err := os.Rename(srcPath, destPath); err != nil {
					// Fallback copy if rename across mounts fails
					data, err := os.ReadFile(srcPath)
					if err != nil {
						sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), "")
						return
					}
					if err := os.WriteFile(destPath, data, 0644); err != nil {
						sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), "")
						return
					}
					os.Remove(srcPath)
				}
			}

			relNew, _ := filepath.Rel(req.RootPath, destPath)
			tags := services.ExtractTagsFromPath(filepath.ToSlash(relNew))
			sendJSON(w, http.StatusOK, models.CategorizeMediaResponse{
				Success:         true,
				NewRelativePath: filepath.ToSlash(relNew),
				Tags:            tags,
			})
			_ = ext
		})
	})

	// Static Web SPA handler
	if info, err := os.Stat(webDistPath); err == nil && info.IsDir() {
		fileServer := http.FileServer(http.Dir(webDistPath))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api") {
				sendError(w, http.StatusNotFound, "NOT_FOUND", "API endpoint not found", r.URL.Path)
				return
			}

			filePath := filepath.Join(webDistPath, filepath.Clean(r.URL.Path))
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}

			http.ServeFile(w, r, filepath.Join(webDistPath, "index.html"))
		})
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
