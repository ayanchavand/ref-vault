package routes

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
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
	evalPath := func(p string) (string, error) {
		realP, err := filepath.EvalSymlinks(p)
		if err == nil {
			return realP, nil
		}
		parent := filepath.Dir(p)
		if realParent, pErr := filepath.EvalSymlinks(parent); pErr == nil {
			return filepath.Join(realParent, filepath.Base(p)), nil
		}
		return filepath.Abs(p)
	}

	realRoot, err1 := evalPath(root)
	realTarget, err2 := evalPath(target)
	if err1 != nil || err2 != nil {
		return false
	}
	rel, err := filepath.Rel(realRoot, realTarget)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func resolveAndValidateLibraryRoot(rootPath string) (string, *models.ApiErrorResponse, int) {
	pathToValidate := strings.TrimSpace(rootPath)
	if pathToValidate == "" {
		pathToValidate = os.Getenv("DEFAULT_LIBRARY_PATH")
	}
	if pathToValidate == "" {
		return "", &models.ApiErrorResponse{Error: "INVALID_LIBRARY_ROOT", Message: "rootPath must not be empty."}, http.StatusBadRequest
	}

	realPath, err := filepath.EvalSymlinks(pathToValidate)
	if err != nil {
		realPath, err = filepath.Abs(pathToValidate)
		if err != nil {
			return "", &models.ApiErrorResponse{Error: "LIBRARY_ROOT_NOT_FOUND", Message: "rootPath does not exist."}, http.StatusNotFound
		}
	}

	info, err := os.Stat(realPath)
	if err != nil {
		if rootPath != "" && os.Getenv("DEFAULT_LIBRARY_PATH") != "" && os.Getenv("DEFAULT_LIBRARY_PATH") != rootPath {
			fbPath, fbErr := filepath.EvalSymlinks(os.Getenv("DEFAULT_LIBRARY_PATH"))
			if fbErr == nil {
				if fbInfo, fbStatErr := os.Stat(fbPath); fbStatErr == nil && fbInfo.IsDir() {
					return filepath.ToSlash(fbPath), nil, http.StatusOK
				}
			}
		}
		if os.IsNotExist(err) {
			return "", &models.ApiErrorResponse{Error: "LIBRARY_ROOT_NOT_FOUND", Message: "rootPath does not exist."}, http.StatusNotFound
		}
		return "", &models.ApiErrorResponse{Error: "LIBRARY_ROOT_NOT_ACCESSIBLE", Message: "rootPath could not be accessed."}, http.StatusBadRequest
	}

	if !info.IsDir() {
		return "", &models.ApiErrorResponse{Error: "INVALID_LIBRARY_ROOT", Message: "rootPath must identify a directory."}, http.StatusBadRequest
	}

	cleanReal := filepath.Clean(realPath)
	if cleanReal == filepath.Clean(getProjectsBaseDir()) {
		_, projects, err := scanProjects()
		if err == nil && len(projects) > 0 {
			cleanReal = filepath.Clean(projects[0].Path)
		}
	}

	return filepath.ToSlash(cleanReal), nil, http.StatusOK
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

func formatTimecodeForFilename(secs float64) string {
	if secs < 0 {
		secs = 0
	}
	hours := int(secs / 3600)
	minutes := int((secs - float64(hours*3600)) / 60)
	seconds := int(secs) % 60
	frames := int((secs - float64(int(secs))) * 24)
	return fmt.Sprintf("%02d-%02d-%02d-%02d", hours, minutes, seconds, frames)
}

func randomShortUUID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func getProjectsBaseDir() string {
	if val := os.Getenv("LIBRARY_PATH"); val != "" {
		return val
	}
	// Try /library
	if err := os.MkdirAll("/library", 0755); err == nil {
		return "/library"
	}
	// Fallback to ./library if /library isn't writable
	cwd, err := os.Getwd()
	if err == nil {
		fallback := filepath.Join(cwd, "library")
		_ = os.MkdirAll(fallback, 0755)
		return fallback
	}
	return "/library"
}

func scanProjects() (string, []models.ProjectInfo, error) {
	baseDir := getProjectsBaseDir()
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return baseDir, nil, err
	}

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return baseDir, nil, err
	}

	var projects []models.ProjectInfo
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}

		projPath := filepath.Join(baseDir, name)

		vPath := filepath.Join(projPath, "refvault_videos")
		mPath := filepath.Join(projPath, "refvault_media")

		if _, err := os.Stat(vPath); err != nil {
			altV := filepath.Join(projPath, "refVault_Videos")
			if _, err2 := os.Stat(altV); err2 != nil {
				_ = os.MkdirAll(vPath, 0755)
			}
		}
		if _, err := os.Stat(mPath); err != nil {
			altM := filepath.Join(projPath, "refVault_Media")
			if _, err2 := os.Stat(altM); err2 != nil {
				_ = os.MkdirAll(mPath, 0755)
			}
		}

		projects = append(projects, models.ProjectInfo{
			Name: name,
			Path: filepath.ToSlash(projPath),
		})
	}

	return filepath.ToSlash(baseDir), projects, nil
}

func createProjectByName(name string) (models.ProjectInfo, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		cleanName = "Project-" + randomShortUUID()
	}

	baseDir := getProjectsBaseDir()
	dirName := sanitizeDirectoryName(cleanName)
	if dirName == "" {
		dirName = "project-" + randomShortUUID()
	}
	projPath := filepath.Join(baseDir, dirName)

	if err := os.MkdirAll(projPath, 0755); err != nil {
		return models.ProjectInfo{}, err
	}

	vPath := filepath.Join(projPath, "refvault_videos")
	mPath := filepath.Join(projPath, "refvault_media")

	_ = os.MkdirAll(vPath, 0755)
	_ = os.MkdirAll(mPath, 0755)
	_ = os.MkdirAll(filepath.Join(mPath, "images"), 0755)
	_ = os.MkdirAll(filepath.Join(mPath, "images", "generated"), 0755)
	_ = os.MkdirAll(filepath.Join(mPath, "gifs"), 0755)
	_ = os.MkdirAll(filepath.Join(mPath, "videos"), 0755)

	return models.ProjectInfo{
		Name: cleanName,
		Path: filepath.ToSlash(projPath),
	}, nil
}

func RegisterRoutes(r chi.Router, webDistPath string) {
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {

		// ─── /api/projects ─────────────────────────────────────────────────
		r.Route("/projects", func(r chi.Router) {
			// GET /api/projects
			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				baseDir, projects, err := scanProjects()
				if err != nil {
					sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), baseDir)
					return
				}
				if projects == nil {
					projects = []models.ProjectInfo{}
				}
				sendJSON(w, http.StatusOK, models.GetProjectsResponse{
					LibraryRoot: baseDir,
					Projects:    projects,
				})
			})

			// POST /api/projects/create
			r.Post("/create", func(w http.ResponseWriter, r *http.Request) {
				var req models.CreateProjectRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Name) == "" {
					sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Project name must not be empty.", "")
					return
				}
				proj, err := createProjectByName(req.Name)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), "")
					return
				}
				sendJSON(w, http.StatusOK, models.CreateProjectResponse{
					Success: true,
					Project: proj,
				})
			})
		})

		// ─── /api/library ──────────────────────────────────────────────────
		r.Route("/library", func(r chi.Router) {
			// POST /api/library/validate
			r.Post("/validate", func(w http.ResponseWriter, r *http.Request) {
				var req models.ValidateLibraryRootRequest
				_ = json.NewDecoder(r.Body).Decode(&req)

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}
				sendJSON(w, http.StatusOK, models.ValidateLibraryRootResponse{RootPath: canonicalRoot})
			})

			// POST /api/library/init
			r.Post("/init", func(w http.ResponseWriter, r *http.Request) {
				var req models.InitLibraryRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.TargetPath) == "" {
					sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "targetPath must not be empty.", "")
					return
				}

				targetAbs, err := filepath.Abs(req.TargetPath)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.TargetPath)
					return
				}

				if err := os.MkdirAll(targetAbs, 0755); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.TargetPath)
					return
				}

				entries, _ := os.ReadDir(targetAbs)
				isEmpty := true
				for _, entry := range entries {
					name := entry.Name()
					if name != ".DS_Store" && name != "Thumbs.db" {
						isEmpty = false
						break
					}
				}

				containerPath := targetAbs
				if !isEmpty {
					containerPath = filepath.Join(targetAbs, "refvault")
				}

				videoPath := filepath.Join(containerPath, "refvault_videos")
				mediaPath := filepath.Join(containerPath, "refvault_media")

				if err := os.MkdirAll(videoPath, 0755); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.TargetPath)
					return
				}
				if err := os.MkdirAll(mediaPath, 0755); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.TargetPath)
					return
				}

				_ = os.MkdirAll(filepath.Join(mediaPath, "images"), 0755)
				_ = os.MkdirAll(filepath.Join(mediaPath, "gifs"), 0755)
				_ = os.MkdirAll(filepath.Join(mediaPath, "videos"), 0755)

				sendJSON(w, http.StatusOK, models.InitLibraryResponse{
					Success:   true,
					VideoPath: filepath.ToSlash(videoPath),
					MediaPath: filepath.ToSlash(mediaPath),
				})
			})

			// POST /api/library/scan
			r.Post("/scan", func(w http.ResponseWriter, r *http.Request) {
				var req models.ScanLibraryRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "INVALID_LIBRARY_ROOT", "Invalid request body", "")
					return
				}
				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				if err := services.SyncVaultCache(canonicalRoot); err != nil {
					sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), canonicalRoot)
					return
				}
				videos, err := services.GetCachedVideos(canonicalRoot)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), canonicalRoot)
					return
				}
				sendJSON(w, http.StatusOK, models.ScanLibraryResponse{
					RootPath: canonicalRoot,
					Videos:   videos,
				})
			})

			// GET & POST & PUT /api/library/config
			r.Get("/config", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(rootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, rootPath)
					return
				}
				cfg, err := services.GetLibraryConfig(canonicalRoot)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "CONFIG_READ_FAILED", err.Error(), canonicalRoot)
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
				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}
				cfg, err := services.GetLibraryConfig(canonicalRoot)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "CONFIG_READ_FAILED", err.Error(), canonicalRoot)
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
				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}
				if err := services.SaveLibraryConfig(canonicalRoot, req.Config); err != nil {
					sendError(w, http.StatusInternalServerError, "CONFIG_WRITE_FAILED", err.Error(), canonicalRoot)
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
				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}
				if err := services.SyncMediaCache(canonicalRoot); err != nil {
					sendError(w, http.StatusInternalServerError, "MEDIA_SCAN_FAILED", err.Error(), canonicalRoot)
					return
				}
				items, err := services.GetCachedMediaItems(canonicalRoot)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "MEDIA_SCAN_FAILED", err.Error(), canonicalRoot)
					return
				}
				sendJSON(w, http.StatusOK, models.ScanMediaResponse{
					RootPath: canonicalRoot,
					Items:    items,
				})
			})

			// GET /api/media (Streaming file handler)
			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				mediaPath := r.URL.Query().Get("mediaPath")

				if rootPath == "" || mediaPath == "" {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Missing rootPath or mediaPath", "")
					return
				}

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(rootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, rootPath)
					return
				}

				fullPath := filepath.Join(canonicalRoot, mediaPath)
				if !isContained(canonicalRoot, fullPath) {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "mediaPath must stay within the library root.", mediaPath)
					return
				}

				ext := strings.ToLower(filepath.Ext(fullPath))
				if ext != ".mp4" && ext != ".webm" && ext != ".mov" && ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" && ext != ".avif" && ext != ".gif" {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "Only .mp4 and image files can be served as media.", mediaPath)
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(rootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, rootPath)
					return
				}

				videoPath := filepath.Join(canonicalRoot, mediaPath)
				if !isContained(canonicalRoot, videoPath) {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "mediaPath must stay within the library root.", mediaPath)
					return
				}

				dir := filepath.Dir(videoPath)
				base := filepath.Base(videoPath)
				var thumbPath string
				if base == "main.mp4" {
					thumbPath = filepath.Join(dir, "thumbnail.jpg")
				} else {
					ext := filepath.Ext(base)
					nameNoExt := strings.TrimSuffix(base, ext)
					thumbPath = filepath.Join(dir, nameNoExt+".jpg")
				}

				if _, err := os.Stat(thumbPath); os.IsNotExist(err) {
					if err := services.GenerateThumbnail(videoPath, thumbPath); err != nil {
						sendError(w, http.StatusBadRequest, "THUMBNAIL_GENERATION_FAILED", err.Error(), mediaPath)
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(rootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, rootPath)
					return
				}

				if fileName == "" || strings.Contains(fileName, "/") || strings.Contains(fileName, "\\") || strings.Contains(fileName, "..") {
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

				// Ensure refvault_media folder inside canonicalRoot
				mBase := filepath.Join(canonicalRoot, "refvault_media")
				if _, err := os.Stat(mBase); os.IsNotExist(err) {
					altMBase := filepath.Join(canonicalRoot, "refVault_Media")
					if info, err := os.Stat(altMBase); err == nil && info.IsDir() {
						mBase = altMBase
					} else {
						_ = os.MkdirAll(mBase, 0755)
					}
				}

				targetDir := filepath.Join(mBase, subFolder)
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				targetPath := filepath.Join(canonicalRoot, req.MediaRelativePath)
				if !isContained(canonicalRoot, targetPath) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Media file path must stay within library root.", req.MediaRelativePath)
					return
				}

				fileName := filepath.Base(targetPath)
				parentDir := filepath.Dir(targetPath)
				parentRel, _ := filepath.Rel(canonicalRoot, parentDir)

				if strings.ToLower(fileName) == "main.mp4" && parentDir != canonicalRoot && parentRel != "" && !strings.HasPrefix(parentRel, "..") {
					_ = os.RemoveAll(parentDir)
					if database, err := db.GetVaultDb(canonicalRoot); err == nil {
						database.Exec("DELETE FROM clips WHERE video_relative_path = ?", filepath.ToSlash(parentRel))
						database.Exec("DELETE FROM videos WHERE relative_path = ?", filepath.ToSlash(parentRel))
					}
				} else {
					_ = os.RemoveAll(targetPath)
					if database, err := db.GetVaultDb(canonicalRoot); err == nil {
						database.Exec("DELETE FROM media_items WHERE relative_path = ?", filepath.ToSlash(req.MediaRelativePath))
					}
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				// Ensure refvault_media folder inside canonicalRoot
				mBase := filepath.Join(canonicalRoot, "refvault_media")
				if _, err := os.Stat(mBase); os.IsNotExist(err) {
					altMBase := filepath.Join(canonicalRoot, "refVault_Media")
					if info, err := os.Stat(altMBase); err == nil && info.IsDir() {
						mBase = altMBase
					} else {
						_ = os.MkdirAll(mBase, 0755)
					}
				}

				srcPath := filepath.Join(canonicalRoot, req.MediaRelativePath)
				if !isContained(canonicalRoot, srcPath) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Media file path must stay within the library root.", req.MediaRelativePath)
					return
				}

				// Fallback check if file exists
				srcInfo, err := os.Stat(srcPath)
				effectiveMediaRel := req.MediaRelativePath
				if err != nil || srcInfo.IsDir() {
					// Fallback 1: Try inside mBase
					relNoPrefix := strings.TrimPrefix(strings.TrimPrefix(req.MediaRelativePath, "refvault_media/"), "refVault_Media/")
					fallbackPath := filepath.Join(mBase, relNoPrefix)
					if fbInfo, fbErr := os.Stat(fallbackPath); fbErr == nil && !fbInfo.IsDir() {
						srcPath = fallbackPath
						srcInfo = fbInfo
						if relFB, relErr := filepath.Rel(canonicalRoot, fallbackPath); relErr == nil {
							effectiveMediaRel = filepath.ToSlash(relFB)
						}
					} else {
						// Fallback 2: Query SQLite cache for matching relative_path
						foundFallback := false
						if database, err := db.GetVaultDb(canonicalRoot); err == nil {
							var rowRel string
							errRow := database.QueryRow("SELECT relative_path FROM media_items WHERE relative_path = ? OR relative_path LIKE ?", req.MediaRelativePath, "%/"+req.MediaRelativePath).Scan(&rowRel)
							if errRow == nil {
								dbPath := filepath.Join(canonicalRoot, rowRel)
								if fbInfo, fbErr := os.Stat(dbPath); fbErr == nil && !fbInfo.IsDir() {
									srcPath = dbPath
									srcInfo = fbInfo
									effectiveMediaRel = rowRel
									foundFallback = true
								}
							}
						}
						if !foundFallback {
							sendError(w, http.StatusNotFound, "MEDIA_NOT_FOUND", "The requested media file was not found.", req.MediaRelativePath)
							return
						}
					}
				}

				filename := filepath.Base(srcPath)
				mediaType := services.ExtractTagsFromPath(filepath.ToSlash(req.MediaRelativePath))
				_ = mediaType // unused directly

				ext := strings.ToLower(filepath.Ext(filename))
				expectedSubfolder := "images"
				if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
					expectedSubfolder = "videos"
				} else if ext == ".gif" {
					expectedSubfolder = "gifs"
				}

				destCategory := ""
				if req.Category != nil && strings.TrimSpace(*req.Category) != "" {
					destCategory = strings.TrimSpace(*req.Category)
				} else {
					destCategory = expectedSubfolder
				}

				destCategoryNormalized := filepath.ToSlash(destCategory)
				destCategoryClean := strings.TrimPrefix(strings.TrimPrefix(destCategoryNormalized, "refvault_media/"), "refVault_Media/")

				destSegments := strings.Split(destCategoryClean, "/")
				hasExpectedSubfolder := false
				for _, seg := range destSegments {
					if seg == expectedSubfolder {
						hasExpectedSubfolder = true
						break
					}
				}

				if !hasExpectedSubfolder {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", fmt.Sprintf(`Media files of type "%s" must stay within the "%s" folder.`, expectedSubfolder, expectedSubfolder), req.MediaRelativePath)
					return
				}

				destDir := filepath.Join(mBase, destCategoryClean)
				if !isContained(canonicalRoot, destDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Target category path must stay within the library root.", destCategory)
					return
				}

				_ = os.MkdirAll(destDir, 0755)
				destPath := filepath.Join(destDir, filename)

				if srcPath != destPath {
					if destInfo, err := os.Stat(destPath); err == nil {
						if destInfo.Size() == srcInfo.Size() {
							_ = os.Remove(srcPath)
						} else {
							sendError(w, http.StatusBadRequest, "FILE_ALREADY_EXISTS", fmt.Sprintf(`A different file named "%s" already exists in "%s".`, filename, destCategory), filename)
							return
						}
					} else {
						if err := os.Rename(srcPath, destPath); err != nil {
							if err := copyFile(srcPath, destPath); err == nil {
								_ = os.Remove(srcPath)
							}
						}
					}
				}

				relNew, _ := filepath.Rel(canonicalRoot, destPath)
				tags := services.ExtractTagsFromPath(filepath.ToSlash(relNew))

				// Update SQLite cache
				if database, err := db.GetVaultDb(canonicalRoot); err == nil {
					database.Exec("DELETE FROM media_items WHERE relative_path = ? OR relative_path = ?", filepath.ToSlash(req.MediaRelativePath), filepath.ToSlash(effectiveMediaRel))
					tagsBytes, _ := json.Marshal(tags)
					mType := "image"
					if ext == ".mp4" || ext == ".webm" || ext == ".mov" {
						mType = "video"
					} else if ext == ".gif" {
						mType = "gif"
					}
					database.Exec(`
						INSERT INTO media_items (relative_path, type, size_bytes, tags_json, mtime_ms)
						VALUES (?, ?, ?, ?, ?)
						ON CONFLICT(relative_path) DO UPDATE SET
							type = excluded.type,
							size_bytes = excluded.size_bytes,
							tags_json = excluded.tags_json,
							mtime_ms = excluded.mtime_ms
					`, filepath.ToSlash(relNew), mType, srcInfo.Size(), string(tagsBytes), srcInfo.ModTime().UnixMilli())
				}

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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				if req.VideoRelativePath == "" || !isContained(canonicalRoot, filepath.Join(canonicalRoot, req.VideoRelativePath)) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", req.VideoRelativePath)
					return
				}

				videos, err := services.GetCachedVideos(canonicalRoot)
				if err != nil {
					sendError(w, http.StatusInternalServerError, "LIBRARY_SCAN_FAILED", err.Error(), req.VideoRelativePath)
					return
				}

				findVideo := func(list []models.ScannedVideo) *models.ScannedVideo {
					for _, v := range list {
						if v.RelativePath == req.VideoRelativePath {
							return &v
						}
					}
					return nil
				}

				targetVid := findVideo(videos)
				if targetVid == nil {
					_ = services.SyncVaultCache(canonicalRoot)
					if syncedVideos, err := services.GetCachedVideos(canonicalRoot); err == nil {
						targetVid = findVideo(syncedVideos)
					}
				}

				if targetVid != nil {
					v := *targetVid
					detail := models.VideoDetail{
						RelativePath:      v.RelativePath,
						MainVideoPath:     v.MainVideoPath,
						Metadata:          v.Metadata,
						ThumbnailPath:     v.ThumbnailPath,
						ClipsMetadataPath: v.ClipsMetadataPath,
						Clips:             v.Clips,
					}

					if database, err := db.GetVaultDb(canonicalRoot); err == nil {
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
						RootPath: canonicalRoot,
						Video:    detail,
					})
					return
				}

				sendError(w, http.StatusNotFound, "VIDEO_NOT_FOUND", "The requested video directory was not found.", req.VideoRelativePath)
			})

			// PUT /api/videos/metadata
			r.Put("/metadata", func(w http.ResponseWriter, r *http.Request) {
				var req models.PutVideoMetadataRequest
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Invalid request body", "")
					return
				}

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				videoDir := filepath.Join(canonicalRoot, req.VideoRelativePath)
				if !isContained(canonicalRoot, videoDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", req.VideoRelativePath)
					return
				}

				metaPath := filepath.Join(videoDir, "metadata.json")
				if err := services.WriteJSONFile(metaPath, req.Metadata); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), metaPath)
					return
				}

				relMeta, _ := filepath.Rel(canonicalRoot, metaPath)
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				videoDir := filepath.Join(canonicalRoot, req.VideoRelativePath)
				if !isContained(canonicalRoot, videoDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", req.VideoRelativePath)
					return
				}

				mainVideoPath := filepath.Join(videoDir, "main.mp4")
				if _, err := os.Stat(mainVideoPath); os.IsNotExist(err) {
					sendError(w, http.StatusNotFound, "VIDEO_NOT_FOUND", "The requested video directory was not found.", req.VideoRelativePath)
					return
				}

				// Write split_plan.json
				splitPlanPayload := map[string]interface{}{
					"videoRelativePath": req.VideoRelativePath,
					"mainVideoPath":     filepath.ToSlash(filepath.Join(req.VideoRelativePath, "main.mp4")),
					"segments":          req.Segments,
				}
				splitPlanPath := filepath.Join(videoDir, "split_plan.json")
				if err := services.WriteJSONFile(splitPlanPath, splitPlanPayload); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", "Split plan could not be saved.", req.VideoRelativePath)
					return
				}

				// Create clips directory & chop video clips
				clipsDir := filepath.Join(videoDir, "clips")
				_ = os.MkdirAll(clipsDir, 0755)

				// Find next clip index
				entries, _ := os.ReadDir(clipsDir)
				re := regexp.MustCompile(`(?i)^scene_(\d+)\.mp4$`)
				maxIndex := 0
				for _, entry := range entries {
					if m := re.FindStringSubmatch(entry.Name()); m != nil {
						var idx int
						fmt.Sscanf(m[1], "%d", &idx)
						if idx > maxIndex {
							maxIndex = idx
						}
					}
				}
				startNum := maxIndex + 1

				// Read existing clips.json
				clipsMetadataPath := filepath.Join(videoDir, "clips.json")
				var clipsMetadata map[string]interface{}
				_ = services.ReadJSONFile(clipsMetadataPath, &clipsMetadata)
				if clipsMetadata == nil {
					clipsMetadata = make(map[string]interface{})
				}

				for i, seg := range req.Segments {
					clipIndex := startNum + i
					clipName := fmt.Sprintf("scene_%02d", clipIndex)
					outputFile := filepath.Join(clipsDir, clipName+".mp4")

					mainStat, errStat := os.Stat(mainVideoPath)
					if errStat == nil && mainStat.Size() > 0 {
						if err := services.ChopVideoSegment(mainVideoPath, seg.Start, seg.End, outputFile); err != nil {
							sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", fmt.Sprintf("ffmpeg chopping failed for segment %d: %v", i+1, err), req.VideoRelativePath)
							return
						}
					}

					segMeta := map[string]interface{}{
						"tags": seg.Tags,
					}
					if seg.Notes != nil {
						segMeta["notes"] = *seg.Notes
					}
					if seg.Rating != nil {
						segMeta["rating"] = *seg.Rating
					}
					clipsMetadata[clipName] = segMeta
				}

				_ = services.WriteJSONFile(clipsMetadataPath, clipsMetadata)
				_ = services.SyncVaultCache(canonicalRoot)

				relPlan, _ := filepath.Rel(canonicalRoot, splitPlanPath)
				sendJSON(w, http.StatusOK, models.SaveSplitPlanResponse{
					SplitPlanPath: filepath.ToSlash(relPlan),
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
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

				// Ensure refvault_videos folder inside canonicalRoot
				vBase := filepath.Join(canonicalRoot, "refvault_videos")
				if _, err := os.Stat(vBase); os.IsNotExist(err) {
					altVBase := filepath.Join(canonicalRoot, "refVault_Videos")
					if info, err := os.Stat(altVBase); err == nil && info.IsDir() {
						vBase = altVBase
					} else {
						_ = os.MkdirAll(vBase, 0755)
					}
				}

				finalName := folderName
				counter := 1
				for {
					if _, err := os.Stat(filepath.Join(vBase, finalName)); os.IsNotExist(err) {
						break
					}
					finalName = fmt.Sprintf("%s-%d", folderName, counter)
					counter++
				}

				videoDir := filepath.Join(vBase, finalName)
				_ = os.MkdirAll(videoDir, 0755)
				_ = os.MkdirAll(filepath.Join(videoDir, "clips"), 0755)

				tags := req.Tags
				if tags == nil {
					tags = []string{}
				}

				metadata := map[string]interface{}{
					"tags": tags,
				}
				if req.Artist != nil && strings.TrimSpace(*req.Artist) != "" {
					metadata["artist"] = *req.Artist
				}
				if req.Notes != nil && strings.TrimSpace(*req.Notes) != "" {
					metadata["notes"] = *req.Notes
				}
				if req.Rating != nil && *req.Rating > 0 {
					metadata["rating"] = *req.Rating
				}

				_ = services.WriteJSONFile(filepath.Join(videoDir, "metadata.json"), metadata)

				relVideoPath, _ := filepath.Rel(canonicalRoot, videoDir)
				sendJSON(w, http.StatusOK, models.CreateVideoPlaceholderResponse{
					Success:           true,
					VideoRelativePath: filepath.ToSlash(relVideoPath),
				})
			})

			// POST /api/videos/upload
			r.Post("/upload", func(w http.ResponseWriter, r *http.Request) {
				rootPath := r.URL.Query().Get("rootPath")
				videoRel := r.URL.Query().Get("videoRelativePath")

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(rootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, rootPath)
					return
				}

				if videoRel == "" {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", "")
					return
				}

				targetDir := filepath.Join(canonicalRoot, videoRel)
				if !isContained(canonicalRoot, targetDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", videoRel)
					return
				}

				info, err := os.Stat(targetDir)
				if err != nil || !info.IsDir() {
					sendError(w, http.StatusNotFound, "VIDEO_NOT_FOUND", "The target video directory does not exist.", videoRel)
					return
				}

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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				videoRel := strings.TrimSpace(req.VideoRelativePath)
				if videoRel == "" || videoRel == "." || videoRel == "/" {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", req.VideoRelativePath)
					return
				}

				targetDir := filepath.Join(canonicalRoot, videoRel)
				if targetDir == canonicalRoot || !isContained(canonicalRoot, targetDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "Path outside library root", req.VideoRelativePath)
					return
				}

				if err := os.RemoveAll(targetDir); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.VideoRelativePath)
					return
				}

				if database, err := db.GetVaultDb(canonicalRoot); err == nil {
					database.Exec("DELETE FROM clips WHERE video_relative_path = ?", filepath.ToSlash(videoRel))
					database.Exec("DELETE FROM videos WHERE relative_path = ?", filepath.ToSlash(videoRel))
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				videoPath := filepath.Join(canonicalRoot, req.MediaPath)
				if !isContained(canonicalRoot, videoPath) {
					sendError(w, http.StatusBadRequest, "MEDIA_NOT_FOUND", "mediaPath must stay within the library root.", req.MediaPath)
					return
				}

				if _, err := os.Stat(videoPath); os.IsNotExist(err) {
					sendError(w, http.StatusNotFound, "MEDIA_NOT_FOUND", "The requested video file was not found.", req.MediaPath)
					return
				}

				// Determine target media directory inside project (refvault_media/images/generated)
				mediaDir := filepath.Join(canonicalRoot, "refvault_media")
				if _, err := os.Stat(mediaDir); os.IsNotExist(err) {
					altMediaDir := filepath.Join(canonicalRoot, "refVault_Media")
					if info, err := os.Stat(altMediaDir); err == nil && info.IsDir() {
						mediaDir = altMediaDir
					} else {
						_ = os.MkdirAll(mediaDir, 0755)
					}
				}

				if req.MediaRootPath != nil && strings.TrimSpace(*req.MediaRootPath) != "" {
					if mr, mrErr, _ := resolveAndValidateLibraryRoot(*req.MediaRootPath); mrErr == nil {
						if isContained(canonicalRoot, mr) {
							mediaDir = mr
						}
					}
				}

				generatedDir := filepath.Join(mediaDir, "images", "generated")
				_ = os.MkdirAll(generatedDir, 0755)

				timecode := formatTimecodeForFilename(req.Timestamp)
				uuidStr := randomShortUUID()
				saveName := fmt.Sprintf("frame_%s_%s.png", timecode, uuidStr)
				outputPath := filepath.Join(generatedDir, saveName)

				if err := services.CaptureFrame(videoPath, req.Timestamp, outputPath); err != nil {
					sendError(w, http.StatusInternalServerError, "FRAME_CAPTURE_FAILED", err.Error(), req.MediaPath)
					return
				}

				relSaved, _ := filepath.Rel(canonicalRoot, outputPath)
				sendJSON(w, http.StatusOK, models.CaptureFrameResponse{
					Success:   true,
					SavedPath: filepath.ToSlash(relSaved),
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				if !strings.HasSuffix(strings.ToLower(req.ClipMediaPath), ".mp4") {
					sendError(w, http.StatusBadRequest, "INVALID_CLIP_PATH", "clipMediaPath must identify an MP4 file inside the video's clips directory.", req.ClipMediaPath)
					return
				}

				videoDir := filepath.Join(canonicalRoot, req.VideoRelativePath)
				if !isContained(canonicalRoot, videoDir) {
					sendError(w, http.StatusBadRequest, "INVALID_VIDEO_PATH", "videoRelativePath must stay within the library root.", req.VideoRelativePath)
					return
				}

				clipPath := filepath.Join(canonicalRoot, req.ClipMediaPath)
				if !isContained(canonicalRoot, clipPath) {
					sendError(w, http.StatusBadRequest, "INVALID_CLIP_PATH", "clipMediaPath must stay within the library root.", req.ClipMediaPath)
					return
				}

				info, err := os.Stat(clipPath)
				if err != nil || info.IsDir() {
					sendError(w, http.StatusNotFound, "CLIP_NOT_FOUND", "The requested clip file was not found.", req.ClipMediaPath)
					return
				}

				clipsMetadataPath := filepath.Join(videoDir, "clips.json")
				var clipsMetadata map[string]interface{}
				_ = services.ReadJSONFile(clipsMetadataPath, &clipsMetadata)
				if clipsMetadata == nil {
					clipsMetadata = make(map[string]interface{})
				}

				clipKey := strings.TrimSuffix(filepath.Base(req.ClipMediaPath), filepath.Ext(req.ClipMediaPath))
				clipsMetadata[clipKey] = req.Metadata

				if err := services.WriteJSONFile(clipsMetadataPath, clipsMetadata); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", "Clip metadata could not be saved.", req.ClipMediaPath)
					return
				}

				_ = services.SyncVaultCache(canonicalRoot)

				relClipsJson, _ := filepath.Rel(canonicalRoot, clipsMetadataPath)
				sendJSON(w, http.StatusOK, models.PutClipMetadataResponse{
					MetadataPath: filepath.ToSlash(relClipsJson),
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

				canonicalRoot, apiErr, status := resolveAndValidateLibraryRoot(req.RootPath)
				if apiErr != nil {
					sendError(w, status, apiErr.Error, apiErr.Message, req.RootPath)
					return
				}

				videoDir := filepath.Join(canonicalRoot, req.VideoRelativePath)
				clipPath := filepath.Join(canonicalRoot, req.ClipMediaPath)

				if !isContained(canonicalRoot, clipPath) {
					sendError(w, http.StatusBadRequest, "INVALID_CLIP_PATH", "Path outside library root", req.ClipMediaPath)
					return
				}

				if err := services.ResequenceSceneClips(canonicalRoot, videoDir, req.VideoRelativePath, clipPath); err != nil {
					sendError(w, http.StatusInternalServerError, "METADATA_WRITE_FAILED", err.Error(), req.ClipMediaPath)
					return
				}

				sendJSON(w, http.StatusOK, models.DeleteClipResponse{Success: true})
			})
		})
	})

	// Catch-all handler for API 404 and Web SPA static serving
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api") {
			sendError(w, http.StatusNotFound, "NOT_FOUND", "API endpoint not found", "")
			return
		}

		if info, err := os.Stat(webDistPath); err == nil && info.IsDir() {
			filePath := filepath.Join(webDistPath, filepath.Clean(r.URL.Path))
			if fInfo, fErr := os.Stat(filePath); fErr == nil && !fInfo.IsDir() {
				http.FileServer(http.Dir(webDistPath)).ServeHTTP(w, r)
				return
			}
			http.ServeFile(w, r, filepath.Join(webDistPath, "index.html"))
			return
		}

		http.Error(w, "404 page not found", http.StatusNotFound)
	})
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
