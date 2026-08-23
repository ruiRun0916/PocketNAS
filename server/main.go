package main

import (
	"bufio"
	"encoding/json"
	"errors"
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

// =========================================================
// PocketNAS Pro v3.2 - Hardened In-Memory Daemon & True mDNS
// =========================================================

type MDNSConfig struct {
	Enabled  bool   `json:"enabled"`
	Hostname string `json:"hostname"`
}

type Config struct {
	Port           int        `json:"port"`
	FtpPort        int        `json:"ftp_port"`
	RefreshSeconds int        `json:"refresh_seconds"`
	AppName        string     `json:"app_name"`
	StoragePath    string     `json:"storage_path"`
	MDNS           MDNSConfig `json:"mdns"`
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
	Model    string `json:"model"`
	Cores    int    `json:"cores"`
	Governor string `json:"governor"`
	Usage    int    `json:"usage"`
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

type MDNSStatusInfo struct {
	Enabled   bool   `json:"enabled"`
	Hostname  string `json:"hostname"`
	URL       string `json:"url"`
	IP        string `json:"ip"`
	Interface string `json:"interface"`
	Status    bool   `json:"status"`
	Message   string `json:"message"`
}

type BatteryInfo struct {
	Level       string `json:"level"`
	Charging    bool   `json:"charging"`
	Temperature string `json:"temperature"`
	Power       string `json:"power"`
	Voltage     string `json:"voltage"`
	Current     string `json:"current"`
}

type StatusSnapshot struct {
	Device      string                    `json:"device"`
	System      string                    `json:"system"`
	Kernel      string                    `json:"kernel"`
	SELinux     string                    `json:"selinux"`
	Uptime      string                    `json:"uptime"`
	LoadAvg     string                    `json:"loadavg"`
	Tasks       string                    `json:"tasks"`
	Storage     StorageInfo               `json:"storage"`
	Memory      MemoryInfo                `json:"memory"`
	CPU         CPUInfo                   `json:"cpu"`
	Temperature TempInfo                  `json:"temperature"`
	Network     NetworkInfo               `json:"network"`
	MDNS        MDNSStatusInfo            `json:"mdns"`
	Protocols   map[string]ProtocolStatus `json:"protocols"`
	Battery     BatteryInfo               `json:"battery"`
	Time        string                    `json:"time"`
}

var (
	currentSnapshot StatusSnapshot
	snapshotMu      sync.RWMutex
	baseDir         string
	serverConfig    Config
	mdnsInstance    *MDNSServer
)

func getExecutableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func loadConfig(bDir string) Config {
	cfg := Config{
		Port:           8080,
		FtpPort:        2121,
		RefreshSeconds: 2,
		AppName:        "PocketNAS Pro",
		StoragePath:    "/data/media/0",
		MDNS: MDNSConfig{
			Enabled:  true,
			Hostname: "pocketnas",
		},
	}

	confPaths := []string{
		filepath.Join(bDir, "../config/config.json"),
		filepath.Join(bDir, "config.json"),
		"/data/adb/modules/pocket_nas/config/config.json",
	}

	for _, p := range confPaths {
		if data, err := os.ReadFile(p); err == nil {
			_ = json.Unmarshal(data, &cfg)
			break
		}
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

	return cfg
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

func startMetricsCollector(storagePath string) {
	snapshotMu.Lock()
	currentSnapshot.Device = "Android Device"
	if data, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		currentSnapshot.Kernel = "Linux " + strings.TrimSpace(string(data))
	} else {
		currentSnapshot.Kernel = "Linux"
	}
	currentSnapshot.System = "Android"
	currentSnapshot.SELinux = "Enforcing"
	currentSnapshot.CPU.Model = "Qualcomm Octa-Core"
	currentSnapshot.CPU.Cores = 8
	currentSnapshot.CPU.Governor = "schedutil"
	currentSnapshot.Protocols = make(map[string]ProtocolStatus)
	snapshotMu.Unlock()

	go func() {
		var prevTotalCPU, prevIdleCPU uint64
		var prevRx, prevTx uint64
		var prevTime time.Time = time.Now()

		tickCount := 0

		for {
			now := time.Now()
			elapsed := now.Sub(prevTime).Seconds()
			if elapsed <= 0 {
				elapsed = 1.0
			}

			// --- 每秒采集: CPU 负载 ---
			var curUsage int
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
									curUsage = int((diffTotal - diffIdle) * 100 / diffTotal)
								}
							}
							prevTotalCPU = total
							prevIdleCPU = idle
						}
						break
					}
				}
				file.Close()
			}

			// --- 每秒采集: 网络吞吐微秒精准计算 ---
			var curRx, curTx uint64
			var netIf string = "wlan0"
			if file, err := os.Open("/proc/net/dev"); err == nil {
				scanner := bufio.NewScanner(file)
				for scanner.Scan() {
					line := scanner.Text()
					if strings.Contains(line, ":") {
						parts := strings.SplitN(line, ":", 2)
						iface := strings.TrimSpace(parts[0])
						if iface == "wlan0" || iface == "eth0" || iface == "rmnet_data0" || iface == "rndis0" || iface == "ap0" {
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

			snapshotMu.Lock()
			currentSnapshot.CPU.Usage = curUsage
			currentSnapshot.Network.Interface = netIf
			currentSnapshot.Network.Download = downRate
			currentSnapshot.Network.Upload = upRate
			currentSnapshot.Network.TotalDownload = formatTraffic(curRx)
			currentSnapshot.Network.TotalUpload = formatTraffic(curTx)
			currentSnapshot.Time = now.Format("2006-01-02 15:04:05")
			snapshotMu.Unlock()

			// --- 每 2 秒采集: 内存、运行时间、系统负载 ---
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

			// --- 每 5 秒采集: 温度、电池侧功率、网络接口地址与协议雷达 ---
			if tickCount%5 == 0 {
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

				var vStr, iStr, pStr string
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
							if val < 0 {
								val = -val
							}
							if val >= 10000 {
								iMa = val / 1000
							} else if val >= 10 {
								iMa = val
							}
							break
						}
					}
				}

				if vMv > 0 && iMa > 0 {
					pMw := vMv * iMa / 1000
					pStr = fmt.Sprintf("%.2f W", float64(pMw)/1000.0)
					vStr = fmt.Sprintf("%.2f V", float64(vMv)/1000.0)
					iStr = fmt.Sprintf("%d mA", iMa)
				}

				var bLevel string
				var isCharging bool
				if data, err := os.ReadFile("/sys/class/power_supply/battery/capacity"); err == nil {
					bLevel = strings.TrimSpace(string(data))
				}
				if data, err := os.ReadFile("/sys/class/power_supply/battery/status"); err == nil {
					st := strings.TrimSpace(string(data))
					isCharging = (st == "Charging" || st == "Full")
				}

				lanIP, lanIface := getPhysicalLANIP()
				curIP := lanIP.String()
				curMAC := "--"
				if ifaceObj, err := net.InterfaceByName(lanIface); err == nil {
					curMAC = ifaceObj.HardwareAddr.String()
				}

				tcpPorts := make(map[string]bool)
				for _, tcpFile := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
					if file, err := os.Open(tcpFile); err == nil {
						scanner := bufio.NewScanner(file)
						for scanner.Scan() {
							fields := strings.Fields(scanner.Text())
							if len(fields) >= 4 && fields[3] == "0A" {
								addrParts := strings.Split(fields[1], ":")
								if len(addrParts) == 2 {
									tcpPorts[strings.ToUpper(addrParts[1])] = true
								}
							}
						}
						file.Close()
					}
				}

				var mdnsOk bool
				var mdnsHost string = "pocketnas.local"
				var mdnsIP string = curIP
				var mdnsIf string = lanIface
				var mdnsMsg string = "Running"
				if mdnsInstance != nil {
					mdnsOk, mdnsHost, mdnsIP, mdnsIf, mdnsMsg = mdnsInstance.GetStatus()
				}

				snapshotMu.Lock()
				currentSnapshot.Temperature.CPU = cpuT
				currentSnapshot.Temperature.Battery = batT
				currentSnapshot.Battery.Power = pStr
				currentSnapshot.Battery.Voltage = vStr
				currentSnapshot.Battery.Current = iStr
				currentSnapshot.Battery.Level = bLevel
				currentSnapshot.Battery.Charging = isCharging
				currentSnapshot.Network.IP = curIP
				currentSnapshot.Network.Mac = curMAC

				currentSnapshot.MDNS = MDNSStatusInfo{
					Enabled:   serverConfig.MDNS.Enabled,
					Hostname:  mdnsHost,
					URL:       fmt.Sprintf("http://%s:%d", mdnsHost, serverConfig.Port),
					IP:        mdnsIP,
					Interface: mdnsIf,
					Status:    mdnsOk,
					Message:   mdnsMsg,
				}

				currentSnapshot.Protocols["webui"] = ProtocolStatus{Name: "PocketNAS 控制台", Port: 8080, Status: tcpPorts["1F90"], URL: fmt.Sprintf("http://%s:8080", curIP)}
				currentSnapshot.Protocols["alist"] = ProtocolStatus{Name: "AList / OpenList", Port: 5244, Status: tcpPorts["147C"], URL: fmt.Sprintf("http://%s:5244", curIP)}
				currentSnapshot.Protocols["webdav"] = ProtocolStatus{Name: "WebDAV 挂载协议", Port: 5244, Status: tcpPorts["147C"], URL: fmt.Sprintf("http://%s:5244/dav", curIP)}
				currentSnapshot.Protocols["ftp"] = ProtocolStatus{Name: "FTP 文件传输", Port: 2121, Status: (tcpPorts["0849"] || tcpPorts["084A"] || tcpPorts["0015"]), URL: fmt.Sprintf("ftp://%s:2121", curIP)}
				currentSnapshot.Protocols["ssh"] = ProtocolStatus{Name: "SSH / SFTP 终端", Port: 22, Status: (tcpPorts["0016"] || tcpPorts["1F56"]), URL: fmt.Sprintf("ssh root@%s -p 22", curIP)}
				currentSnapshot.Protocols["aria2"] = ProtocolStatus{Name: "Aria2 离线下载", Port: 6800, Status: tcpPorts["1A90"], URL: fmt.Sprintf("http://%s:6800/jsonrpc", curIP)}
				currentSnapshot.Protocols["syncthing"] = ProtocolStatus{Name: "Syncthing 多端同步", Port: 8384, Status: tcpPorts["20C0"], URL: fmt.Sprintf("http://%s:8384", curIP)}
				snapshotMu.Unlock()
			}

			// --- 每 30 秒采集: 存储 statfs ---
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

// =========================================================
// ⚡ P0: 原生安全 FTP 服务端
// =========================================================

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
	fmt.Printf("[FTP] 原生安全 FTP 服务已就绪: ftp://0.0.0.0:%d (根目录: %s)\n", port, cleanRoot)

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
			s.send("211-Features:\n UTF8\n SIZE\n PASV\n EPSV\n REST STREAM\n211 End")
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

// =========================================================
// 主服务与 HTTP / 内存状态 API / mDNS 挂载
// =========================================================

func main() {
	baseDir = getExecutableDir()
	serverConfig = loadConfig(baseDir)

	// 1. 写入 PID
	pidPath := filepath.Join(baseDir, "../data/pocket_nas.pid")
	if dataDir, err := filepath.Abs(filepath.Dir(pidPath)); err == nil {
		_ = os.MkdirAll(dataDir, 0755)
		_ = os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0644)
	}

	// 2. 启动进程内零磁盘写入监控采集引擎
	startMetricsCollector(serverConfig.StoragePath)

	// 3. 启动原生零依赖安全 FTP 服务端
	startFTPServer(serverConfig.FtpPort, serverConfig.StoragePath)

	// 4. 启动原生零依赖 mDNS 域名响应引擎 (默认: pocketnas.local)
	if serverConfig.MDNS.Enabled {
		mdnsInstance = newMDNSServer(serverConfig.MDNS.Hostname, serverConfig.Port)
		mdnsInstance.Start()
	}

	// 5. 注册测速专属路由与并发控制器
	registerSpeedtestHandlers()

	webDirCandidates := []string{
		filepath.Join(baseDir, "../web"),
		filepath.Join(baseDir, "web"),
		"/data/adb/modules/pocket_nas/web",
		"./web",
	}

	webDir := "./web"
	for _, d := range webDirCandidates {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			webDir = d
			break
		}
	}

	// 6. 内存状态 API 接口 (/api/status)
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

	// 7. 静态文件托管
	fs := http.FileServer(http.Dir(webDir))
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fs.ServeHTTP(w, r)
	}))

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(serverConfig.Port),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	fmt.Printf("[PocketNAS Pro] Web 控制台已启动: http://0.0.0.0%s\n", server.Addr)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
}
