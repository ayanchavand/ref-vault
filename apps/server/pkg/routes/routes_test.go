package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"

	"reference-vault/server/pkg/models"
)

func setupTestServer(t *testing.T) (*chi.Mux, string) {
	tempDir := t.TempDir()
	r := chi.NewRouter()
	RegisterRoutes(r, tempDir)
	return r, tempDir
}

func TestValidateEndpoint(t *testing.T) {
	r, tempDir := setupTestServer(t)

	reqBody, _ := json.Marshal(models.ValidateLibraryRootRequest{RootPath: tempDir})
	req := httptest.NewRequest("POST", "/api/library/validate", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}
}

func TestInitLibraryEndpoint(t *testing.T) {
	r, tempDir := setupTestServer(t)

	reqBody, _ := json.Marshal(models.InitLibraryRequest{TargetPath: tempDir})
	req := httptest.NewRequest("POST", "/api/library/init", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}

	videoDir := filepath.Join(tempDir, "refVault_Videos")
	if _, err := os.Stat(videoDir); err != nil {
		t.Errorf("Expected video directory refVault_Videos to exist")
	}
}

func TestLibraryConfigEndpoints(t *testing.T) {
	r, tempDir := setupTestServer(t)

	// GET config
	req := httptest.NewRequest("GET", "/api/library/config?rootPath="+tempDir, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for GET /api/library/config, got %d", w.Code)
	}

	// POST config (Node server allows POST for reading config as well)
	postReqBody, _ := json.Marshal(models.GetLibraryConfigRequest{RootPath: tempDir})
	postReq := httptest.NewRequest("POST", "/api/library/config", bytes.NewBuffer(postReqBody))
	postReq.Header.Set("Content-Type", "application/json")
	postW := httptest.NewRecorder()
	r.ServeHTTP(postW, postReq)

	if postW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for POST /api/library/config, got %d", postW.Code)
	}

	// PUT config
	newCfg := models.LibraryConfig{
		Fields: []models.LibraryConfigField{
			{Name: "genre", Type: "video", IsMulti: false, Values: []string{"action", "comedy"}},
		},
	}
	putBody, _ := json.Marshal(models.PutLibraryConfigRequest{
		RootPath: tempDir,
		Config:   newCfg,
	})
	putReq := httptest.NewRequest("PUT", "/api/library/config", bytes.NewBuffer(putBody))
	putReq.Header.Set("Content-Type", "application/json")

	putW := httptest.NewRecorder()
	r.ServeHTTP(putW, putReq)

	if putW.Code != http.StatusOK {
		t.Fatalf("Expected PUT status 200, got %d", putW.Code)
	}
}

func TestScanLibraryAndVideosDetailEndpoints(t *testing.T) {
	r, tempDir := setupTestServer(t)

	vidDir := filepath.Join(tempDir, "sample-video")
	_ = os.MkdirAll(filepath.Join(vidDir, "clips"), 0755)
	_ = os.WriteFile(filepath.Join(vidDir, "main.mp4"), []byte("mp4 dummy content"), 0644)
	_ = os.WriteFile(filepath.Join(vidDir, "metadata.json"), []byte(`{"title":"Sample"}`), 0644)

	// POST /api/library/scan
	scanBody, _ := json.Marshal(models.ScanLibraryRequest{RootPath: tempDir})
	scanReq := httptest.NewRequest("POST", "/api/library/scan", bytes.NewBuffer(scanBody))
	scanReq.Header.Set("Content-Type", "application/json")

	scanW := httptest.NewRecorder()
	r.ServeHTTP(scanW, scanReq)

	if scanW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for scan, got %d", scanW.Code)
	}

	// POST /api/videos/detail
	detailBody, _ := json.Marshal(models.GetVideoDetailRequest{
		RootPath:          tempDir,
		VideoRelativePath: "sample-video",
	})
	detailReq := httptest.NewRequest("POST", "/api/videos/detail", bytes.NewBuffer(detailBody))
	detailReq.Header.Set("Content-Type", "application/json")

	detailW := httptest.NewRecorder()
	r.ServeHTTP(detailW, detailReq)

	if detailW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for POST /api/videos/detail, got %d. Body: %s", detailW.Code, detailW.Body.String())
	}
}

func TestMediaScanAndCategorizeEndpoints(t *testing.T) {
	r, tempDir := setupTestServer(t)

	imgDir := filepath.Join(tempDir, "images")
	_ = os.MkdirAll(imgDir, 0755)
	_ = os.WriteFile(filepath.Join(imgDir, "photo.jpg"), []byte("jpeg image data"), 0644)

	// POST /api/media/scan
	scanBody, _ := json.Marshal(models.ScanMediaRequest{RootPath: tempDir})
	scanReq := httptest.NewRequest("POST", "/api/media/scan", bytes.NewBuffer(scanBody))
	scanReq.Header.Set("Content-Type", "application/json")

	scanW := httptest.NewRecorder()
	r.ServeHTTP(scanW, scanReq)

	if scanW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for POST /api/media/scan, got %d", scanW.Code)
	}

	// POST /api/media/categorize
	cat := "images/favorites"
	catBody, _ := json.Marshal(models.CategorizeMediaRequest{
		RootPath:          tempDir,
		MediaRelativePath: "images/photo.jpg",
		Category:          &cat,
	})
	catReq := httptest.NewRequest("POST", "/api/media/categorize", bytes.NewBuffer(catBody))
	catReq.Header.Set("Content-Type", "application/json")

	catW := httptest.NewRecorder()
	r.ServeHTTP(catW, catReq)

	if catW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for POST /api/media/categorize, got %d. Body: %s", catW.Code, catW.Body.String())
	}
}

func TestVideosPlaceholderAndUploadDeleteEndpoints(t *testing.T) {
	r, tempDir := setupTestServer(t)

	// POST /api/videos/create-placeholder
	createBody, _ := json.Marshal(models.CreateVideoPlaceholderRequest{
		RootPath: tempDir,
		Title:    "My New Video",
	})
	createReq := httptest.NewRequest("POST", "/api/videos/create-placeholder", bytes.NewBuffer(createBody))
	createReq.Header.Set("Content-Type", "application/json")

	createW := httptest.NewRecorder()
	r.ServeHTTP(createW, createReq)

	if createW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for create-placeholder, got %d", createW.Code)
	}

	var createResp models.CreateVideoPlaceholderResponse
	_ = json.Unmarshal(createW.Body.Bytes(), &createResp)
	if createResp.VideoRelativePath != "my-new-video" {
		t.Errorf("Expected folder my-new-video, got %s", createResp.VideoRelativePath)
	}

	// POST /api/videos/delete
	delBody, _ := json.Marshal(models.DeleteVideoRequest{
		RootPath:          tempDir,
		VideoRelativePath: "my-new-video",
	})
	delReq := httptest.NewRequest("POST", "/api/videos/delete", bytes.NewBuffer(delBody))
	delReq.Header.Set("Content-Type", "application/json")

	delW := httptest.NewRecorder()
	r.ServeHTTP(delW, delReq)

	if delW.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for video delete, got %d", delW.Code)
	}
}

func TestMediaFileStreamingAndSecurity(t *testing.T) {
	r, tempDir := setupTestServer(t)

	fileContent := "hello media stream"
	filePath := filepath.Join(tempDir, "sample.mp4")
	_ = os.WriteFile(filePath, []byte(fileContent), 0644)

	// GET /api/media
	req := httptest.NewRequest("GET", "/api/media?rootPath="+tempDir+"&mediaPath=sample.mp4", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200 for GET /api/media, got %d", w.Code)
	}

	// Path traversal attempt
	badReq := httptest.NewRequest("GET", "/api/media?rootPath="+tempDir+"&mediaPath=../etc/passwd", nil)
	badW := httptest.NewRecorder()
	r.ServeHTTP(badW, badReq)

	if badW.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request for path traversal attempt, got %d", badW.Code)
	}

	// Unsupported extension attempt
	txtPath := filepath.Join(tempDir, "secret.txt")
	_ = os.WriteFile(txtPath, []byte("secret content"), 0644)
	unsupportedReq := httptest.NewRequest("GET", "/api/media?rootPath="+tempDir+"&mediaPath=secret.txt", nil)
	unsupportedW := httptest.NewRecorder()
	r.ServeHTTP(unsupportedW, unsupportedReq)

	if unsupportedW.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 Bad Request for unsupported file extension, got %d", unsupportedW.Code)
	}
}

func TestDeleteVideoRootProtection(t *testing.T) {
	r, tempDir := setupTestServer(t)

	// Attempting to delete with empty videoRelativePath
	delBody, _ := json.Marshal(models.DeleteVideoRequest{
		RootPath:          tempDir,
		VideoRelativePath: "",
	})
	delReq := httptest.NewRequest("POST", "/api/videos/delete", bytes.NewBuffer(delBody))
	delReq.Header.Set("Content-Type", "application/json")

	delW := httptest.NewRecorder()
	r.ServeHTTP(delW, delReq)

	if delW.Code != http.StatusBadRequest {
		t.Fatalf("Expected status 400 for empty videoRelativePath delete attempt, got %d", delW.Code)
	}

	// Verify tempDir still exists
	if _, err := os.Stat(tempDir); err != nil {
		t.Fatalf("Library root directory was deleted by delete request!")
	}
}

func TestPutClipMetadataNonExistentClip(t *testing.T) {
	r, tempDir := setupTestServer(t)

	putBody, _ := json.Marshal(models.PutClipMetadataRequest{
		RootPath:          tempDir,
		VideoRelativePath: "sample-video",
		ClipMediaPath:     "sample-video/clips/scene_01.mp4",
		Metadata:          map[string]interface{}{"tags": []string{"action"}},
	})
	putReq := httptest.NewRequest("PUT", "/api/clips/metadata", bytes.NewBuffer(putBody))
	putReq.Header.Set("Content-Type", "application/json")

	putW := httptest.NewRecorder()
	r.ServeHTTP(putW, putReq)

	if putW.Code != http.StatusNotFound {
		t.Fatalf("Expected status 404 for non-existent clip metadata update, got %d", putW.Code)
	}
}

