package main

import (
	"fmt"
	"io/fs"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
)

// =========================================================
// PocketNAS Pro v3.3.3 - Intelligent Storage Category Scanner
// Low-Power Async File-Tree Walk · In-Memory Caching · 0-Fork
// =========================================================

type CategoryStatItem struct {
	ID         string  `json:"id"`          // "app", "image", "audio", "video", "apk", "doc", "archive", "other"
	Name       string  `json:"name"`        // "应用和数据", "图片相册", "音乐音频", "视频媒体", "安装包 (APK)", "文档书籍", "压缩归档", "系统数据 / 其他"
	Color      string  `json:"color"`       // "#f59e0b", "#f97316", "#ef4444", "#a855f7", "#3b82f6", "#10b981", "#06b6d4", "#64748b"
	SizeBytes  uint64  `json:"size_bytes"`  // 字节数
	SizeFormat string  `json:"size_format"` // "28.43 GB"
	Percent    float64 `json:"percent"`     // 占总磁盘容量百分比 0.0 ~ 100.0
	UsedPercent float64 `json:"used_percent"` // 占已用空间百分比 0.0 ~ 100.0
	FileCount  int     `json:"file_count"`  // 文件数
}

type StorageDetailSnapshot struct {
	TotalUsedBytes  uint64             `json:"total_used_bytes"`
	TotalFreeBytes  uint64             `json:"total_free_bytes"`
	TotalSizeBytes  uint64             `json:"total_size_bytes"`
	TotalUsedFormat string             `json:"total_used_format"` // "397.51 GB"
	TotalFreeFormat string             `json:"total_free_format"` // "66.12 GB"
	TotalSizeFormat string             `json:"total_size_format"` // "463.63 GB"
	UsedPercent     float64            `json:"used_percent"`      // 85.74%
	FreePercent     float64            `json:"free_percent"`      // 14.26%
	LastScanTime    string             `json:"last_scan_time"`    // "2026-08-30 09:16:03"
	IsScanning      bool               `json:"is_scanning"`       // 是否正在扫描
	Categories      []CategoryStatItem `json:"categories"`
}

type StorageScanner struct {
	mu          sync.RWMutex
	rootPath    string
	snapshot    StorageDetailSnapshot
	scanning    bool
	scanTrigger chan struct{}
}

var GlobalStorageScanner = &StorageScanner{
	scanTrigger: make(chan struct{}, 1),
}

// 全格式字典映射表
var (
	extImages = map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
		".bmp": true, ".svg": true, ".ico": true, ".heic": true, ".heif": true,
		".avif": true, ".jxl": true, ".raw": true, ".dng": true, ".cr2": true,
		".nef": true, ".arw": true, ".psd": true, ".tif": true, ".tiff": true,
	}

	extAudio = map[string]bool{
		".mp3": true, ".flac": true, ".wav": true, ".aac": true, ".m4a": true,
		".ogg": true, ".opus": true, ".ape": true, ".alac": true, ".aiff": true,
		".dsd": true, ".dsf": true, ".dff": true, ".wma": true, ".amr": true,
		".mid": true, ".midi": true, ".mka": true,
	}

	extVideo = map[string]bool{
		".mp4": true, ".mkv": true, ".avi": true, ".mov": true, ".wmv": true,
		".flv": true, ".webm": true, ".ts": true, ".m2ts": true, ".mts": true,
		".rmvb": true, ".rm": true, ".3gp": true, ".m4v": true, ".vob": true,
		".iso": true, ".bdmv": true, ".f4v": true,
	}

	extAPKs = map[string]bool{
		".apk": true, ".apks": true, ".xapk": true, ".apkm": true, ".magisk": true,
	}

	extDocs = map[string]bool{
		".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
		".ppt": true, ".pptx": true, ".wps": true, ".et": true, ".dps": true,
		".txt": true, ".epub": true, ".mobi": true, ".azw3": true, ".md": true,
		".json": true, ".xml": true, ".csv": true, ".log": true, ".rtf": true,
		".html": true, ".htm": true,
	}

	extArchives = map[string]bool{
		".zip": true, ".rar": true, ".7z": true, ".tar": true, ".gz": true,
		".tgz": true, ".bz2": true, ".xz": true, ".zst": true, ".7zip": true,
		".cab": true, ".dmg": true,
	}
)

func formatFileSize(bytes uint64) string {
	if bytes >= 1073741824*1024 { // >= 1 TB
		return fmt.Sprintf("%.2f TB", float64(bytes)/float64(1073741824*1024))
	} else if bytes >= 1073741824 { // >= 1 GB
		return fmt.Sprintf("%.2f GB", float64(bytes)/1073741824.0)
	} else if bytes >= 1048576 { // >= 1 MB
		return fmt.Sprintf("%.2f MB", float64(bytes)/1048576.0)
	} else if bytes >= 1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024.0)
	}
	return fmt.Sprintf("%d B", bytes)
}

func (ss *StorageScanner) Init(rootPath string) {
	ss.mu.Lock()
	ss.rootPath = rootPath
	ss.snapshot = StorageDetailSnapshot{
		TotalUsedFormat: "--",
		TotalFreeFormat: "--",
		TotalSizeFormat: "--",
		LastScanTime:    "尚未扫描",
		IsScanning:      false,
		Categories:      makeDefaultCategories(),
	}
	ss.mu.Unlock()

	go ss.backgroundWorker()
}

func makeDefaultCategories() []CategoryStatItem {
	return []CategoryStatItem{
		{ID: "app", Name: "应用和数据", Color: "#f59e0b", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "image", Name: "图片相册", Color: "#f97316", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "audio", Name: "音乐音频", Color: "#ef4444", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "video", Name: "视频媒体", Color: "#a855f7", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "apk", Name: "安装包 (APK)", Color: "#3b82f6", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "doc", Name: "文档书籍", Color: "#10b981", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "archive", Name: "压缩归档", Color: "#06b6d4", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
		{ID: "other", Name: "系统数据 / 其他", Color: "#64748b", SizeBytes: 0, SizeFormat: "0 B", Percent: 0, UsedPercent: 0, FileCount: 0},
	}
}

func (ss *StorageScanner) TriggerScanAsync() bool {
	ss.mu.Lock()
	if ss.scanning {
		ss.mu.Unlock()
		return false
	}
	ss.mu.Unlock()

	select {
	case ss.scanTrigger <- struct{}{}:
		return true
	default:
		return false
	}
}

func (ss *StorageScanner) GetSnapshot() StorageDetailSnapshot {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	return ss.snapshot
}

func (ss *StorageScanner) backgroundWorker() {
	time.Sleep(10 * time.Second)
	ss.performScan()

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ss.performScan()
		case <-ss.scanTrigger:
			ss.performScan()
		}
	}
}

func (ss *StorageScanner) performScan() {
	ss.mu.Lock()
	if ss.scanning {
		ss.mu.Unlock()
		return
	}
	ss.scanning = true
	ss.snapshot.IsScanning = true
	root := ss.rootPath
	ss.mu.Unlock()

	defer func() {
		ss.mu.Lock()
		ss.scanning = false
		ss.snapshot.IsScanning = false
		ss.mu.Unlock()
	}()

	// 1. 获取全局 statfs
	var stat syscall.Statfs_t
	var totalBytes, freeBytes, usedBytes uint64
	if err := syscall.Statfs(root, &stat); err == nil {
		totalBytes = uint64(stat.Blocks) * uint64(stat.Bsize)
		freeBytes = uint64(stat.Bavail) * uint64(stat.Bsize)
		if totalBytes >= freeBytes {
			usedBytes = totalBytes - freeBytes
		}
	}

	// 2. 分类累加器
	var appSize, imgSize, audSize, vidSize, apkSize, docSize, archSize, othSize uint64
	var appCount, imgCount, audCount, vidCount, apkCount, docCount, archCount, othCount int

	androidDirPrefix := filepath.Join(root, "Android")

	// 3. 极低开销目录树遍历 (每 500 个文件主动让出 CPU 时间片，确保不抢占前台)
	walkCount := 0
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		walkCount++
		if walkCount%500 == 0 {
			runtime.Gosched() // 让出 CPU 时间片
		}

		if d.IsDir() {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		sz := uint64(info.Size())

		// 判断是否属于 Android 应用数据目录 (/data/media/0/Android/...)
		if strings.HasPrefix(path, androidDirPrefix) {
			appSize += sz
			appCount++
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))

		switch {
		case extImages[ext]:
			imgSize += sz
			imgCount++
		case extAudio[ext]:
			audSize += sz
			audCount++
		case extVideo[ext]:
			vidSize += sz
			vidCount++
		case extAPKs[ext]:
			apkSize += sz
			apkCount++
		case extDocs[ext]:
			docSize += sz
			docCount++
		case extArchives[ext]:
			archSize += sz
			archCount++
		default:
			othSize += sz
			othCount++
		}

		return nil
	})

	// 计算其他未归类部分与总已用空间对比
	classifiedSum := appSize + imgSize + audSize + vidSize + apkSize + docSize + archSize + othSize
	if usedBytes > classifiedSum {
		othSize += (usedBytes - classifiedSum)
	}

	// 4. 计算百分比
	calcTotalPct := func(sz uint64) float64 {
		if totalBytes == 0 {
			return 0
		}
		return float64(sz) * 100.0 / float64(totalBytes)
	}

	calcUsedPct := func(sz uint64) float64 {
		if usedBytes == 0 {
			return 0
		}
		return float64(sz) * 100.0 / float64(usedBytes)
	}

	var usedPct, freePct float64
	if totalBytes > 0 {
		usedPct = float64(usedBytes) * 100.0 / float64(totalBytes)
		freePct = float64(freeBytes) * 100.0 / float64(totalBytes)
	}

	categories := []CategoryStatItem{
		{ID: "app", Name: "应用和数据", Color: "#f59e0b", SizeBytes: appSize, SizeFormat: formatFileSize(appSize), Percent: calcTotalPct(appSize), UsedPercent: calcUsedPct(appSize), FileCount: appCount},
		{ID: "image", Name: "图片相册", Color: "#f97316", SizeBytes: imgSize, SizeFormat: formatFileSize(imgSize), Percent: calcTotalPct(imgSize), UsedPercent: calcUsedPct(imgSize), FileCount: imgCount},
		{ID: "audio", Name: "音乐音频", Color: "#ef4444", SizeBytes: audSize, SizeFormat: formatFileSize(audSize), Percent: calcTotalPct(audSize), UsedPercent: calcUsedPct(audSize), FileCount: audCount},
		{ID: "video", Name: "视频媒体", Color: "#a855f7", SizeBytes: vidSize, SizeFormat: formatFileSize(vidSize), Percent: calcTotalPct(vidSize), UsedPercent: calcUsedPct(vidSize), FileCount: vidCount},
		{ID: "apk", Name: "安装包 (APK)", Color: "#3b82f6", SizeBytes: apkSize, SizeFormat: formatFileSize(apkSize), Percent: calcTotalPct(apkSize), UsedPercent: calcUsedPct(apkSize), FileCount: apkCount},
		{ID: "doc", Name: "文档书籍", Color: "#10b981", SizeBytes: docSize, SizeFormat: formatFileSize(docSize), Percent: calcTotalPct(docSize), UsedPercent: calcUsedPct(docSize), FileCount: docCount},
		{ID: "archive", Name: "压缩归档", Color: "#06b6d4", SizeBytes: archSize, SizeFormat: formatFileSize(archSize), Percent: calcTotalPct(archSize), UsedPercent: calcUsedPct(archSize), FileCount: archCount},
		{ID: "other", Name: "系统数据 / 其他", Color: "#64748b", SizeBytes: othSize, SizeFormat: formatFileSize(othSize), Percent: calcTotalPct(othSize), UsedPercent: calcUsedPct(othSize), FileCount: othCount},
	}

	ss.mu.Lock()
	ss.snapshot = StorageDetailSnapshot{
		TotalUsedBytes:  usedBytes,
		TotalFreeBytes:  freeBytes,
		TotalSizeBytes:  totalBytes,
		TotalUsedFormat: formatFileSize(usedBytes),
		TotalFreeFormat: formatFileSize(freeBytes),
		TotalSizeFormat: formatFileSize(totalBytes),
		UsedPercent:     usedPct,
		FreePercent:     freePct,
		LastScanTime:    time.Now().Format("2006-01-02 15:04:05"),
		IsScanning:      false,
		Categories:      categories,
	}
	ss.mu.Unlock()
}
