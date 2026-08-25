package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// =========================================================
// PocketNAS Pro v3.2.0 - Dynamic Hardware Detection Engine
// Zero-Fork, Memory-Cached, High-Accuracy Multi-Vendor Topology
// =========================================================

type DetectedCluster struct {
	ClusterID int    `json:"cluster_id"`
	Cores     int    `json:"cores"`
	CoreModel string `json:"core_model"` // e.g. "Cortex-A55"
	ShortName string `json:"short_name"` // e.g. "A55"
	Usage     int    `json:"usage"`      // Core group average utilization % (e.g. 24)
	CPUs      []int  `json:"cpus"`       // CPU indices [0, 1, 2, 3]
}

type StaticHardwareInfo struct {
	Brand            string            `json:"brand"`               // e.g. "Xiaomi"
	Model            string            `json:"model"`               // e.g. "Mi 11 Ultra"
	MarketName       string            `json:"market_name"`        // e.g. "Xiaomi 11 Ultra"
	AndroidVersion   string            `json:"android_version"`    // e.g. "Android 14"
	KernelVersion    string            `json:"kernel_version"`     // e.g. "Linux 5.4.210"
	SoCVendor        string            `json:"soc_vendor"`         // "Qualcomm", "MediaTek", "Google", "Samsung"
	SoCModel         string            `json:"soc_model"`          // e.g. "Snapdragon 888+", "Dimensity 9400"
	ProcessNM        int               `json:"process_nm"`         // e.g. 5
	TotalCPUCores    int               `json:"total_cpu_cores"`    // e.g. 8
	GPUModel         string            `json:"gpu_model"`          // e.g. "Adreno 660"
	BatteryDesignMAh int               `json:"battery_design_mah"` // e.g. 5000
	DetectionSource  string            `json:"detection_source"`   // "soc_database", "cpu_midr", "sysfs"
	Clusters         []DetectedCluster `json:"clusters"`           // Detected dynamic cluster breakdown
}

var GlobalHardwareInfo StaticHardwareInfo

// 纯 Go 读取 build.prop 属性表 (0 子进程，0 耗电)
func readPropMap() map[string]string {
	props := make(map[string]string)
	propPaths := []string{
		"/system/build.prop",
		"/vendor/build.prop",
		"/product/build.prop",
		"/system_ext/build.prop",
		"/default.prop",
		"/prop.default",
	}

	for _, p := range propPaths {
		if file, err := os.Open(p); err == nil {
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				parts := strings.SplitN(line, "=", 2)
				if len(parts) == 2 {
					k := strings.TrimSpace(parts[0])
					v := strings.TrimSpace(parts[1])
					if _, exists := props[k]; !exists && v != "" {
						props[k] = v
					}
				}
			}
			file.Close()
		}
	}
	return props
}

// 动态检测全量硬件信息 (启动时仅执行一次，0 常驻 CPU 占用)
func DetectHardwareInfo() StaticHardwareInfo {
	props := readPropMap()
	GlobalBatteryProvider.Init()

	info := StaticHardwareInfo{
		Brand:            "Android",
		Model:            "Device",
		MarketName:       "Android Device",
		AndroidVersion:   "Android 14",
		KernelVersion:    "Linux",
		SoCVendor:        "Generic",
		SoCModel:         "ARM64 Processor",
		ProcessNM:        0,
		TotalCPUCores:    8,
		GPUModel:         "Detected (GPU Engine)",
		BatteryDesignMAh: GlobalBatteryProvider.designCapacityMAh,
		DetectionSource:  "sysfs_generic",
		Clusters:         make([]DetectedCluster, 0),
	}

	// 1. 读取手机品牌与商业市场名
	if v, ok := props["ro.product.brand"]; ok {
		info.Brand = strings.Title(v)
	} else if v, ok := props["ro.product.manufacturer"]; ok {
		info.Brand = strings.Title(v)
	}

	if v, ok := props["ro.product.model"]; ok {
		info.Model = v
	}
	if v, ok := props["ro.product.marketname"]; ok {
		info.MarketName = v
	} else if v, ok := props["ro.vendor.marketname"]; ok {
		info.MarketName = v
	} else if info.Brand != "Android" && info.Model != "Device" {
		info.MarketName = fmt.Sprintf("%s %s", info.Brand, info.Model)
	}

	if v, ok := props["ro.build.version.release"]; ok {
		info.AndroidVersion = fmt.Sprintf("Android %s", v)
	}
	if data, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		info.KernelVersion = "Linux " + strings.TrimSpace(string(data))
	}

	// 2. 动态读取 /proc/cpuinfo 获取 ARM MIDR 核心信息
	cpuPartMap := make(map[int]string) // core index -> "Cortex-X1"
	hardwareKeys := make([]string, 0)

	if v, ok := props["ro.soc.model"]; ok {
		hardwareKeys = append(hardwareKeys, v)
	}
	if v, ok := props["ro.board.platform"]; ok {
		hardwareKeys = append(hardwareKeys, v)
	}
	if v, ok := props["ro.hardware"]; ok {
		hardwareKeys = append(hardwareKeys, v)
	}
	if v, ok := props["ro.boot.hardware.sku"]; ok {
		hardwareKeys = append(hardwareKeys, v)
	}

	if file, err := os.Open("/proc/cpuinfo"); err == nil {
		scanner := bufio.NewScanner(file)
		curCPU := 0
		var curImp, curPart string

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if strings.HasPrefix(line, "processor") {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					if n, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
						curCPU = n
					}
				}
			} else if strings.HasPrefix(line, "CPU implementer") {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					curImp = strings.TrimSpace(parts[1])
				}
			} else if strings.HasPrefix(line, "CPU part") {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					curPart = strings.TrimSpace(parts[1])
					if coreName := DecodeARMCpuPart(curImp, curPart); coreName != "" {
						cpuPartMap[curCPU] = coreName
					}
				}
			} else if strings.HasPrefix(line, "Hardware") {
				parts := strings.Split(line, ":")
				if len(parts) >= 2 {
					hw := strings.TrimSpace(parts[1])
					hardwareKeys = append(hardwareKeys, hw)
				}
			}
		}
		file.Close()
	}

	// 3. 动态检测 CPU 核心数与拓扑簇 (Topology Clusters)
	cpuDirs, _ := filepath.Glob("/sys/devices/system/cpu/cpu[0-9]*")
	if len(cpuDirs) > 0 {
		info.TotalCPUCores = len(cpuDirs)
	}

	type RawCoreInfo struct {
		Index     int
		MaxFreq   int
		CoreModel string
	}
	coreList := make([]RawCoreInfo, 0, info.TotalCPUCores)

	for i := 0; i < info.TotalCPUCores; i++ {
		maxF := 0
		base := fmt.Sprintf("/sys/devices/system/cpu/cpu%d/cpufreq", i)

		if data, err := os.ReadFile(filepath.Join(base, "cpuinfo_max_freq")); err == nil {
			maxF, _ = strconv.Atoi(strings.TrimSpace(string(data)))
			maxF = maxF / 1000 // 转为 MHz
		}

		coreModel := cpuPartMap[i]
		coreList = append(coreList, RawCoreInfo{
			Index:     i,
			MaxFreq:   maxF,
			CoreModel: coreModel,
		})
	}

	// 智能聚合 Cluster (相同 MaxFreq 与相同架构归为一簇)
	clusterMap := make(map[string]*DetectedCluster)
	clusterOrder := make([]string, 0)

	for _, c := range coreList {
		key := fmt.Sprintf("%d_%s", c.MaxFreq, c.CoreModel)
		if existing, ok := clusterMap[key]; ok {
			existing.Cores++
			existing.CPUs = append(existing.CPUs, c.Index)
		} else {
			modelName := c.CoreModel
			if modelName == "" {
				if c.MaxFreq > 2800 {
					modelName = "Prime Core"
				} else if c.MaxFreq > 2000 {
					modelName = "Performance Core"
				} else {
					modelName = "Efficiency Core"
				}
			}

			newClust := &DetectedCluster{
				ClusterID: len(clusterOrder) + 1,
				Cores:     1,
				CoreModel: modelName,
				ShortName: GetShortCoreName(modelName),
				Usage:     0,
				CPUs:      []int{c.Index},
			}
			clusterMap[key] = newClust
			clusterOrder = append(clusterOrder, key)
		}
	}

	// 排列簇
	for _, k := range clusterOrder {
		info.Clusters = append(info.Clusters, *clusterMap[k])
	}

	// 4. 匹配 SoC 数据库
	if soc, found := MatchSoCDatabase(hardwareKeys); found {
		info.SoCVendor = soc.Vendor
		info.SoCModel = soc.Model
		info.ProcessNM = soc.ProcessNM
		info.GPUModel = soc.GPUModel
		info.DetectionSource = "soc_database"

		// 若硬件读取到的核心架构名称为空，使用数据库的精准型号回填
		if len(soc.Clusters) == len(info.Clusters) {
			for idx := range info.Clusters {
				if info.Clusters[idx].CoreModel == "Prime Core" || info.Clusters[idx].CoreModel == "Performance Core" || info.Clusters[idx].CoreModel == "Efficiency Core" {
					info.Clusters[idx].CoreModel = soc.Clusters[idx].Model
					info.Clusters[idx].ShortName = soc.Clusters[idx].ShortName
				}
			}
		}
	} else {
		// 数据库中未收录时：严格遵循「不瞎猜」原则，如实输出检测到的 CPU 规格
		if len(hardwareKeys) > 0 {
			info.SoCModel = hardwareKeys[0]
		}
		if strings.Contains(strings.ToLower(info.SoCModel), "sm") || strings.Contains(strings.ToLower(info.SoCModel), "qcom") {
			info.SoCVendor = "Qualcomm"
		} else if strings.Contains(strings.ToLower(info.SoCModel), "mt") || strings.Contains(strings.ToLower(info.SoCModel), "dimensity") {
			info.SoCVendor = "MediaTek"
		}
		info.DetectionSource = "dynamic_topology"
	}

	// 5. 动态读取 GPU 型号
	if data, err := os.ReadFile("/sys/class/kgsl/kgsl-3d0/gpu_model"); err == nil {
		g := strings.TrimSpace(string(data))
		if g != "" {
			info.GPUModel = g
		}
	}

	if GlobalBatteryProvider.designCapacityMAh > 0 {
		info.BatteryDesignMAh = GlobalBatteryProvider.designCapacityMAh
	}

	return info
}

// 依据 /proc/stat 单次扫描得到的核心利用率，计算各核心簇的平均利用率 (0 额外开销)
func CalculateClusterUsages(clusters []DetectedCluster, perCoreUsage map[int]int) []DetectedCluster {
	updated := make([]DetectedCluster, len(clusters))
	copy(updated, clusters)

	for i := range updated {
		if len(updated[i].CPUs) == 0 {
			continue
		}
		sum := 0
		validCount := 0
		for _, cpuIdx := range updated[i].CPUs {
			if u, ok := perCoreUsage[cpuIdx]; ok {
				sum += u
				validCount++
			}
		}
		if validCount > 0 {
			updated[i].Usage = sum / validCount
		}
	}
	return updated
}
