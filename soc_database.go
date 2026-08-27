package main

import (
	"fmt"
	"strings"
)

// =========================================================
// PocketNAS Pro v3.1.0 - Comprehensive SoC Database
// Decoupled Hardware Specifications & Topology Profiles
// =========================================================

type CPUClusterSpec struct {
	Cores     int    `json:"cores"`
	Model     string `json:"model"`      // e.g. "Cortex-X1", "Cortex-A78", "Oryon", "Cortex-X4"
	ShortName string `json:"short_name"` // e.g. "X1", "A78", "A55"
	MaxMHz    int    `json:"max_mhz"`    // e.g. 2841
}

type SoCSpec struct {
	Vendor     string           `json:"vendor"`      // "Qualcomm", "MediaTek", "Google", "Samsung", "UNISOC", "Rockchip"
	Model      string           `json:"model"`       // e.g. "Snapdragon 888+", "Dimensity 9400"
	ProcessNM  int              `json:"process_nm"`  // e.g. 3, 4, 5, 6, 7
	TotalCores int              `json:"total_cores"` // e.g. 8, 10
	Clusters   []CPUClusterSpec `json:"clusters"`    // Expected cluster breakdown
	GPUModel   string           `json:"gpu_model"`   // e.g. "Adreno 660", "Immortalis-G925"
	Keys       []string         // Matching keys against ro.soc.model, /proc/cpuinfo Hardware, platform
}

func GetShortCoreName(full string) string {
	s := strings.TrimSpace(full)
	if strings.HasPrefix(s, "Cortex-") {
		return strings.TrimPrefix(s, "Cortex-")
	}
	if strings.HasPrefix(s, "Kryo ") {
		parts := strings.Split(s, "(")
		if len(parts) > 1 {
			return strings.TrimSuffix(parts[1], ")")
		}
		return strings.TrimPrefix(s, "Kryo ")
	}
	return s
}

// 全量芯片规格数据库 (支持高通全系、天玑全系、Tensor全系、Exynos等)
var SoCList = []SoCSpec{
	// ==================== Qualcomm 骁龙 8 系列旗舰 ====================
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8 Elite",
		ProcessNM:  3,
		TotalCores: 8,
		GPUModel:   "Adreno 830",
		Keys:       []string{"sm8750", "sun", "sun-p", "sun-q"},
		Clusters: []CPUClusterSpec{
			{Cores: 2, Model: "Oryon Prime", ShortName: "Oryon-P", MaxMHz: 4320},
			{Cores: 6, Model: "Oryon Performance", ShortName: "Oryon-M", MaxMHz: 3530},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8 Elite Gen 5",
		ProcessNM:  3,
		TotalCores: 8,
		GPUModel:   "Adreno 840",
		Keys:       []string{"sm8850", "pakala"},
		Clusters: []CPUClusterSpec{
			{Cores: 2, Model: "Oryon V2 Prime", ShortName: "Oryon-P", MaxMHz: 4500},
			{Cores: 6, Model: "Oryon V2 Performance", ShortName: "Oryon-M", MaxMHz: 3800},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8 Gen 3",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 750",
		Keys:       []string{"sm8650", "pineapple", "pineapple-v2"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3300},
			{Cores: 5, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 3150},
			{Cores: 2, Model: "Cortex-A520", ShortName: "A520", MaxMHz: 2270},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8s Gen 3",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 735",
		Keys:       []string{"sm8635", "cliffs", "volcano"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3000},
			{Cores: 4, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2800},
			{Cores: 3, Model: "Cortex-A520", ShortName: "A520", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8 Gen 2",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 740",
		Keys:       []string{"sm8550", "kalama"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X3", ShortName: "X3", MaxMHz: 3200},
			{Cores: 4, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 2800},
			{Cores: 3, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8+ Gen 1",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 730",
		Keys:       []string{"sm8475", "cape"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X2", ShortName: "X2", MaxMHz: 3200},
			{Cores: 3, Model: "Cortex-A710", ShortName: "A710", MaxMHz: 2750},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 8 Gen 1",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 730",
		Keys:       []string{"sm8450", "taro"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X2", ShortName: "X2", MaxMHz: 3000},
			{Cores: 3, Model: "Cortex-A710", ShortName: "A710", MaxMHz: 2500},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1800},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 888+",
		ProcessNM:  5,
		TotalCores: 8,
		GPUModel:   "Adreno 660",
		Keys:       []string{"sm8350-ac", "sm8350pro", "lahaina-plus", "snapdragon 888+"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X1", ShortName: "X1", MaxMHz: 3000},
			{Cores: 3, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1800},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 888",
		ProcessNM:  5,
		TotalCores: 8,
		GPUModel:   "Adreno 660",
		Keys:       []string{"sm8350", "lahaina", "snapdragon 888"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X1", ShortName: "X1", MaxMHz: 2841},
			{Cores: 3, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1804},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 870",
		ProcessNM:  7,
		TotalCores: 8,
		GPUModel:   "Adreno 650",
		Keys:       []string{"sm8250-ac", "kona-plus", "snapdragon 870"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 3200},
			{Cores: 3, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1804},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 865+",
		ProcessNM:  7,
		TotalCores: 8,
		GPUModel:   "Adreno 650",
		Keys:       []string{"sm8250-ab"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 3100},
			{Cores: 3, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1804},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 865",
		ProcessNM:  7,
		TotalCores: 8,
		GPUModel:   "Adreno 650",
		Keys:       []string{"sm8250", "kona", "snapdragon 865"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 2841},
			{Cores: 3, Model: "Cortex-A77", ShortName: "A77", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1804},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 855",
		ProcessNM:  7,
		TotalCores: 8,
		GPUModel:   "Adreno 640",
		Keys:       []string{"sm8150", "msmnile"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A76", ShortName: "A76", MaxMHz: 2841},
			{Cores: 3, Model: "Cortex-A76", ShortName: "A76", MaxMHz: 2420},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1780},
		},
	},

	// ==================== Qualcomm 骁龙 7 / 6 系列 ====================
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 7+ Gen 3",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 732",
		Keys:       []string{"sm7675"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 2800},
			{Cores: 4, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2600},
			{Cores: 3, Model: "Cortex-A520", ShortName: "A520", MaxMHz: 1900},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 7+ Gen 2",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 725",
		Keys:       []string{"sm7475", "marble"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X2", ShortName: "X2", MaxMHz: 2918},
			{Cores: 3, Model: "Cortex-A710", ShortName: "A710", MaxMHz: 2496},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1804},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 7 Gen 3",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 720",
		Keys:       []string{"sm7550", "crow"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 2630},
			{Cores: 3, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 2400},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1800},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 7s Gen 2",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Adreno 710",
		Keys:       []string{"sm7435-ab", "sm6450"},
		Clusters: []CPUClusterSpec{
			{Cores: 4, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2400},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1958},
		},
	},
	{
		Vendor:     "Qualcomm",
		Model:      "Snapdragon 778G",
		ProcessNM:  6,
		TotalCores: 8,
		GPUModel:   "Adreno 642L",
		Keys:       []string{"sm7325", "yupik"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2400},
			{Cores: 3, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2200},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1900},
		},
	},

	// ==================== MediaTek 天玑 9000 旗舰系列 ====================
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 9400",
		ProcessNM:  3,
		TotalCores: 8,
		GPUModel:   "Immortalis-G925 MC12",
		Keys:       []string{"mt6991", "dimensity 9400", "dimensity9400"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X925", ShortName: "X925", MaxMHz: 3630},
			{Cores: 3, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3300},
			{Cores: 4, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2400},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 9300",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Immortalis-G720 MC12",
		Keys:       []string{"mt6989", "dimensity 9300", "dimensity9300"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3250},
			{Cores: 3, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 2850},
			{Cores: 4, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 9200",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Immortalis-G715 MC11",
		Keys:       []string{"mt6985", "dimensity 9200"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X3", ShortName: "X3", MaxMHz: 3050},
			{Cores: 3, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 2850},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1800},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 9000",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Mali-G710 MC10",
		Keys:       []string{"mt6983", "dimensity 9000"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X2", ShortName: "X2", MaxMHz: 3050},
			{Cores: 3, Model: "Cortex-A710", ShortName: "A710", MaxMHz: 2850},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1800},
		},
	},

	// ==================== MediaTek 天玑 8000 / 7000 / 1000 系列 ====================
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 8300",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Mali-G615 MC6",
		Keys:       []string{"mt6897", "dimensity 8300"},
		Clusters: []CPUClusterSpec{
			{Cores: 4, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 3350},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 2200},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 8200",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Mali-G610 MC6",
		Keys:       []string{"mt6896", "dimensity 8200"},
		Clusters: []CPUClusterSpec{
			{Cores: 4, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 3100},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 8100",
		ProcessNM:  5,
		TotalCores: 8,
		GPUModel:   "Mali-G610 MC6",
		Keys:       []string{"mt6895", "dimensity 8100"},
		Clusters: []CPUClusterSpec{
			{Cores: 4, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2850},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "MediaTek",
		Model:      "Dimensity 1200",
		ProcessNM:  6,
		TotalCores: 8,
		GPUModel:   "Mali-G77 MC9",
		Keys:       []string{"mt6893"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 3000},
			{Cores: 3, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2600},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 2000},
		},
	},

	// ==================== Google Tensor 系列 ====================
	{
		Vendor:     "Google",
		Model:      "Tensor G4",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Mali-G715",
		Keys:       []string{"zuma pro", "tensor g4"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3100},
			{Cores: 3, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2600},
			{Cores: 4, Model: "Cortex-A520", ShortName: "A520", MaxMHz: 1920},
		},
	},
	{
		Vendor:     "Google",
		Model:      "Tensor G3",
		ProcessNM:  4,
		TotalCores: 9,
		GPUModel:   "Mali-G715",
		Keys:       []string{"zuma", "tensor g3"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X3", ShortName: "X3", MaxMHz: 2910},
			{Cores: 4, Model: "Cortex-A715", ShortName: "A715", MaxMHz: 2370},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1700},
		},
	},
	{
		Vendor:     "Google",
		Model:      "Tensor G2",
		ProcessNM:  5,
		TotalCores: 8,
		GPUModel:   "Mali-G710 MP7",
		Keys:       []string{"cloudripper", "tensor g2"},
		Clusters: []CPUClusterSpec{
			{Cores: 2, Model: "Cortex-X1", ShortName: "X1", MaxMHz: 2850},
			{Cores: 2, Model: "Cortex-A78", ShortName: "A78", MaxMHz: 2350},
			{Cores: 4, Model: "Cortex-A55", ShortName: "A55", MaxMHz: 1800},
		},
	},

	// ==================== Samsung Exynos 系列 ====================
	{
		Vendor:     "Samsung",
		Model:      "Exynos 2400",
		ProcessNM:  4,
		TotalCores: 10,
		GPUModel:   "Xclipse 940",
		Keys:       []string{"s5e9945", "exynos 2400"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X4", ShortName: "X4", MaxMHz: 3200},
			{Cores: 5, Model: "Cortex-A720", ShortName: "A720", MaxMHz: 2900},
			{Cores: 4, Model: "Cortex-A520", ShortName: "A520", MaxMHz: 2000},
		},
	},
	{
		Vendor:     "Samsung",
		Model:      "Exynos 2200",
		ProcessNM:  4,
		TotalCores: 8,
		GPUModel:   "Xclipse 920",
		Keys:       []string{"s5e9925", "exynos 2200"},
		Clusters: []CPUClusterSpec{
			{Cores: 1, Model: "Cortex-X2", ShortName: "X2", MaxMHz: 2800},
			{Cores: 3, Model: "Cortex-A710", ShortName: "A710", MaxMHz: 2520},
			{Cores: 4, Model: "Cortex-A510", ShortName: "A510", MaxMHz: 1820},
		},
	},
}

// ARM MIDR (CPU Implementer + Part Number) 核心解码表
var ARMPartMap = map[string]string{
	// ARM Cortex-A5x 系列 (小核)
	"0x41:0xd03": "Cortex-A53",
	"0x41:0xd04": "Cortex-A35",
	"0x41:0xd05": "Cortex-A55",
	"0x41:0xd46": "Cortex-A510",
	"0x41:0xd80": "Cortex-A520",

	// ARM Cortex-A7x 系列 (大核/中核)
	"0x41:0xd07": "Cortex-A57",
	"0x41:0xd08": "Cortex-A72",
	"0x41:0xd09": "Cortex-A73",
	"0x41:0xd0a": "Cortex-A75",
	"0x41:0xd0b": "Cortex-A76",
	"0x41:0xd0d": "Cortex-A77",
	"0x41:0xd41": "Cortex-A78",
	"0x41:0xd47": "Cortex-A710",
	"0x41:0xd48": "Cortex-A715",
	"0x41:0xd4d": "Cortex-A720",
	"0x41:0xd81": "Cortex-A725",
	"0x41:0xd83": "Cortex-A730",

	// ARM Cortex-X 系列 (超大核)
	"0x41:0xd44": "Cortex-X1",
	"0x41:0xd4c": "Cortex-X2",
	"0x41:0xd4e": "Cortex-X3",
	"0x41:0xd4f": "Cortex-X4",
	"0x41:0xd85": "Cortex-X925",

	// Qualcomm Kryo / Oryon 自研/半自研架构
	"0x51:0x800": "Kryo 280",
	"0x51:0x801": "Kryo 385",
	"0x51:0x802": "Kryo 385 Gold",
	"0x51:0x803": "Kryo 385 Silver",
	"0x51:0x804": "Kryo 485 Gold",
	"0x51:0x805": "Kryo 485 Silver",
	"0x51:0x001": "Oryon",
	"0x51:0x002": "Oryon Prime",
	"0x51:0x003": "Oryon Performance",
}

// 根据 MIDR Implementer 和 Part 获取核心架构名
func DecodeARMCpuPart(implementer string, part string) string {
	imp := strings.ToLower(strings.TrimSpace(implementer))
	p := strings.ToLower(strings.TrimSpace(part))
	if !strings.HasPrefix(imp, "0x") && imp != "" {
		imp = "0x" + imp
	}
	if !strings.HasPrefix(p, "0x") && p != "" {
		p = "0x" + p
	}

	key := fmt.Sprintf("%s:%s", imp, p)
	if model, ok := ARMPartMap[key]; ok {
		return model
	}
	return ""
}

// 依据系统特征检索匹配 SoC 数据库
func MatchSoCDatabase(rawKeywords []string) (*SoCSpec, bool) {
	for _, raw := range rawKeywords {
		k := strings.ToLower(strings.TrimSpace(raw))
		if k == "" || k == "unknown" || k == "default" {
			continue
		}

		for _, soc := range SoCList {
			if strings.EqualFold(soc.Model, k) || strings.Contains(strings.ToLower(soc.Model), k) {
				return &soc, true
			}
			for _, key := range soc.Keys {
				if strings.Contains(k, key) || strings.Contains(key, k) {
					return &soc, true
				}
			}
		}
	}
	return nil, false
}
