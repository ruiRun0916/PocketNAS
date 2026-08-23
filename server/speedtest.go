package main

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// =========================================================
// PocketNAS Pro - Speedtest Engine & Concurrency Gatekeeper
// Pure HTTP · 0 UFS Write · 0 FTP/WebDAV Touch · Context Cancellation
// =========================================================

var (
	stMutex       sync.Mutex
	stRunning     bool
	stActiveTime  time.Time
	maxUploadBody int64 = 512 * 1024 * 1024 // 512MB 单次上限
)

func acquireSpeedtestSlot() bool {
	stMutex.Lock()
	defer stMutex.Unlock()

	// 15 秒超时防死锁
	if stRunning && time.Since(stActiveTime) > 15*time.Second {
		stRunning = false
	}

	if stRunning {
		return false
	}
	stRunning = true
	stActiveTime = time.Now()
	return true
}

func releaseSpeedtestSlot() {
	stMutex.Lock()
	stRunning = false
	stMutex.Unlock()
}

func registerSpeedtestHandlers() {
	// 1. 毫秒级 RTT 延迟探测 (/api/ping)
	http.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"pong":true,"time":%d}`, time.Now().UnixNano()/int64(time.Millisecond))
	})

	// 2. 下行测速: NAS -> 客户端 (/api/speedtest/download)
	http.HandleFunc("/api/speedtest/download", func(w http.ResponseWriter, r *http.Request) {
		if !acquireSpeedtestSlot() {
			w.WriteHeader(http.StatusTooManyRequests)
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"status":"busy","message":"已有测速任务正在运行，请稍候"}`)
			return
		}
		defer releaseSpeedtestSlot()

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")

		sizeMB := 180
		if s := r.URL.Query().Get("size"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 1000 {
				sizeMB = n
			}
		}

		totalBytes := int64(sizeMB) * 1024 * 1024
		chunk := make([]byte, 64*1024)
		for i := range chunk {
			chunk[i] = byte(i % 256)
		}

		w.Header().Set("Content-Length", strconv.FormatInt(totalBytes, 10))
		w.WriteHeader(http.StatusOK)

		ctx := r.Context()
		var written int64
		for written < totalBytes {
			select {
			case <-ctx.Done():
				return // 客户端主动取消
			default:
			}

			toWrite := int64(len(chunk))
			if totalBytes-written < toWrite {
				toWrite = totalBytes - written
			}
			n, err := w.Write(chunk[:toWrite])
			written += int64(n)
			if err != nil {
				break
			}
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	})

	// 3. 上行测速: 客户端 -> NAS (/api/speedtest/upload)
	http.HandleFunc("/api/speedtest/upload", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		start := time.Now()
		// 内存中读取并丢弃，0 磁盘 I/O
		n, _ := io.Copy(io.Discard, io.LimitReader(r.Body, maxUploadBody))
		_ = r.Body.Close()
		duration := time.Since(start)

		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"status":"ok","received_bytes":%d,"duration_ms":%d}`, n, duration.Milliseconds())
	})
}
