package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port           int    `json:"port"`
	RefreshSeconds int    `json:"refresh_seconds"`
	DeviceName     string `json:"device_name"`
}

func getExecutableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func loadConfig(baseDir string) Config {
	cfg := Config{
		Port:           8080,
		RefreshSeconds: 4,
		DeviceName:     "Xiaomi 11 Ultra",
	}

	confPaths := []string{
		filepath.Join(baseDir, "../config/config.json"),
		filepath.Join(baseDir, "config.json"),
		"/data/adb/modules/xiaomi_nas_monitor/config/config.json",
	}

	for _, p := range confPaths {
		if data, err := os.ReadFile(p); err == nil {
			_ = json.Unmarshal(data, &cfg)
			break
		}
	}
	return cfg
}

func main() {
	baseDir := getExecutableDir()
	cfg := loadConfig(baseDir)

	webDirCandidates := []string{
		filepath.Join(baseDir, "../web"),
		filepath.Join(baseDir, "web"),
		"/data/adb/modules/xiaomi_nas_monitor/web",
		"./web",
	}

	webDir := "./web"
	for _, d := range webDirCandidates {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			webDir = d
			break
		}
	}

	statusPaths := []string{
		"/data/local/tmp/nas/status.json",
		filepath.Join(webDir, "api/status"),
		filepath.Join(webDir, "status.json"),
	}

	// 1. API 接口
	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")

		var statusData []byte
		var err error
		for _, sp := range statusPaths {
			if data, e := os.ReadFile(sp); e == nil && len(data) > 0 {
				statusData = data
				err = nil
				break
			} else {
				err = e
			}
		}

		if err != nil || len(statusData) == 0 {
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"device":"`+cfg.DeviceName+`","uptime":"启动中...","cpu":{"usage":0},"memory":{"percent":0},"storage":{"percent":0}}`)
			return
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(statusData)
	})

	// 2. 静态文件服务
	fs := http.FileServer(http.Dir(webDir))
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		fs.ServeHTTP(w, r)
	}))

	addr := ":" + strconv.Itoa(cfg.Port)
	fmt.Printf("[Xiaomi NAS Monitor] 服务已启动: http://0.0.0.0%s\n", addr)
	fmt.Printf("[Xiaomi NAS Monitor] 静态资源目录: %s\n", webDir)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
}
