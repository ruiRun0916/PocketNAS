package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
)

// =========================================================
// PocketNAS Pro v3.2.0 - Battery Health & Power Subsystem
// BatteryProvider: Real sysfs probe, Wh normalization & EMA
// =========================================================

type BatteryHealthInfo struct {
	Level              string  `json:"level"`                 // e.g. "53"
	HealthPercent      string  `json:"health_percent"`       // e.g. "92.6%" or "暂不可获取"
	DesignCapacityMAh  int     `json:"design_capacity_mah"`  // e.g. 5000
	HealthCapacityMAh  int     `json:"health_capacity_mah"`  // e.g. 4630
	DesignEnergyWh     float64 `json:"design_energy_wh"`     // e.g. 19.3
	HealthEnergyWh     float64 `json:"health_energy_wh"`     // e.g. 17.6
	CycleCount         string  `json:"cycle_count"`          // e.g. "387" or "未知"
	Charging           bool    `json:"charging"`             // true/false
	ChargingStatusText string  `json:"charging_status_text"` // "电池供电", "充电中", "已充满"
	ChargingPower      string  `json:"charging_power"`       // e.g. "4.8 W"
	Power              string  `json:"power"`                // e.g. "0.36 W"
	Voltage            string  `json:"voltage"`              // e.g. "4.06 V"
	Current            string  `json:"current"`              // e.g. "529 mA"
	Temperature        string  `json:"temperature"`          // e.g. "31°C"
	EstimatedEndurance string  `json:"estimated_endurance"`  // e.g. "≈ 4小时 12分"
	NominalVoltage     float64 `json:"nominal_voltage"`      // e.g. 3.87
	DataSource         string  `json:"data_source"`          // "sysfs_bms", "driver", "estimated"
}

type BatteryProvider struct {
	mu                  sync.Mutex
	designCapacityMAh   int
	healthCapacityMAh   int
	nominalVoltage      float64
	cycleCount          string
	designEnergyWh      float64
	healthEnergyWh      float64
	healthPercent       string
	powerSamples        []float64
	maxSamples          int
	cachedBmsPaths      map[string]string
	lastSemiStaticProbe int64 // unix timestamp
}

var GlobalBatteryProvider = &BatteryProvider{
	nominalVoltage: 3.87, // 标称锂电池电压
	cycleCount:     "未知",
	healthPercent:  "暂不可获取",
	maxSamples:     20, // 约 60 秒滑动窗口
	powerSamples:   make([]float64, 0, 20),
	cachedBmsPaths: make(map[string]string),
}

// 启动时初始化探测电池节点 (0 额外开销)
func (bp *BatteryProvider) Init() {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	// 1. 查找有效电压与电流节点
	for _, p := range []string{
		"/sys/class/power_supply/battery/voltage_nominal",
		"/sys/class/power_supply/bms/voltage_nominal",
		"/sys/class/power_supply/battery/voltage_min_design",
	} {
		if data, err := os.ReadFile(p); err == nil {
			if v, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && v > 0 {
				if v >= 1000000 {
					bp.nominalVoltage = float64(v) / 1000000.0
				} else if v >= 1000 {
					bp.nominalVoltage = float64(v) / 1000.0
				}
				break
			}
		}
	}

	// 2. 探测设计容量与健康容量
	bp.probeStaticCapacitiesLocked()
}

// 内部探测静态/半静态电池数据
func (bp *BatteryProvider) probeStaticCapacitiesLocked() {
	// A. 设计容量 (Design Capacity)
	designMah := 0
	for _, p := range []string{
		"/sys/class/power_supply/battery/charge_full_design",
		"/sys/class/power_supply/bms/charge_full_design",
		"/sys/class/power_supply/BATT/charge_full_design",
		"/sys/class/power_supply/battery/energy_full_design",
	} {
		if data, err := os.ReadFile(p); err == nil {
			if val, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && val > 0 {
				if strings.Contains(p, "energy_") {
					// $\mu\text{Wh} \to \text{mAh}$
					mah := (float64(val) / 1000.0) / bp.nominalVoltage
					designMah = int(mah)
				} else if val >= 1000000 {
					designMah = val / 1000
				} else if val >= 1000 {
					designMah = val
				}
				if designMah > 0 {
					break
				}
			}
		}
	}
	if designMah > 0 {
		bp.designCapacityMAh = designMah
		bp.designEnergyWh = (float64(designMah) * bp.nominalVoltage) / 1000.0
	}

	// B. 实际健康容量 (Full Charge Capacity / Health Capacity)
	healthMah := 0
	for _, p := range []string{
		"/sys/class/power_supply/battery/charge_full",
		"/sys/class/power_supply/bms/charge_full",
		"/sys/class/power_supply/battery/fg_fullcapnom",
		"/sys/class/power_supply/bms/fg_fullcapnom",
		"/sys/class/power_supply/battery/energy_full",
	} {
		if data, err := os.ReadFile(p); err == nil {
			if val, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && val > 0 {
				if strings.Contains(p, "energy_") {
					mah := (float64(val) / 1000.0) / bp.nominalVoltage
					healthMah = int(mah)
				} else if val >= 1000000 {
					healthMah = val / 1000
				} else if val >= 1000 {
					healthMah = val
				}
				if healthMah > 0 {
					break
				}
			}
		}
	}

	if healthMah > 0 {
		bp.healthCapacityMAh = healthMah
		bp.healthEnergyWh = (float64(healthMah) * bp.nominalVoltage) / 1000.0
	} else if bp.designCapacityMAh > 0 {
		// 若无法直接读取 charge_full，则健康容量暂未获取
		bp.healthCapacityMAh = 0
		bp.healthEnergyWh = 0
	}

	// C. 计算健康百分比
	if bp.healthCapacityMAh > 0 && bp.designCapacityMAh > 0 {
		ratio := (float64(bp.healthCapacityMAh) / float64(bp.designCapacityMAh)) * 100.0
		if ratio > 105.0 {
			ratio = 100.0
		}
		bp.healthPercent = fmt.Sprintf("%.1f%%", ratio)
	} else {
		bp.healthPercent = "暂不可获取"
	}

	// D. 电池循环次数 (Cycle Count)
	foundCycle := false
	for _, p := range []string{
		"/sys/class/power_supply/battery/cycle_count",
		"/sys/class/power_supply/bms/cycle_count",
		"/sys/class/power_supply/battery/battery_cycle",
		"/sys/class/power_supply/bms/battery_cycle",
	} {
		if data, err := os.ReadFile(p); err == nil {
			if c, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil && c >= 0 && c < 5000 {
				bp.cycleCount = fmt.Sprintf("%d 次", c)
				foundCycle = true
				break
			}
		}
	}
	if !foundCycle {
		bp.cycleCount = "未知"
	}
}

// 采集并输出结构化电池健康数据 (每 3 秒复用已有 sysfs 读取，0 额外开销)
func (bp *BatteryProvider) CollectTelemetry(vMv int, iMa int, levelStr string, statusStr string, batTempStr string) BatteryHealthInfo {
	bp.mu.Lock()
	defer bp.mu.Unlock()

	levelInt, _ := strconv.Atoi(levelStr)
	isCharging := (statusStr == "Charging" || statusStr == "Full")

	// 1. 计算当前真实功率 (W)
	var rawPowerW float64
	pStr := "-- W"
	vStr := "-- V"
	iStr := "-- mA"

	if vMv > 0 && iMa != 0 {
		absI := iMa
		if absI < 0 {
			absI = -absI
		}
		pMw := vMv * absI / 1000
		rawPowerW = float64(pMw) / 1000.0
		pStr = fmt.Sprintf("%.2f W", rawPowerW)
		vStr = fmt.Sprintf("%.2f V", float64(vMv)/1000.0)
		if iMa < 0 {
			iStr = fmt.Sprintf("%d mA", iMa)
		} else {
			iStr = fmt.Sprintf("+%d mA", iMa)
		}
	} else if vMv > 0 {
		vStr = fmt.Sprintf("%.2f V", float64(vMv)/1000.0)
	}

	// 2. 状态文字
	chargingStatus := "电池供电"
	if statusStr == "Charging" {
		chargingStatus = "充电中"
	} else if statusStr == "Full" {
		chargingStatus = "已充满"
	} else if isCharging {
		chargingStatus = "供电中"
	}

	chgPowerStr := ""
	if isCharging && rawPowerW > 0 {
		chgPowerStr = fmt.Sprintf("%.1f W", rawPowerW)
	}

	// 3. 动态健康续航估算
	estimatedEndurance := ""
	if isCharging {
		// 充电状态下严格不显示“剩余续航估算”
		bp.powerSamples = bp.powerSamples[:0]
		estimatedEndurance = ""
	} else {
		// 放电状态下推入滑动窗口
		if rawPowerW > 0.05 && rawPowerW < 25.0 {
			if len(bp.powerSamples) >= bp.maxSamples {
				bp.powerSamples = bp.powerSamples[1:]
			}
			bp.powerSamples = append(bp.powerSamples, rawPowerW)
		}

		if len(bp.powerSamples) < 5 {
			estimatedEndurance = "正在计算..."
		} else {
			var sum float64
			for _, p := range bp.powerSamples {
				sum += p
			}
			avgPower := sum / float64(len(bp.powerSamples))
			if avgPower <= 0.05 {
				avgPower = 0.35 // 兜底合理待机功耗
			}

			// 优先使用健康容量能量计算剩余能量
			baseEnergyWh := bp.healthEnergyWh
			if baseEnergyWh <= 0 {
				baseEnergyWh = bp.designEnergyWh
			}
			if baseEnergyWh <= 0 && bp.designCapacityMAh > 0 {
				baseEnergyWh = (float64(bp.designCapacityMAh) * bp.nominalVoltage) / 1000.0
			}

			if baseEnergyWh > 0 && levelInt > 0 {
				remainEnergy := baseEnergyWh * (float64(levelInt) / 100.0)
				hours := remainEnergy / avgPower
				if hours >= 24 {
					days := int(hours) / 24
					hrs := int(hours) % 24
					estimatedEndurance = fmt.Sprintf("≈ %d天 %d小时", days, hrs)
				} else if hours > 0 {
					hrs := int(hours)
					mins := int((hours - float64(hrs)) * 60)
					if mins > 0 {
						estimatedEndurance = fmt.Sprintf("≈ %d小时 %d分", hrs, mins)
					} else {
						estimatedEndurance = fmt.Sprintf("≈ %d小时", hrs)
					}
				} else {
					estimatedEndurance = "--"
				}
			} else {
				estimatedEndurance = "电池供电"
			}
		}
	}

	return BatteryHealthInfo{
		Level:              levelStr,
		HealthPercent:      bp.healthPercent,
		DesignCapacityMAh:  bp.designCapacityMAh,
		HealthCapacityMAh:  bp.healthCapacityMAh,
		DesignEnergyWh:     bp.designEnergyWh,
		HealthEnergyWh:     bp.healthEnergyWh,
		CycleCount:         bp.cycleCount,
		Charging:           isCharging,
		ChargingStatusText: chargingStatus,
		ChargingPower:      chgPowerStr,
		Power:              pStr,
		Voltage:            vStr,
		Current:            iStr,
		Temperature:        batTempStr,
		EstimatedEndurance: estimatedEndurance,
		NominalVoltage:     bp.nominalVoltage,
		DataSource:         "sysfs_battery",
	}
}
