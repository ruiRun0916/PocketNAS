package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type CustomLink struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	URL  string `json:"url"`
	Icon string `json:"icon"`
	Desc string `json:"desc"`
}

type TailscaleConfig struct {
	IP          string       `json:"ip"`
	MagicDNS    string       `json:"magic_dns"`
	CustomLinks []CustomLink `json:"custom_links"`
}

type NavigationConfig struct {
	Order   []string        `json:"order"`
	Visible map[string]bool `json:"visible"`
}

type ServicesUIConfig struct {
	Order   []string        `json:"order"`
	Visible map[string]bool `json:"visible"`
}

type EmbeddingConfig struct {
	Alist bool `json:"alist"`
	Fsend bool `json:"fsend"`
}

type UIConfig struct {
	FontScale  string           `json:"font_scale"`
	Motion     string           `json:"motion"`
	Navigation NavigationConfig `json:"navigation"`
	Services   ServicesUIConfig `json:"services"`
	Embedding  EmbeddingConfig  `json:"embedding"`
	Tailscale  TailscaleConfig  `json:"tailscale"`
}

type Config struct {
	AppName          string   `json:"app_name"`
	Port             int      `json:"port"`
	FtpPort          int      `json:"ftp_port"`
	RefreshSeconds   int      `json:"refresh_seconds"`
	StoragePath      string   `json:"storage_path"`
	NetworkInterface string   `json:"network_interface"`
	AlistPort        int      `json:"alist_port"`
	UI               UIConfig `json:"ui"`
}

type StorageInfo struct {
	Target  string `json:"target"`
	Total   string `json:"total"`
	Used    string `json:"used"`
	Free    string `json:"free"`
	Percent string `json:"percent"`
}

type MemoryInfo struct {
	Total       string `json:"total"`
	Used        string `json:"used"`
	Free        string `json:"free"`
	Percent     int    `json:"percent"`
	Zram        string `json:"zram"`
	ZramPercent int    `json:"zram_percent"`
	Cached      string `json:"cached"`
}

type CPUInfo struct {
	Vendor    string            `json:"vendor"`
	Model     string            `json:"model"`
	ProcessNM int               `json:"process_nm"`
	Cores     int               `json:"cores"`
	Governor  string            `json:"governor"`
	Usage     int               `json:"usage"`
	GPUModel  string            `json:"gpu_model"`
	Clusters  []DetectedCluster `json:"clusters"`
}

type TempInfo struct {
	CPU     string `json:"cpu"`
	Battery string `json:"battery"`
}

type NetworkInfo struct {
	Interface     string `json:"interface"`
	IP            string `json:"ip"`
	Mac           string `json:"mac"`
	Gateway       string `json:"gateway"`
	MTU           string `json:"mtu"`
	RxDropped     string `json:"rx_dropped"`
	TxDropped     string `json:"tx_dropped"`
	RxErrors      string `json:"rx_errors"`
	TxErrors      string `json:"tx_errors"`
	Download      string `json:"download"`
	Upload        string `json:"upload"`
	TotalDownload string `json:"total_download"`
	TotalUpload   string `json:"total_upload"`
}

type ProtocolStatus struct {
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Status bool   `json:"status"`
	URL    string `json:"url"`
}

type DeviceInfo struct {
	Brand          string `json:"brand"`
	Model          string `json:"model"`
	MarketName     string `json:"market_name"`
	AndroidVersion string `json:"android_version"`
	KernelVersion  string `json:"kernel_version"`
	SELinux        string `json:"selinux"`
}

type StatusSnapshot struct {
	Device            DeviceInfo                `json:"device"`
	System            string                    `json:"system"`
	Kernel            string                    `json:"kernel"`
	SELinux           string                    `json:"selinux"`
	Uptime            string                    `json:"uptime"`
	LoadAvg           string                    `json:"loadavg"`
	Tasks             string                    `json:"tasks"`
	RefreshSeconds    int                       `json:"refresh_seconds"`
	Storage           StorageInfo               `json:"storage"`
	StorageCategories StorageDetailSnapshot     `json:"storage_categories"`
	Memory            MemoryInfo                `json:"memory"`
	CPU               CPUInfo                   `json:"cpu"`
	Temperature       TempInfo                  `json:"temperature"`
	Network           NetworkInfo               `json:"network"`
	Protocols         map[string]ProtocolStatus `json:"protocols"`
	Services          []ServiceSnapshot         `json:"services"`
	Battery           BatteryHealthInfo         `json:"battery"`
	Time              string                    `json:"time"`
}

var (
	currentSnapshot  StatusSnapshot
	snapshotMu       sync.RWMutex
	baseDir          string
	serverConfig     Config
	actualConfigPath string
	configMu         sync.RWMutex
	stMutex          sync.Mutex
	stRunning        bool
	stActiveTime     time.Time
	maxUploadBody    int64 = 512 * 1024 * 1024
)

func getExecutableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func defaultUIConfig() UIConfig {
	return UIConfig{
		FontScale: "standard",
		Motion:    "light",
		Navigation: NavigationConfig{
			Order:   []string{"overview", "storage", "network", "services", "alist", "fsend", "speedtest", "tailscale"},
			Visible: map[string]bool{"overview": true, "storage": true, "network": true, "services": true, "alist": true, "fsend": true, "speedtest": true, "tailscale": true},
		},
		Services: ServicesUIConfig{
			Order:   []string{"alist", "webdav", "ftp", "smb", "fsend"},
			Visible: map[string]bool{"alist": true, "webdav": true, "ftp": true, "smb": true, "fsend": true},
		},
		Embedding: EmbeddingConfig{Alist: true, Fsend: true},
		Tailscale: TailscaleConfig{
			IP: "",
			CustomLinks: []CustomLink{
				{ID: "link_ts_webdav", Name: "Tailscale 远程 WebDAV", URL: "http://{ts_ip}:5244/dav", Icon: "📺", Desc: "异地远程挂载 4K 原画免解压播放"},
				{ID: "link_ts_webui", Name: "Tailscale 远程控制台", URL: "http://{ts_ip}:8080", Icon: "🌐", Desc: "异地全功能遥测与运维控制"},
				{ID: "link_ts_admin", Name: "Tailscale 管理后台", URL: "https://login.tailscale.com/admin/machines", Icon: "🛡️", Desc: "设备在线状态与子网路由管理"},
			},
		},
	}
}

func loadConfig(bDir string, explicitConfigPath string) (Config, string) {
	cfg := Config{
		AppName:          "PocketNAS Pro",
		Port:             8080,
		FtpPort:          2121,
		RefreshSeconds:   2,
		StoragePath:      "/data/media/0",
		NetworkInterface: "wlan0",
		AlistPort:        5244,
		UI:               defaultUIConfig(),
	}

	cwd, _ := os.Getwd()
	var candidatePaths []string
	if explicitConfigPath != "" {
		candidatePaths = append(candidatePaths, explicitConfigPath)
	}

	candidatePaths = append(candidatePaths,
		filepath.Join(bDir, "config/config.json"),
		filepath.Join(cwd, "config/config.json"),
		filepath.Join(bDir, "../config/config.json"),
		filepath.Join(cwd, "../config/config.json"),
		filepath.Join(bDir, "config.json"),
		filepath.Join(cwd, "config.json"),
		"/data/adb/modules/pocket_nas/config/config.json",
		"/data/local/tmp/nas/config/config.json",
	)

	resolvedPath := ""
	for _, p := range candidatePaths {
		if p == "" {
			continue
		}
		cleanP := filepath.Clean(p)
		if fi, err := os.Stat(cleanP); err == nil && !fi.IsDir() {
			if data, err := os.ReadFile(cleanP); err == nil {
				if err := json.Unmarshal(data, &cfg); err == nil {
					resolvedPath = cleanP
					break
				}
			}
		}
	}

	if cfg.UI.FontScale == "" {
		cfg.UI.FontScale = "standard"
	}
	if cfg.UI.Motion == "" {
		cfg.UI.Motion = "light"
	}
	if len(cfg.UI.Navigation.Order) == 0 {
		cfg.UI.Navigation = defaultUIConfig().Navigation
	}
	if len(cfg.UI.Services.Order) == 0 {
		cfg.UI.Services = defaultUIConfig().Services
	}

	if _, err := os.Stat(cfg.StoragePath); err != nil {
		if _, err := os.Stat("/storage/emulated/0"); err == nil {
			cfg.StoragePath = "/storage/emulated/0"
		} else if _, err := os.Stat("/sdcard"); err == nil {
			cfg.StoragePath = "/sdcard"
		} else {
			cfg.StoragePath = "."
		}
	}

	return cfg, resolvedPath
}

func saveUIConfigLocked(newUI UIConfig) error {
	serverConfig.UI = newUI

	if actualConfigPath == "" {
		cwd, _ := os.Getwd()
		actualConfigPath = filepath.Join(bDirOrCwd(baseDir, cwd), "config/config.json")
	}

	_ = os.MkdirAll(filepath.Dir(actualConfigPath), 0755)

	diskMap := make(map[string]interface{})
	if data, err := os.ReadFile(actualConfigPath); err == nil {
		_ = json.Unmarshal(data, &diskMap)
	}

	diskMap["app_name"] = serverConfig.AppName
	diskMap["port"] = serverConfig.Port
	diskMap["ftp_port"] = serverConfig.FtpPort
	diskMap["refresh_seconds"] = serverConfig.RefreshSeconds
	diskMap["storage_path"] = serverConfig.StoragePath
	diskMap["network_interface"] = serverConfig.NetworkInterface
	diskMap["alist_port"] = serverConfig.AlistPort
	diskMap["ui"] = serverConfig.UI

	data, err := json.MarshalIndent(diskMap, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := actualConfigPath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, actualConfigPath)
}

func bDirOrCwd(bDir, cwd string) string {
	if fi, err := os.Stat(filepath.Join(bDir, "config")); err == nil && fi.IsDir() {
		return bDir
	}
	if fi, err := os.Stat(filepath.Join(bDir, "../config")); err == nil && fi.IsDir() {
		return filepath.Join(bDir, "..")
	}
	if cwd != "" {
		return cwd
	}
	return bDir
}

func formatBytesRate(b uint64) string {
	if b >= 1073741824 {
		return fmt.Sprintf("%.1f GB/s", float64(b)/1073741824.0)
	} else if b >= 1048576 {
		return fmt.Sprintf("%.1f MB/s", float64(b)/1048576.0)
	} else if b >= 1024 {
		return fmt.Sprintf("%d KB/s", b/1024)
	}
	return fmt.Sprintf("%d B/s", b)
}

func formatTraffic(b uint64) string {
	if b >= 1073741824 {
		return fmt.Sprintf("%.1f GB", float64(b)/1073741824.0)
	} else if b >= 1048576 {
		return fmt.Sprintf("%.1f MB", float64(b)/1048576.0)
	}
	return fmt.Sprintf("%d KB", b/1024)
}

func formatKB(kb uint64) string {
	if kb == 0 {
		return "--"
	}
	if kb >= 1048576 {
		return fmt.Sprintf("%.1f GB", float64(kb)/1048576.0)
	}
	return fmt.Sprintf("%d MB", kb/1024)
}

func getPhysicalLANIP() (net.IP, string) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return net.ParseIP("127.0.0.1"), "lo"
	}

	var fallbackIP net.IP
	var fallbackName string

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		name := strings.ToLower(iface.Name)
		if strings.HasPrefix(name, "tun") || strings.HasPrefix(name, "tap") ||
			strings.HasPrefix(name, "ppp") || strings.HasPrefix(name, "dummy") ||
			strings.HasPrefix(name, "sit") || strings.HasPrefix(name, "p2p") {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}

			if ip != nil && ip.To4() != nil && !ip.IsLoopback() {
				if strings.HasPrefix(name, "wlan") || strings.HasPrefix(name, "eth") {
					return ip.To4(), iface.Name
				}
				if fallbackIP == nil {
					fallbackIP = ip.To4()
					fallbackName = iface.Name
				}
			}
		}
	}

	if fallbackIP != nil {
		return fallbackIP, fallbackName
	}
	return net.ParseIP("127.0.0.1"), "lo"
}

func startMetricsCollector(storagePath string) {
	snapshotMu.Lock()
	currentSnapshot.Device = DeviceInfo{
		Brand:          GlobalHardwareInfo.Brand,
		Model:          GlobalHardwareInfo.Model,
		MarketName:     GlobalHardwareInfo.MarketName,
		AndroidVersion: GlobalHardwareInfo.AndroidVersion,
		KernelVersion:  GlobalHardwareInfo.KernelVersion,
		SELinux:        "Enforcing",
	}
	currentSnapshot.System = GlobalHardwareInfo.AndroidVersion
	currentSnapshot.Kernel = GlobalHardwareInfo.KernelVersion
	currentSnapshot.SELinux = "Enforcing"
	currentSnapshot.RefreshSeconds = serverConfig.RefreshSeconds
	currentSnapshot.CPU = CPUInfo{
		Vendor:    GlobalHardwareInfo.SoCVendor,
		Model:     GlobalHardwareInfo.SoCModel,
		ProcessNM: GlobalHardwareInfo.ProcessNM,
		Cores:     GlobalHardwareInfo.TotalCPUCores,
		Governor:  "schedutil",
		Usage:     0,
		GPUModel:  GlobalHardwareInfo.GPUModel,
		Clusters:  GlobalHardwareInfo.Clusters,
	}
	currentSnapshot.Protocols = make(map[string]ProtocolStatus)
	currentSnapshot.Services = make([]ServiceSnapshot, 0)
	currentSnapshot.StorageCategories = GlobalStorageScanner.GetSnapshot()
	snapshotMu.Unlock()

	go func() {
		var prevTotalCPU, prevIdleCPU uint64
		prevCoreTotal := make(map[int]uint64)
		prevCoreIdle := make(map[int]uint64)
		var prevRx, prevTx uint64
		var prevTime time.Time = time.Now()

		tickCount := 0

		for {
			now := time.Now()
			elapsed := now.Sub(prevTime).Seconds()
			if elapsed <= 0 {
				elapsed = 1.0
			}

			var curTotalUsage int
			perCoreUsage := make(map[int]int)

			if file, err := os.Open("/proc/stat"); err == nil {
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					if strings.HasPrefix(line, "cpu ") {
						fields := strings.Fields(line)[1:]
						if len(fields) >= 7 {
							var nums [7]uint64
							for i := 0; i < 7; i++ {
								nums[i], _ = strconv.ParseUint(fields[i], 10, 64)
							}
							total := nums[0] + nums[1] + nums[2] + nums[3] + nums[4] + nums[5] + nums[6]
							idle := nums[3] + nums[4]

							if prevTotalCPU > 0 && total > prevTotalCPU {
								diffTotal := total - prevTotalCPU
								diffIdle := idle - prevIdleCPU
								if diffTotal > diffIdle {
									curTotalUsage = int((diffTotal - diffIdle) * 100 / diffTotal)
								}
							}
							prevTotalCPU = total
							prevIdleCPU = idle
						}
					} else if strings.HasPrefix(line, "cpu") {
						fields := strings.Fields(line)
						coreTag := fields[0]
						coreIdxStr := strings.TrimPrefix(coreTag, "cpu")
						if coreIdx, err := strconv.Atoi(coreIdxStr); err == nil && len(fields) >= 8 {
							var nums [7]uint64
							for i := 0; i < 7; i++ {
								nums[i], _ = strconv.ParseUint(fields[i+1], 10, 64)
							}
							cTotal := nums[0] + nums[1] + nums[2] + nums[3] + nums[4] + nums[5] + nums[6]
							cIdle := nums[3] + nums[4]

							if pTotal, ok := prevCoreTotal[coreIdx]; ok && cTotal > pTotal {
								pIdle := prevCoreIdle[coreIdx]
								dTotal := cTotal - pTotal
								dIdle := cIdle - pIdle
								if dTotal > dIdle {
									perCoreUsage[coreIdx] = int((dTotal - dIdle) * 100 / dTotal)
								}
							}
							prevCoreTotal[coreIdx] = cTotal
							prevCoreIdle[coreIdx] = cIdle
						}
					}
				}
				file.Close()
			}

			liveClusters := CalculateClusterUsages(GlobalHardwareInfo.Clusters, perCoreUsage)

			var curRx, curTx uint64
			var netIf string = "wlan0"
			if file, err := os.Open("/proc/net/dev"); err == nil {
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					if strings.Contains(line, ":") {
						parts := strings.SplitN(line, ":", 2)
						iface := strings.TrimSpace(parts[0])
						if iface == "wlan0" || iface == "eth0" || iface == "rmnet_data0" || iface == "rndis0" || iface == "ap0" || iface == "tailscale0" {
							fields := strings.Fields(parts[1])
							if len(fields) >= 9 {
								rx, _ := strconv.ParseUint(fields[0], 10, 64)
								tx, _ := strconv.ParseUint(fields[8], 10, 64)
								curRx += rx
								curTx += tx
								netIf = iface
							}
						}
					}
				}
				file.Close()
			}

			var downRate, upRate string = "0 B/s", "0 B/s"
			if prevRx > 0 && curRx >= prevRx && elapsed >= 0.3 {
				rxDelta := uint64(float64(curRx-prevRx) / elapsed)
				txDelta := uint64(float64(curTx-prevTx) / elapsed)
				downRate = formatBytesRate(rxDelta)
				upRate = formatBytesRate(txDelta)
			}
			prevRx = curRx
			prevTx = curTx
			prevTime = now

			lanIP, lanIface := getPhysicalLANIP()
			curIP := lanIP.String()
			curMAC := "--"
			if ifaceObj, err := net.InterfaceByName(lanIface); err == nil {
				curMAC = ifaceObj.HardwareAddr.String()
			}

			servicesList := GlobalServiceMonitor.GetSnapshots(curIP)

			snapshotMu.Lock()
			currentSnapshot.CPU.Usage = curTotalUsage
			currentSnapshot.CPU.Clusters = liveClusters
			currentSnapshot.Network.Interface = netIf
			currentSnapshot.Network.Download = downRate
			currentSnapshot.Network.Upload = upRate
			currentSnapshot.Network.TotalDownload = formatTraffic(curRx)
			currentSnapshot.Network.TotalUpload = formatTraffic(curTx)
			currentSnapshot.Network.IP = curIP
			currentSnapshot.Network.Mac = curMAC
			currentSnapshot.Time = now.Format("2006-01-02 15:04:05")
			currentSnapshot.StorageCategories = GlobalStorageScanner.GetSnapshot()
			currentSnapshot.Services = servicesList
			snapshotMu.Unlock()

			if tickCount%2 == 0 {
				var memTotal, memAvail, swapTotal, swapFree, cached, buffers uint64
				if file, err := os.Open("/proc/meminfo"); err == nil {
					scanner := bufio.NewScanner(file)
					for scanner.Scan() {
						line := scanner.Text()
						parts := strings.Fields(line)
						if len(parts) >= 2 {
							val, _ := strconv.ParseUint(parts[1], 10, 64)
							switch parts[0] {
							case "MemTotal:":
								memTotal = val
							case "MemAvailable:":
								memAvail = val
							case "SwapTotal:":
								swapTotal = val
							case "SwapFree:":
								swapFree = val
							case "Cached:":
								cached = val
							case "Buffers:":
								buffers = val
							}
						}
					}
					file.Close()
				}

				var memPct int
				var memUsed uint64
				if memTotal > 0 && memTotal >= memAvail {
					memUsed = memTotal - memAvail
					memPct = int(memUsed * 100 / memTotal)
				}

				var swapUsed, swapPct uint64
				var swapStr string = "未开启"
				if swapTotal > 0 && swapTotal >= swapFree {
					swapUsed = swapTotal - swapFree
					swapPct = swapUsed * 100 / swapTotal
					swapStr = fmt.Sprintf("%s / %s", formatKB(swapUsed), formatKB(swapTotal))
				}

				var loadAvgStr, tasksStr string = "--", "--"
				if data, err := os.ReadFile("/proc/loadavg"); err == nil {
					fields := strings.Fields(string(data))
					if len(fields) >= 4 {
						loadAvgStr = fmt.Sprintf("%s / %s / %s", fields[0], fields[1], fields[2])
						tasksStr = fields[3]
					}
				}

				var uptimeStr string = "--"
				if data, err := os.ReadFile("/proc/uptime"); err == nil {
					fields := strings.Fields(string(data))
					if len(fields) > 0 {
						if sec, err := strconv.ParseFloat(fields[0], 64); err == nil {
							totalSec := int(sec)
							days := totalSec / 86400
							hours := (totalSec % 86400) / 3600
							mins := (totalSec % 3600) / 60
							if days > 0 {
								uptimeStr = fmt.Sprintf("%d天 %d时 %d分", days, hours, mins)
							} else {
								uptimeStr = fmt.Sprintf("%d小时 %d分", hours, mins)
							}
						}
					}
				}

				snapshotMu.Lock()
				currentSnapshot.Uptime = uptimeStr
				currentSnapshot.LoadAvg = loadAvgStr
				currentSnapshot.Tasks = tasksStr
				currentSnapshot.Memory.Total = formatKB(memTotal)
				currentSnapshot.Memory.Used = formatKB(memUsed)
				currentSnapshot.Memory.Free = formatKB(memAvail)
				currentSnapshot.Memory.Percent = memPct
				currentSnapshot.Memory.Zram = swapStr
				currentSnapshot.Memory.ZramPercent = int(swapPct)
				currentSnapshot.Memory.Cached = formatKB(cached + buffers)
				snapshotMu.Unlock()
			}

			if tickCount%3 == 0 {
				var cpuT, batT string
				for i := 0; i < 30; i++ {
					tPath := fmt.Sprintf("/sys/class/thermal/thermal_zone%d/temp", i)
					if data, err := os.ReadFile(tPath); err == nil {
						raw, err := strconv.Atoi(strings.TrimSpace(string(data)))
						if err == nil && raw > 20000 && raw < 110000 {
							cpuT = strconv.Itoa(raw / 1000)
							break
						}
					}
				}
				for _, bPath := range []string{
					"/sys/class/power_supply/battery/temp",
					"/sys/class/power_supply/bms/temp",
					"/sys/class/power_supply/battery/batt_temp",
				} {
					if data, err := os.ReadFile(bPath); err == nil {
						raw, err := strconv.Atoi(strings.TrimSpace(string(data)))
						if err == nil && raw > 0 {
							if raw > 1000 {
								batT = strconv.Itoa(raw / 1000)
							} else if raw > 100 {
								batT = strconv.Itoa(raw / 10)
							} else {
								batT = strconv.Itoa(raw)
							}
							break
						}
					}
				}

				var vMv, iMa int
				for _, vf := range []string{
					"/sys/class/power_supply/battery/voltage_now",
					"/sys/class/power_supply/bms/voltage_now",
					"/sys/class/power_supply/battery/batt_vol",
				} {
					if data, err := os.ReadFile(vf); err == nil {
						val, err := strconv.Atoi(strings.TrimSpace(string(data)))
						if err == nil && val > 0 {
							if val >= 1000000 {
								vMv = val / 1000
							} else if val >= 1000 {
								vMv = val
							}
							break
						}
					}
				}

				for _, ifile := range []string{
					"/sys/class/power_supply/battery/current_now",
					"/sys/class/power_supply/bms/current_now",
					"/sys/class/power_supply/battery/batt_current",
				} {
					if data, err := os.ReadFile(ifile); err == nil {
						val, err := strconv.Atoi(strings.TrimSpace(string(data)))
						if err == nil && val != 0 {
							if val >= 10000 || val <= -10000 {
								iMa = val / 1000
							} else {
								iMa = val
							}
							break
						}
					}
				}

				bLevel := ""
				if data, err := os.ReadFile("/sys/class/power_supply/battery/capacity"); err == nil {
					bLevel = strings.TrimSpace(string(data))
				}
				bStatus := "Discharging"
				if data, err := os.ReadFile("/sys/class/power_supply/battery/status"); err == nil {
					bStatus = strings.TrimSpace(string(data))
				}

				batteryTelemetry := GlobalBatteryProvider.CollectTelemetry(vMv, iMa, bLevel, bStatus, batT)

				snapshotMu.Lock()
				currentSnapshot.Temperature.CPU = cpuT
				currentSnapshot.Temperature.Battery = batT
				currentSnapshot.Battery = batteryTelemetry
				snapshotMu.Unlock()
			}

			if tickCount%30 == 0 {
				var stat syscall.Statfs_t
				var totalKB, usedKB, freeKB uint64
				var pctStr string = ""

				if err := syscall.Statfs(storagePath, &stat); err == nil {
					totalBytes := uint64(stat.Blocks) * uint64(stat.Bsize)
					freeBytes := uint64(stat.Bavail) * uint64(stat.Bsize)
					if totalBytes >= freeBytes && totalBytes > 0 {
						usedBytes := totalBytes - freeBytes
						totalKB = totalBytes / 1024
						usedKB = usedBytes / 1024
						freeKB = freeBytes / 1024
						pctStr = fmt.Sprintf("%.1f", float64(usedBytes)*100.0/float64(totalBytes))
					}
				}

				snapshotMu.Lock()
				currentSnapshot.Storage.Target = storagePath
				currentSnapshot.Storage.Total = formatKB(totalKB)
				currentSnapshot.Storage.Used = formatKB(usedKB)
				currentSnapshot.Storage.Free = formatKB(freeKB)
				currentSnapshot.Storage.Percent = pctStr
				snapshotMu.Unlock()
			}

			tickCount++
			time.Sleep(1 * time.Second)
		}
	}()
}

type FTPSession struct {
	conn         net.Conn
	reader       *bufio.Reader
	rootDir      string
	cwd          string
	dataListener net.Listener
	binaryMode   bool
	renameFrom   string
	mu           sync.Mutex
}

func startFTPServer(port int, rootDir string) {
	cleanRoot, err := filepath.EvalSymlinks(rootDir)
	if err != nil {
		cleanRoot = filepath.Clean(rootDir)
	}

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Printf("[FTP] 端口 %d 监听失败: %v\n", port, err)
		return
	}

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}
			session := &FTPSession{
				conn:       conn,
				reader:     bufio.NewReader(conn),
				rootDir:    cleanRoot,
				cwd:        "/",
				binaryMode: true,
			}
			go session.handle()
		}
	}()
}

func (s *FTPSession) safeResolvePath(userPath string, forCreation bool) (string, error) {
	cleanRoot := s.rootDir

	var cleanRel string
	if strings.HasPrefix(userPath, "/") {
		cleanRel = filepath.Clean(userPath)
	} else {
		cleanRel = filepath.Clean(filepath.Join(s.cwd, userPath))
	}
	cleanRel = strings.TrimPrefix(cleanRel, "/")

	target := filepath.Clean(filepath.Join(cleanRoot, cleanRel))

	if target != cleanRoot && !strings.HasPrefix(target, cleanRoot+string(filepath.Separator)) {
		return "", errors.New("access denied: path outside root")
	}

	if fi, err := os.Lstat(target); err == nil {
		if fi.Mode()&os.ModeSymlink != 0 {
			realPath, err := filepath.EvalSymlinks(target)
			if err != nil {
				return "", errors.New("access denied: invalid symlink")
			}
			if realPath != cleanRoot && !strings.HasPrefix(realPath, cleanRoot+string(filepath.Separator)) {
				return "", errors.New("access denied: symlink escape detected")
			}
			return realPath, nil
		}
		return target, nil
	}

	if forCreation {
		parent := filepath.Dir(target)
		if realParent, err := filepath.EvalSymlinks(parent); err == nil {
			if realParent != cleanRoot && !strings.HasPrefix(realParent, cleanRoot+string(filepath.Separator)) {
				return "", errors.New("access denied: parent directory symlink escape")
			}
		}
	}

	return target, nil
}

func (s *FTPSession) handle() {
	defer s.conn.Close()
	s.send("220 PocketNAS Pro Secure FTP Server Ready.")

	for {
		line, err := s.reader.ReadString('\n')
		if err != nil {
			break
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		cmd := strings.ToUpper(parts[0])
		arg := ""
		if len(parts) > 1 {
			arg = strings.TrimSpace(parts[1])
		}

		switch cmd {
		case "USER":
			s.send("331 User name okay, need password.")
		case "PASS":
			s.send("230 User logged in, proceed.")
		case "SYST":
			s.send("215 UNIX Type: L8")
		case "FEAT":
			s.send("211-Features:\r\n UTF8\r\n SIZE\r\n PASV\r\n EPSV\r\n REST STREAM\r\n211 End")
		case "PWD", "XPWD":
			s.send(fmt.Sprintf("257 \"%s\" is current directory.", s.cwd))
		case "TYPE":
			s.binaryMode = (strings.ToUpper(arg) == "I" || strings.ToUpper(arg) == "L 8")
			s.send("200 Type set to " + arg)
		case "CWD", "XCWD":
			target, err := s.safeResolvePath(arg, false)
			if err != nil {
				s.send("550 Access denied.")
				continue
			}
			if stat, err := os.Stat(target); err == nil && stat.IsDir() {
				if strings.HasPrefix(arg, "/") {
					s.cwd = filepath.Clean(arg)
				} else {
					s.cwd = filepath.Clean(filepath.Join(s.cwd, arg))
				}
				s.send("250 Directory successfully changed.")
			} else {
				s.send("550 Failed to change directory.")
			}
		case "CDUP", "XCUP":
			s.cwd = filepath.Dir(s.cwd)
			if !strings.HasPrefix(s.cwd, "/") {
				s.cwd = "/"
			}
			s.send("250 Directory changed to " + s.cwd)
		case "PASV":
			s.handlePASV()
		case "EPSV":
			s.handleEPSV()
		case "LIST", "NLST":
			s.handleLIST(arg)
		case "RETR":
			s.handleRETR(arg)
		case "STOR":
			s.handleSTOR(arg)
		case "DELE":
			target, err := s.safeResolvePath(arg, false)
			if err != nil {
				s.send("550 Access denied.")
				continue
			}
			if target == s.rootDir {
				s.send("550 Cannot delete root directory.")
				continue
			}
			if err := os.Remove(target); err == nil {
				s.send("250 File deleted successfully.")
			} else {
				s.send("550 Delete failed.")
			}
		case "RMD", "XRMD":
			target, err := s.safeResolvePath(arg, false)
			if err != nil {
				s.send("550 Access denied.")
				continue
			}
			if target == s.rootDir {
				s.send("550 Cannot delete root directory.")
				continue
			}
			if err := os.RemoveAll(target); err == nil {
				s.send("250 Directory removed.")
			} else {
				s.send("550 Remove directory failed.")
			}
		case "MKD", "XMKD":
			target, err := s.safeResolvePath(arg, true)
			if err != nil {
				s.send("550 Access denied.")
				continue
			}
			if err := os.MkdirAll(target, 0777); err == nil {
				s.send(fmt.Sprintf("257 \"%s\" created.", arg))
			} else {
				s.send("550 Create directory failed.")
			}
		case "RNFR":
			target, err := s.safeResolvePath(arg, false)
			if err != nil || target == s.rootDir {
				s.send("550 Access denied.")
				continue
			}
			if _, err := os.Stat(target); err == nil {
				s.renameFrom = target
				s.send("350 Ready for destination name.")
			} else {
				s.send("550 File not found.")
			}
		case "RNTO":
			if s.renameFrom == "" {
				s.send("503 Bad sequence of commands.")
				continue
			}
			target, err := s.safeResolvePath(arg, true)
			if err != nil || target == s.rootDir {
				s.send("550 Access denied.")
				s.renameFrom = ""
				continue
			}
			if err := os.Rename(s.renameFrom, target); err == nil {
				s.send("250 Rename successful.")
			} else {
				s.send("550 Rename failed.")
			}
			s.renameFrom = ""
		case "SIZE":
			target, err := s.safeResolvePath(arg, false)
			if err != nil {
				s.send("550 Access denied.")
				continue
			}
			if stat, err := os.Stat(target); err == nil && !stat.IsDir() {
				s.send(fmt.Sprintf("213 %d", stat.Size()))
			} else {
				s.send("550 Could not get file size.")
			}
		case "OPTS":
			s.send("200 Command okay.")
		case "NOOP":
			s.send("200 OK.")
		case "QUIT":
			s.send("221 Goodbye.")
			return
		default:
			s.send("502 Command not implemented.")
		}
	}
}

func (s *FTPSession) send(msg string) {
	_, _ = fmt.Fprintf(s.conn, "%s\r\n", msg)
}

func (s *FTPSession) handlePASV() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.dataListener != nil {
		s.dataListener.Close()
	}

	l, err := net.Listen("tcp", ":0")
	if err != nil {
		s.send("425 Can't open passive connection.")
		return
	}
	s.dataListener = l

	port := l.Addr().(*net.TCPAddr).Port
	p1 := port / 256
	p2 := port % 256

	host, _, _ := net.SplitHostPort(s.conn.LocalAddr().String())
	ip := net.ParseIP(host)
	if ip == nil || ip.IsLoopback() || ip.To4() == nil {
		ip = net.ParseIP("127.0.0.1")
	}
	ip4 := ip.To4()

	s.send(fmt.Sprintf("227 Entering Passive Mode (%d,%d,%d,%d,%d,%d)", ip4[0], ip4[1], ip4[2], ip4[3], p1, p2))
}

func (s *FTPSession) handleEPSV() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.dataListener != nil {
		s.dataListener.Close()
	}

	l, err := net.Listen("tcp", ":0")
	if err != nil {
		s.send("425 Can't open passive connection.")
		return
	}
	s.dataListener = l
	port := l.Addr().(*net.TCPAddr).Port

	s.send(fmt.Sprintf("229 Entering Extended Passive Mode (|||%d|)", port))
}

func (s *FTPSession) getDataConn() (net.Conn, error) {
	s.mu.Lock()
	l := s.dataListener
	s.dataListener = nil
	s.mu.Unlock()

	if l == nil {
		return nil, fmt.Errorf("no passive listener")
	}
	defer l.Close()

	_ = l.(*net.TCPListener).SetDeadline(time.Now().Add(10 * time.Second))
	conn, err := l.Accept()
	if err != nil {
		return nil, err
	}
	return conn, nil
}

func (s *FTPSession) handleLIST(arg string) {
	target, err := s.safeResolvePath(arg, false)
	if err != nil {
		s.send("550 Access denied.")
		return
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		s.send("550 Cannot read directory.")
		return
	}

	s.send("150 Opening ASCII mode data connection for file list.")
	dConn, err := s.getDataConn()
	if err != nil {
		s.send("425 Data connection failed.")
		return
	}
	defer dConn.Close()

	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		mode := "-rw-rw-rw-"
		if entry.IsDir() {
			mode = "drwxrwxrwx"
		}
		line := fmt.Sprintf("%s 1 owner group %10d %s %s\r\n",
			mode,
			info.Size(),
			info.ModTime().Format("Jan _2 15:04"),
			entry.Name(),
		)
		_, _ = dConn.Write([]byte(line))
	}

	s.send("226 Transfer complete.")
}

func (s *FTPSession) handleRETR(arg string) {
	target, err := s.safeResolvePath(arg, false)
	if err != nil {
		s.send("550 Access denied.")
		return
	}
	file, err := os.Open(target)
	if err != nil {
		s.send("550 File not found.")
		return
	}
	defer file.Close()

	s.send("150 Opening BINARY mode data connection.")
	dConn, err := s.getDataConn()
	if err != nil {
		s.send("425 Data connection failed.")
		return
	}
	defer dConn.Close()

	_, _ = io.Copy(dConn, file)
	s.send("226 Transfer complete.")
}

func (s *FTPSession) handleSTOR(arg string) {
	target, err := s.safeResolvePath(arg, true)
	if err != nil {
		s.send("550 Access denied.")
		return
	}
	file, err := os.Create(target)
	if err != nil {
		s.send("550 Cannot create file.")
		return
	}
	defer file.Close()

	s.send("150 Ok to send data.")
	dConn, err := s.getDataConn()
	if err != nil {
		s.send("425 Data connection failed.")
		return
	}
	defer dConn.Close()

	_, _ = io.Copy(file, dConn)
	s.send("226 Transfer complete.")
}

func acquireSpeedtestSlot() bool {
	stMutex.Lock()
	defer stMutex.Unlock()
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
	http.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"pong":true,"time":%d}`, time.Now().UnixNano()/int64(time.Millisecond))
	})

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
				return
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

	http.HandleFunc("/api/speedtest/upload", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		start := time.Now()
		n, _ := io.Copy(io.Discard, io.LimitReader(r.Body, maxUploadBody))
		_ = r.Body.Close()
		duration := time.Since(start)

		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"status":"ok","received_bytes":%d,"duration_ms":%d}`, n, duration.Milliseconds())
	})
}

func main() {
	var (
		flagPort    int
		flagRefresh int
		flagConfig  string
	)

	flag.IntVar(&flagPort, "port", 0, "Web 控制面板端口 (优先级高于 config.json)")
	flag.IntVar(&flagRefresh, "refresh", 0, "前端状态刷新间隔秒数")
	flag.StringVar(&flagConfig, "config", "", "指定 config.json 配置文件路径")
	flag.Parse()

	baseDir = getExecutableDir()
	cwd, _ := os.Getwd()

	var resolvedConfigPath string
	serverConfig, resolvedConfigPath = loadConfig(baseDir, flagConfig)
	actualConfigPath = resolvedConfigPath

	if flagPort > 0 {
		serverConfig.Port = flagPort
	}
	if flagRefresh > 0 {
		serverConfig.RefreshSeconds = flagRefresh
	}

	var configDir string
	if actualConfigPath != "" {
		configDir = filepath.Dir(actualConfigPath)
	} else {
		configDir = filepath.Join(baseDir, "config")
		if fi, err := os.Stat(configDir); err != nil || !fi.IsDir() {
			configDir = filepath.Join(baseDir, "../config")
		}
	}

	GlobalHardwareInfo = DetectHardwareInfo()
	GlobalStorageScanner.Init(serverConfig.StoragePath)
	GlobalServiceMonitor.Init(configDir)

	pidDir := filepath.Join(baseDir, "data")
	if fi, err := os.Stat(pidDir); err != nil || !fi.IsDir() {
		pidDir = filepath.Join(baseDir, "../data")
	}
	_ = os.MkdirAll(pidDir, 0755)
	pidPath := filepath.Join(pidDir, "pocket_nas.pid")
	_ = os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0644)

	startMetricsCollector(serverConfig.StoragePath)
	startFTPServer(serverConfig.FtpPort, serverConfig.StoragePath)
	registerSpeedtestHandlers()

	webDirCandidates := []string{
		filepath.Join(baseDir, "web"),
		filepath.Join(baseDir, "../web"),
		filepath.Join(cwd, "web"),
		filepath.Join(cwd, "server/web"),
	}
	if actualConfigPath != "" {
		webDirCandidates = append([]string{
			filepath.Join(filepath.Dir(actualConfigPath), "web"),
			filepath.Join(filepath.Dir(actualConfigPath), "../web"),
		}, webDirCandidates...)
	}
	webDirCandidates = append(webDirCandidates, "/data/adb/modules/pocket_nas/web", "./web")

	webDir := "./web"
	for _, d := range webDirCandidates {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			webDir = d
			break
		}
	}

	http.HandleFunc("/api/hardware", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.WriteHeader(http.StatusOK)
		data, _ := json.Marshal(GlobalHardwareInfo)
		_, _ = w.Write(data)
	})

	http.HandleFunc("/api/storage/categories", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.WriteHeader(http.StatusOK)
		data, _ := json.Marshal(GlobalStorageScanner.GetSnapshot())
		_, _ = w.Write(data)
	})

	http.HandleFunc("/api/storage/rescan", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		triggered := GlobalStorageScanner.TriggerScanAsync()
		w.WriteHeader(http.StatusOK)
		if triggered {
			_, _ = io.WriteString(w, `{"status":"ok","message":"已触发后台存储扫描"}`)
		} else {
			_, _ = io.WriteString(w, `{"status":"busy","message":"扫描任务已在运行中"}`)
		}
	})

	http.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")

		switch r.Method {
		case http.MethodGet:
			configMu.RLock()
			data, _ := json.Marshal(serverConfig)
			configMu.RUnlock()
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)

		case http.MethodPut, http.MethodPost:
			var req struct {
				UI UIConfig `json:"ui"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"invalid json body"}`)
				return
			}

			configMu.Lock()
			err := saveUIConfigLocked(req.UI)
			configMu.Unlock()

			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = fmt.Fprintf(w, `{"error":"%s"}`, err.Error())
				return
			}

			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"status":"ok","message":"配置已保存并持久化"}`)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/services", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		lanIP, _ := getPhysicalLANIP()
		curIP := lanIP.String()

		switch r.Method {
		case http.MethodGet:
			serviceID := r.URL.Query().Get("id")
			if serviceID != "" {
				if detail, ok := GlobalServiceMonitor.GetServiceDetail(serviceID, curIP); ok {
					w.WriteHeader(http.StatusOK)
					data, _ := json.Marshal(detail)
					_, _ = w.Write(data)
					return
				}
				w.WriteHeader(http.StatusNotFound)
				_, _ = io.WriteString(w, `{"error":"service not found"}`)
				return
			}
			w.WriteHeader(http.StatusOK)
			data, _ := json.Marshal(GlobalServiceMonitor.GetSnapshots(curIP))
			_, _ = w.Write(data)

		case http.MethodPost:
			var def ServiceDefinition
			if err := json.NewDecoder(r.Body).Decode(&def); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"invalid json"}`)
				return
			}
			if err := GlobalServiceMonitor.AddCustomService(def); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = fmt.Fprintf(w, `{"error":"%s"}`, err.Error())
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"status":"ok"}`)

		case http.MethodPut:
			var def ServiceDefinition
			if err := json.NewDecoder(r.Body).Decode(&def); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"invalid json"}`)
				return
			}
			if err := GlobalServiceMonitor.UpdateCustomService(def); err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = fmt.Fprintf(w, `{"error":"%s"}`, err.Error())
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"status":"ok"}`)

		case http.MethodDelete:
			id := r.URL.Query().Get("id")
			if id == "" {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":"missing id"}`)
				return
			}
			if err := GlobalServiceMonitor.DeleteCustomService(id); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = fmt.Fprintf(w, `{"error":"%s"}`, err.Error())
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, `{"status":"ok"}`)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		snapshotMu.RLock()
		data, err := json.Marshal(currentSnapshot)
		snapshotMu.RUnlock()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})

	fs := http.FileServer(http.Dir(webDir))
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	}))

	cfgDisplayPath := actualConfigPath
	if cfgDisplayPath == "" {
		cfgDisplayPath = "默认内置配置 (未检索到外部 config.json)"
	}

	fmt.Println("=========================================================")
	fmt.Println(" [PocketNAS Pro v3.3.4] 守护进程启动就绪 (0-Fork, 0-Disk I/O)")
	fmt.Printf(" - 配置文件路径: %s\n", cfgDisplayPath)
	fmt.Printf(" - Web 控制面板: http://0.0.0.0:%d\n", serverConfig.Port)
	fmt.Printf(" - 原生安全 FTP: ftp://0.0.0.0:%d (根目录: %s)\n", serverConfig.FtpPort, serverConfig.StoragePath)
	fmt.Printf(" - 状态刷新间隔: %d 秒\n", serverConfig.RefreshSeconds)
	fmt.Printf(" - 网页资源目录: %s\n", webDir)
	fmt.Println("=========================================================")

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(serverConfig.Port),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		log.Printf("[PocketNAS Pro 警告] Web 端口 %d 监听失败: %v (将在 3 秒后重试)\n", serverConfig.Port, err)
		time.Sleep(3 * time.Second)
		os.Exit(1)
	}
}
