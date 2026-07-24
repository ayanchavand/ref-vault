package routes

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"regexp"
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
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(absRoot, absTarget)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func getContentType(filePath string) string {
	ext := strings.ToLower(filepath.Ext(filePath))
	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".gif":
		return "image/gif"
	default:
		return "application/octet-stream"
	}
}

func sanitizeDirectoryName(title string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9-_]`)
	s := reg.ReplaceAllString(strings.TrimSpace(strings.ToLower(title)), "-")
	regMulti := regexp.MustCompile(`-+`)
	s = regMulti.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func RegisterRoutes(r chi.Router, webDistPath string) {
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {

		// ─── /api/library ──────────────────────────────────────────────────
		r.Route("/library", func(r chi.Router) {
			// POST /api/library/validate
			r.Post("/validate", func(w http.ResponseWriter, r *http.Request) {
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

			// POST /api/library/init
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

			// POST /api/library/scan
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

			// GET & POST /api/library/config
			r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				cfg, err := services.GetLibraryConfig(rootPath)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "CONFIG_READ_FAILED", err.Error(), rootPath)
					return
				}
				sendJSON(w, http.StatusOK, models.GetLibraryConfigResponse{Config: cfg})
			})

			r.Post("/config", func(w http.ResponseWriter, r *http.Request) {
				var req models.GetLibraryConfigRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "CONFIG_READ_FAILED", "Invalid request body", "")
					return
				}
				cfg, err := services.GetLibraryConfig(req.RootPath)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "CONFIG_READ_FAILED", err.Error(), req.RootPath)
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
		})

		// ─── /api/media ────────────────────────────────────────────────────
		r.Route("/media", func(r chi.Router) {
			// POST /api/media/scan
			r.Post("/scan", func(w http.ResponseWriter, r *http.Request) {
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

			// GET /api/media (Streaming file handler with ETags & Range headers)
			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				mediaPath := r.URL.Query().Get("mediaPath")

				if rootPath == "" || mediaPath == "" {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Missing rootPath or mediaPath", "")
					return
				}

				fullPath := filepath.Join(rootPath, mediaPath)
				if !isContained(rootPath, fullPath) {
					sendError(w, http.StatusForbidden, "INVALID_VIDEO_PATH", "Path outside library root", mediaPath)
					return
				}

				info, err := os.Stat(fullPath)
				if err != nil || info.IsDir() {
					sendError(w, http.StatusNotFound, "MEDIA_NOT_FOUND", "File not found", mediaPath)
					return
				}

				cType := getContentType(fullPath)
				etag := fmt.Sprintf(`W/"%d-%d"`, info.Size(), info.ModTime().UnixNano()/1000000)

				w.Header().Set("Cache-Control", "public, max-age=604800, must-revalidate")
				w.Header().Set("ETag", etag)
				w.Header().Set("Last-Modified", info.ModTime().UTC().Format(http.TimeFormat))
				w.Header().Set("Accept-Ranges", "bytes")
				w.Header().Set("Content-Type", cType)

				if r.Header.Get("If-None-Match") == etag {
					w.WriteHeader(http.StatusNotModified)
					return
				}

				http.ServeFile(w, r, fullPath)
			})

			// GET /api/media/thumbnail
			r.Get("/thumbnail", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				mediaPath := r.URL.Query().Get("mediaPath")

				videoDir := filepath.Join(rootPath, mediaPath)
				thumbPath := filepath.Join(videoDir, "thumbnail.jpg")

				if _, err := os.Stat(thumbPath); os.IsNotExist(err) {
					mainVideoPath := filepath.Join(videoDir, "main.mp4")
					if err := services.GenerateThumbnail(mainVideoPath, thumbPath); err != nil {
						sendError(w, http.StatusNotFound, "THUMBNAIL_GENERATION_FAILED", err.Error(), mediaPath)
						return
					}
				}

				info, err := os.Stat(thumbPath)
				if err != nil {
					sendError(w, http.StatusNotFound, "MEDIA_NOT_FOUND", "Thumbnail not found", mediaPath)
					return
				}

				etag := fmt.Sprintf(`W/"%d-%d"`, info.Size(), info.ModTime().UnixNano()/1000000)
				w.Header().Set("Content-Type", "image/jpeg")
				w.Header().Set("Cache-Control", "public, max-age=604800, must-revalidate")
				w.Header().Set("ETag", etag)

				if r.Header.Get("If-None-Match") == etag {
					w.WriteHeader(http.StatusNotModified)
					return
				}

				http.ServeFile(w, r, thumbPath)
			})

			// POST /api/media/upload
			r.Post("/upload", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				fileName := r.URL.Query().Get("fileName")

				if rootPath == "" || fileName == "" {
					sendError(w, http.StatusBadRequest, "INVALID_FILE_NAME", "Missing rootPath or fileName", "")
					return
				}

				if strings.Contains(fileName, "/") || strings.Contains(fileName, "\\") || strings.Contains(fileName, "..") {
					sendError(w, http.StatusBadRequest, "INVALID_FILE_NAME", "Filename must not contain path traversal characters.", fileName)
					return
				}

				ext := strings.ToLower(filepath.Ext(fileName))
				subFolder := ""
				if ext == ".gif" {
					subFolder = "gifs"
				} else if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
					subFolder = "videos"
				} else if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".avif" {
					subFolder = "images"
				} else {
					sendError(w, http.StatusBadRequest, "INVALID_MEDIA_TYPE", "Unsupported media file extension.", fileName)
					return
				}

				targetDir := filepath.Join(rootPath, subFolder)
				_ = os.MkdirAll(targetDir, 0755)

				targetFile := filepath.Join(targetDir, fileName)
				out, err := os.Create(targetFile)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "MEDIA_WRITE_FAILED", err.Error(), fileName)
					return
				}
				defer out.Close()

				if _, err := io.Copy(out, r.Body); err != nil {
					sendError(w, http.StatusInternalServerError, "MEDIA_WRITE_FAILED", err.Error(), fileName)
					return
				}

				sendJSON(w, http.StatusOK, map[string]bool{"success": true})
			})

			// POST /api/media/delete
			r.Post("/delete", func(w http.ResponseWriter, r *http.Request) {
				var req models.DeleteMediaRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Invalid request body", "")
					return
				}

				targetPath := filepath.Join(req.RootPath, req.MediaRelativePath)
				if !isContained(req.RootPath, targetPath) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Media file path must stay within library root.", req.MediaRelativePath)
					return
				}

				fileName := filepath.Base(targetPath)
				parentDir := filepath.Dir(targetPath)
				parentRel, _ := filepath.Rel(req.RootPath, parentDir)

				if strings.ToLower(fileName) == "main.mp4" && parentDir != req.RootPath && parentRel != "" && !strings.HasPrefix(parentRel, "..") {
					_ = os.RemoveAll(parentDir)
				} else {
					_ = os.RemoveAll(targetPath)
				}

				sendJSON(w, http.StatusOK, models.DeleteMediaResponse{Success: true})
			})

			// POST /api/media/categorize
			r.Post("/categorize", func(w http.ResponseWriter, r *http.Request) {
				var req models.CategorizeMediaRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "INVALID_MEDIA_TYPE", "Invalid request body", "")
					return
				}

				srcPath := filepath.Join(req.RootPath, req.MediaRelativePath)
				filename := filepath.Base(srcPath)

				destDir := req.RootPath
				if req.Category != nil && *req.Category != "" {
					destDir = filepath.Join(req.RootPath, *req.Category)
				}

				_ = os.MkdirAll(destDir, 0755)
				destPath := filepath.Join(destDir, filename)

				if srcPath != destPath {
					if err := os.Rename(srcPath, destPath); err != nil {
						if err := copyFile(srcPath, destPath); err == nil {
							_ = os.Remove(srcPath)
						}
					}
				}

				relNew, _ := filepath.Rel(req.RootPath, destPath)
				tags := services.ExtractTagsFromPath(filepath.ToSlash(relNew))
				sendJSON(w, http.StatusOK, models.CategorizeMediaResponse{
					Success:         true,
					NewRelativePath: filepath.ToSlash(relNew),
					Tags:            tags,
				})
			})
		})

		// ─── /api/videos ───────────────────────────────────────────────────
		r.Route("/videos", func(r chi.Router) {
			// POST /api/videos/detail
			r.Post("/detail", func(w http.ResponseWriter, r *http.Request) {
				var req models.GetVideoDetailRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Invalid request body", "")
					return
				}

				videos, err := services.GetCachedVideos(req.RootPath)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), req.VideoRelativePath)
					return
				}

				for _, v := range videos {
					if v.RelativePath == req.VideoRelativePath {
						detail := models.VideoDetail{
							RelativePath:      v.RelativePath,
							MainVideoPath:     v.MainVideoPath,
							Metadata:          v.Metadata,
							ThumbnailPath:     v.ThumbnailPath,
							ClipsMetadataPath: v.ClipsMetadataPath,
							Clips:             v.Clips,
						}

						if database, err := db.GetVaultDb(req.RootPath); err == nil {
							var wInt, hInt sql.NullInt64
							var fr sql.NullString
							_ = database.QueryRow("SELECT width, height, framerate FROM videos WHERE relative_path = ?", req.VideoRelativePath).Scan(&wInt, &hInt, &fr)
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
							RootPath: filepath.ToSlash(req.RootPath),
							Video:    detail,
						})
						return
					}
				}

				sendError(w, http.StatusNotFound, "VIDEO_NOT_FOUND", "Video not found", req.VideoRelativePath)
			})

			// PUT /api/videos/metadata
			r.Put("/metadata", func(w http.ResponseWriter, r *http.Request) {
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

			// POST /api/videos/split-plan
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

			// POST /api/videos/create-placeholder
			r.Post("/create-placeholder", func(w http.ResponseWriter, r *http.Request) {
				var req models.CreateVideoPlaceholderRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "INVALID_METADATA_JSON", "Invalid request body", "")
					return
				}

				if strings.TrimSpace(req.Title) == "" {
					sendError(w, http.StatusBadRequest, "INVALID_METADATA_JSON", "Title is required and cannot be empty.", "")
					return
				}

				folderName := sanitizeDirectoryName(req.Title)
				if folderName == "" {
					folderName = "unnamed-video"
				}

				finalName := folderName
				counter := 1
				for {
					if _, err := os.Stat(filepath.Join(req.RootPath, finalName)); os.IsNotExist(err) {
						break
					}
					finalName = fmt.Sprintf("%s-%d", folderName, counter)
					counter++
				}

				videoDir := filepath.Join(req.RootPath, finalName)
				_ = os.MkdirAll(videoDir, 0755)
				_ = os.MkdirAll(filepath.Join(videoDir, "clips"), 0755)

				metadata := map[string]interface{}{
					"title": req.Title,
				}
				if req.Artist != nil {
					metadata["artist"] = *req.Artist
				}
				if req.Tags != nil {
					metadata["tags"] = req.Tags
				}
				if req.Notes != nil {
					metadata["notes"] = *req.Notes
				}
				if req.Rating != nil {
					metadata["rating"] = *req.Rating
				}

				_ = services.WriteJSONFile(filepath.Join(videoDir, "metadata.json"), metadata)

				sendJSON(w, http.StatusOK, models.CreateVideoPlaceholderResponse{
					Success:           true,
					VideoRelativePath: finalName,
				})
			})

			// POST /api/videos/upload
			r.Post("/upload", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				videoRel := r.URL.Query().Get("videoRelativePath")

				if rootPath == "" || videoRel == "" {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Missing rootPath or videoRelativePath", "")
					return
				}

				targetDir := filepath.Join(rootPath, videoRel)
				_ = os.MkdirAll(targetDir, 0755)

				targetFile := filepath.Join(targetDir, "main.mp4")
				out, err := os.Create(targetFile)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), videoRel)
					return
				}
				defer out.Close()

				if _, err := io.Copy(out, r.Body); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), videoRel)
					return
				}

				sendJSON(w, http.StatusOK, map[string]bool{"success": true})
			})

			// POST /api/videos/delete
			r.Post("/delete", func(w http.ResponseWriter, r *http.Request) {
				var req models.DeleteVideoRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "VIDEO_NOT_FOUND", "Invalid request body", "")
					return
				}

				targetDir := filepath.Join(req.RootPath, req.VideoRelativePath)
				if !isContained(req.RootPath, targetDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Path outside library root", req.VideoRelativePath)
					return
				}

				if err := os.RemoveAll(targetDir); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.VideoRelativePath)
					return
				}

				sendJSON(w, http.StatusOK, models.DeleteVideoResponse{Success: true})
			})

			// POST /api/videos/capture-frame
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
		})

		// ─── /api/clips ────────────────────────────────────────────────────
		r.Route("/clips", func(r chi.Router) {
			// PUT /api/clips/metadata
			r.Put("/metadata", func(w http.ResponseWriter, r *http.Request) {
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

			// POST /api/clips/delete
			r.Post("/delete", func(w http.ResponseWriter, r *http.Request) {
				var req models.DeleteClipRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "CLIP_NOT_FOUND", "Invalid request body", "")
					return
				}

				clipPath := filepath.Join(req.RootPath, req.ClipMediaPath)
				if !isContained(req.RootPath, clipPath) {
					sendError(w, http.StatusBadRequest, "INVALID_CLIP_PATH", "Path outside library root", req.ClipMediaPath)
					return
				}

				clipBase := strings.TrimSuffix(filepath.Base(req.ClipMediaPath), filepath.Ext(req.ClipMediaPath))
				metaPath := filepath.Join(filepath.Dir(clipPath), clipBase+".json")

				_ = os.Remove(clipPath)
				_ = os.Remove(metaPath)

				sendJSON(w, http.StatusOK, models.DeleteClipResponse{Success: true})
			})
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
