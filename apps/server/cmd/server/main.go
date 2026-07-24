package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"

	"reference-vault/server/pkg/routes"
)

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func main() {
	port := getEnv("PORT", "4310")
	host := getEnv("HOST", "0.0.0.0")

	executableDir, _ := os.Executable()
	baseDir := filepath.Dir(executableDir)

	webDistPath := getEnv("WEB_DIST_PATH", filepath.Join(baseDir, "../../web/dist"))
	if _, err := os.Stat(webDistPath); err != nil {
		// Try fallback relative to working directory
		if cwd, err := os.Getwd(); err == nil {
			fallback := filepath.Join(cwd, "../web/dist")
			if _, err := os.Stat(fallback); err == nil {
				webDistPath = fallback
			} else {
				fallback2 := filepath.Join(cwd, "apps/web/dist")
				if _, err := os.Stat(fallback2); err == nil {
					webDistPath = fallback2
				}
			}
		}
	}

	r := chi.NewRouter()
	routes.RegisterRoutes(r, webDistPath)

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Server starting on http://%s (serving Web Dist from %s)", addr, webDistPath)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
