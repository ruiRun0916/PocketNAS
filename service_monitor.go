package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// =========================================================
// PocketNAS Pro v3.3.1 - Unified Universal Service Monitor
// Pure Go · Zero-Fork Process & Port Telemetry · Dynamic CRUD
// =========================================================

type ServiceDefinition struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Builtin     bool   `json:"builtin"`
	Process     string `json:"process"`
	Port        int    `json:"port"`
	Detect      string `json:"detect"` // "PROCESS", "PORT", "PROCESS_AND_PORT", "PROCESS_OR_PORT"
	Web         bool   `json:"web"`
	WebURL      string `json:"web_url"`
	Description string `json:"description"`
	Enabled     bool   `json:"enabled"`
}

type ServiceSnapshot struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Builtin        bool    `json:"builtin"`
	Running        bool    `json:"running"`
	StatusText     string  `json:"status_text"`  // "● 运行中", "○ 已停止", "⚠ 异常"
	StatusClass    string  `json:"status_class"` // "ok", "wait", "err"
	PID            int     `json:"pid"`
	Process        string  `json:"process"`
	Port           int     `json:"port"`
	PortListening  bool    `json:"port_listening"`
	ProcessRunning bool    `json:"process_running"`
	CPUPercent     float64 `json:"cpu_percent"`
	RSSMB          float64 `json:"rss_mb"`
	Uptime         string  `json:"uptime"`
	Web            bool    `json:"web"`
	WebURL         string  `json:"web_url"`
	Description    string  `json:"description"`
	Enabled        bool    `json:"enabled"`
}

type ProcStatTracker struct {
	LastUTime uint64
	LastSTime uint64
	LastTotal uint64
	LastCheck time.Time
}

type ServiceMonitor struct {
	mu           sync.RWMutex
	configPath   string
	services     []ServiceDefinition
	snapshots    []ServiceSnapshot
	procTrackers map[int]*ProcStatTracker
}

var GlobalServiceMonitor = &ServiceMonitor{
	services:     make([]ServiceDefinition, 0),
	snapshots:    make([]ServiceSnapshot, 0),
	procTrackers: make(map[int]*ProcStatTracker),
}

func (sm *ServiceMonitor) Init(configDir string) {
	sm.mu.Lock()
	sm.configPath = filepath.Join(configDir, "services.json")
	sm.loadConfigLocked()
	sm.mu.Unlock()

	// 启动后台低频轮询协程 (每 5 秒刷新一次服务状态)
	go sm.backgroundWorker()
}

func (sm *ServiceMonitor) loadConfigLocked() {
	if data, err := os.ReadFile(sm.configPath); err == nil {
		var list []ServiceDefinition
		if err := json.Unmarshal(data, &list); err == nil && len(list) > 0 {
			sm.services = list
			return
		}
	}

	// 默认内置服务
	sm.services = []ServiceDefinition{
		{ID: "alist", Name: "AList / OpenList", Builtin: true, Process: "droid.alistlite", Port: 5244, Detect: "PROCESS_OR_PORT", Web: true, WebURL: "http://{ip}:5244", Description: "多网盘聚合与本地文件在线音视频预览", Enabled: true},
		{ID: "webdav", Name: "WebDAV 挂载服务", Builtin: true, Process: "droid.alistlite", Port: 5244, Detect: "PORT", Web: true, WebURL: "http://{ip}:5244/dav", Description: "Mac 访达 / Win 磁盘映射 / 电视 4K 播放协议", Enabled: true},
		{ID: "ftp", Name: "原生安全 FTP", Builtin: true, Process: "nas_server", Port: 2121, Detect: "PROCESS_OR_PORT", Web: false, WebURL: "ftp://{ip}:2121", Description: "24/7 局域网高速免密文件传输与全盘读写", Enabled: true},
		{ID: "smb", Name: "Samba / SMB 共享", Builtin: true, Process: "smbd0", Port: 445, Detect: "PORT", Web: false, WebURL: "\\\\{ip}\\PocketNAS", Description: "Windows 网络邻居与通用局域网 SMB 共享", Enabled: true},
		{ID: "ssh", Name: "SSH / SFTP 终端", Builtin: true, Process: "sshd", Port: 22, Detect: "PORT", Web: false, WebURL: "ssh root@{ip} -p 22", Description: "Android Root Shell 远程加密运维与终端交互", Enabled: true},
	}
	sm.saveConfigLocked()
}

func (sm *ServiceMonitor) saveConfigLocked() {
	if sm.configPath == "" {
		return
	}
	_ = os.MkdirAll(filepath.Dir(sm.configPath), 0755)
	if data, err := json.MarshalIndent(sm.services, "", "  "); err == nil {
		_ = os.WriteFile(sm.configPath, data, 0644)
	}
}

func (sm *ServiceMonitor) GetSnapshots(curIP string) []ServiceSnapshot {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	result := make([]ServiceSnapshot, len(sm.snapshots))
	copy(result, sm.snapshots)

	for i := range result {
		result[i].WebURL = strings.ReplaceAll(result[i].WebURL, "{ip}", curIP)
	}
	return result
}

func (sm *ServiceMonitor) GetServiceDetail(id string, curIP string) (ServiceSnapshot, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	for _, s := range sm.snapshots {
		if s.ID == id {
			s.WebURL = strings.ReplaceAll(s.WebURL, "{ip}", curIP)
			return s, true
		}
	}
	return ServiceSnapshot{}, false
}

func (sm *ServiceMonitor) AddCustomService(def ServiceDefinition) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if def.ID == "" {
		def.ID = fmt.Sprintf("custom_%d", time.Now().Unix())
	}
	def.Builtin = false
	def.Enabled = true

	sm.services = append(sm.services, def)
	sm.saveConfigLocked()
	sm.collectTelemetryLocked()
	return nil
}

func (sm *ServiceMonitor) UpdateCustomService(def ServiceDefinition) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for i, s := range sm.services {
		if s.ID == def.ID {
			if s.Builtin {
				// 内置服务仅允许修改部分显示参数
				sm.services[i].Enabled = def.Enabled
				sm.services[i].Description = def.Description
			} else {
				sm.services[i] = def
			}
			sm.saveConfigLocked()
			sm.collectTelemetryLocked()
			return nil
		}
	}
	return fmt.Errorf("service not found: %s", def.ID)
}

func (sm *ServiceMonitor) DeleteCustomService(id string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for i, s := range sm.services {
		if s.ID == id {
			if s.Builtin {
				return fmt.Errorf("内置服务不可删除")
			}
			sm.services = append(sm.services[:i], sm.services[i+1:]...)
			sm.saveConfigLocked()
			sm.collectTelemetryLocked()
			return nil
		}
	}
	return fmt.Errorf("service not found: %s", id)
}

func (sm *ServiceMonitor) backgroundWorker() {
	sm.mu.Lock()
	sm.collectTelemetryLocked()
	sm.mu.Unlock()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		sm.mu.Lock()
		sm.collectTelemetryLocked()
		sm.mu.Unlock()
	}
}

// 核心遥测：零 Fork 读取 /proc 监听端口、PID、CPU 与 RSS 内存
func (sm *ServiceMonitor) collectTelemetryLocked() {
	// 1. 读取所有监听中的 TCP 端口 (16 进制转 int)
	listeningPorts := make(map[int]bool)
	for _, tcpFile := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		if file, err := os.Open(tcpFile); err == nil {
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 4 && fields[3] == "0A" { // 0A 代表 LISTEN 状态
					parts := strings.Split(fields[1], ":")
					if len(parts) == 2 {
						if p, err := strconv.ParseInt(parts[1], 16, 32); err == nil {
							listeningPorts[int(p)] = true
						}
					}
				}
			}
			file.Close()
		}
	}

	// 2. 扫描 /proc 目录获取所有进程 PID 与 cmdline/comm
	procPids := make(map[string]int) // processName -> pid
	if entries, err := os.ReadDir("/proc"); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			pid, err := strconv.Atoi(entry.Name())
			if err != nil || pid <= 0 {
				continue
			}

			// 读取进程名称
			commPath := fmt.Sprintf("/proc/%d/comm", pid)
			if commBytes, err := os.ReadFile(commPath); err == nil {
				comm := strings.TrimSpace(string(commBytes))
				if comm != "" {
					procPids[comm] = pid
					procPids[strings.ToLower(comm)] = pid
				}
			}

			// 读取 cmdline
			cmdPath := fmt.Sprintf("/proc/%d/cmdline", pid)
			if cmdBytes, err := os.ReadFile(cmdPath); err == nil {
				cmd := string(cmdBytes)
				for _, part := range strings.Split(cmd, "\x00") {
					part = strings.TrimSpace(part)
					if part != "" {
						procPids[part] = pid
						procPids[filepath.Base(part)] = pid
						procPids[strings.ToLower(filepath.Base(part))] = pid
					}
				}
			}
		}
	}

	// 3. 读取系统全局总 CPU 时间 (用于进程 CPU% 计算)
	var sysTotalCPU uint64
	if file, err := os.Open("/proc/stat"); err == nil {
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "cpu ") {
				fields := strings.Fields(line)[1:]
				for _, f := range fields {
					v, _ := strconv.ParseUint(f, 10, 64)
					sysTotalCPU += v
				}
				break
			}
		}
		file.Close()
	}

	// 4. 为每个服务生成 Snapshot
	snapshots := make([]ServiceSnapshot, 0, len(sm.services))
	for _, def := range sm.services {
		if !def.Enabled {
			continue
		}

		portListening := false
		if def.Port > 0 {
			portListening = listeningPorts[def.Port]
		}

		matchedPid := 0
		procRunning := false
		if def.Process != "" {
			if p, ok := procPids[def.Process]; ok {
				matchedPid = p
				procRunning = true
			} else if p, ok := procPids[strings.ToLower(def.Process)]; ok {
				matchedPid = p
				procRunning = true
			}
		}

		// 根据判定策略评估整体运行状态
		isRunning := false
		statusText := "○ 已停止"
		statusClass := "wait"

		switch def.Detect {
		case "PROCESS":
			isRunning = procRunning
		case "PORT":
			isRunning = portListening
		case "PROCESS_AND_PORT":
			isRunning = procRunning && portListening
			if procRunning && !portListening {
				statusText = "⚠ 异常 (端口未监听)"
				statusClass = "err"
			}
		case "PROCESS_OR_PORT":
			fallthrough
		default:
			isRunning = procRunning || portListening
		}

		if isRunning {
			statusText = "● 运行中"
			statusClass = "ok"
		}

		// 读取进程详情 (CPU, RSS, Uptime)
		var cpuPct float64 = 0.0
		var rssMB float64 = 0.0
		var uptimeStr string = "--"

		if matchedPid > 0 {
			// 读取 RSS 内存
			statusFile := fmt.Sprintf("/proc/%d/status", matchedPid)
			if file, err := os.Open(statusFile); err == nil {
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					if strings.HasPrefix(line, "VmRSS:") {
						fields := strings.Fields(line)
						if len(fields) >= 2 {
							if kb, err := strconv.ParseFloat(fields[1], 64); err == nil {
								rssMB = kb / 1024.0
							}
						}
						break
					}
				}
				file.Close()
			}

			// 读取 CPU 时间
			statFile := fmt.Sprintf("/proc/%d/stat", matchedPid)
			if statBytes, err := os.ReadFile(statFile); err == nil {
				fields := strings.Fields(string(statBytes))
				if len(fields) >= 15 {
					uTime, _ := strconv.ParseUint(fields[13], 10, 64)
					sTime, _ := strconv.ParseUint(fields[14], 10, 64)
					procTotal := uTime + sTime

					tracker, ok := sm.procTrackers[matchedPid]
					now := time.Now()
					if ok && sysTotalCPU > tracker.LastTotal && now.Sub(tracker.LastCheck).Seconds() >= 1.0 {
						deltaProc := procTotal - (tracker.LastUTime + tracker.LastSTime)
						deltaSys := sysTotalCPU - tracker.LastTotal
						if deltaSys > 0 {
							cpuPct = float64(deltaProc) * 100.0 / float64(deltaSys)
							if cpuPct < 0 {
								cpuPct = 0
							}
						}
					}
					sm.procTrackers[matchedPid] = &ProcStatTracker{
						LastUTime: uTime,
						LastSTime: sTime,
						LastTotal: sysTotalCPU,
						LastCheck: now,
					}
				}
			}

			// 计算 Uptime
			if fi, err := os.Stat(fmt.Sprintf("/proc/%d", matchedPid)); err == nil {
				dur := time.Since(fi.ModTime())
				hrs := int(dur.Hours())
				mins := int(dur.Minutes()) % 60
				if hrs > 24 {
					days := hrs / 24
					uptimeStr = fmt.Sprintf("%d天 %d小时", days, hrs%24)
				} else if hrs > 0 {
					uptimeStr = fmt.Sprintf("%d小时 %d分", hrs, mins)
				} else {
					uptimeStr = fmt.Sprintf("%d分", mins)
				}
			}
		}

		snapshots = append(snapshots, ServiceSnapshot{
			ID:             def.ID,
			Name:           def.Name,
			Builtin:        def.Builtin,
			Running:        isRunning,
			StatusText:     statusText,
			StatusClass:    statusClass,
			PID:            matchedPid,
			Process:        def.Process,
			Port:           def.Port,
			PortListening:  portListening,
			ProcessRunning: procRunning,
			CPUPercent:     cpuPct,
			RSSMB:          rssMB,
			Uptime:         uptimeStr,
			Web:            def.Web,
			WebURL:         def.WebURL,
			Description:    def.Description,
			Enabled:        def.Enabled,
		})
	}

	sm.snapshots = snapshots
}
