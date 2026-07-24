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

func TestValidateRootEndpoint(t *testing.T) {
	r, tempDir := setupTestServer(t)

	reqBody, _ := json.Marshal(models.ValidateLibraryRootRequest{RootPath: tempDir})
	req := httptest.NewRequest("POST", "/api/library/validate-root", bytes.NewBuffer(reqBody))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp models.ValidateLibraryRootResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed unmarshaling response: %v", err)
	}

	if resp.RootPath == "" {
		t.Errorf("Expected non-empty root path")
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

	videoDir := filepath.Join(tempDir, "video")
	if _, err := os.Stat(videoDir); err != nil {
		t.Errorf("Expected video directory to exist")
	}
}

func TestLibraryConfigEndpoint(t *testing.T) {
	r, tempDir := setupTestServer(t)

	// GET config
	req := httptest.NewRequest("GET", "/api/library/config?rootPath="+tempDir, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
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
