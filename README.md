# 口袋 NAS · PocketNAS Pro v3.2.2

<p align="center">
  <img src="https://img.shields.io/badge/Release-v3.2.2-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20(Pure%20Go%20Static)-green?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Root-KernelSU%20%7C%20Magisk%20%7C%20APatch-blueviolet?style=flat-square" alt="Root" />
  <img src="https://img.shields.io/badge/Android-11%20~%2015%20(Kernel%205.4%2B)-orange?style=flat-square" alt="Android" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

PocketNAS Pro 是一个专为 Android Root 环境打造的**轻量级低功耗硬件状态监控面板与本地 NAS 辅助守护程序**。

模块本身主要聚焦于**以较低待机功耗（熄屏待机约 0.3W 级）实时呈现 CPU 核心负载、电池真实健康与能量、存储空间、网络吞吐等设备状态**，并在后台常驻轻量 FTP 服务与 Web 控制台。多端文件挂载与协议互联依托于 AList / WebDAV 等成熟生态，用户亦可配合第三方工具协同扩展。

---

## 🎯 模块解决的实际问题与应用场景

将闲置或备用手机改造成家庭私人轻量云盘、本地辅助存储或 Web 服务器时，常常面临以下实际维护问题：

1. **黑屏待机状态盲盒**：手机通常插着电源、熄屏放置于弱电箱或桌面角落。当想确认设备当前的芯片温度是否过高、运行内存是否充裕、闪存剩余空间多少时，必须频繁走近并手动点亮屏幕解锁查看。
2. **随时随地的网页轻运维**：在局域网路由器中为手机分配或绑定固定 IP 后，用户在同局域网内的电脑、平板或主力手机上只需保存一个书签，即可在浏览器中快速打开控制台，一眼了解设备温度、负载、网络速率与存储情况，实现无需接触手机实体的远程状态查看。
3. **极低功耗不发热**：摒弃了高频启动外部进程的轮询机制，采用纯 Go 进程内内存采集，有效避免后台频繁唤醒导致设备发热与额外电量损耗。

---

## 🌐 局域网快捷访问端点速查

在手机与访问设备处于同一局域网（或连接相同 Wi-Fi）时，可通过以下端点直接接入：

| 服务类型 | 默认端口 | 访问链接示例 | 认证说明 | 主要用途 |
| :--- | :--- | :--- | :--- | :--- |
| **Web 控制台** | `8080` | `http://[手机IP]:8080` | 免密直接访问 | 硬件全景监控、实时波形、测速与多端连接快捷引导 |
| **原生安全 FTP** | `2121` | `ftp://[手机IP]:2121` | 匿名 / 免密直连 | 内部存储 `/data/media/0` 全速读写，支持 MT 管理器 / FileZilla |
| **WebDAV 挂载** | `5244` | `http://[手机IP]:5244/dav` | 依赖 AList 配置 | Mac 访达 (`Cmd+K`) / Windows 映射盘 / 电视盒子 4K 原画直连 |
| **AList 管理后台** | `5244` | `http://[手机IP]:5244` | 网页管理账户 | 聚合网盘与本地存储管理、在线音视频多格式预览 |

> 💡 **提示**：在手机端 KernelSU / Magisk / APatch 管理器中点击模块卡片下方的**「执行 / Action」**按钮，系统将自动把当前 WebDAV 链接复制到系统剪贴板，并自动调起浏览器进入 Web 控制台。

---

## 🏗️ 系统架构与技术协同说明

PocketNAS Pro 采用分层解耦的纯 Go 单进程架构，各组件协同流程如下：

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           外部访问端 (Clients)                          │
│   PC 浏览器 (8080)   │   Mac 访达 (5244/dav)   │  FTP 客户端 (2121)     │
└────────────┬─────────────────────────┬──────────────────────┬───────────┘
             │ HTTP / REST             │ WebDAV 协议          │ RFC 959 FTP
┌────────────▼─────────────────────────▼──────────────────────▼───────────┐
│                 PocketNAS Pro Go 原生守护进程 (nas_server)               │
│                                                                         │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌────────────────┐  │
│  │ HTTP Web Server (8080)│  │ Native FTP Server   │  │ Speedtest Engine│ │
│  │ - 静态资源托管 (Web UI) │  │ - 端口: 2121        │  │ - 双向流式测速 │ │
│  │ - /api/status 内存API│  │ - 软链接防逃逸保护  │  │ - 互斥锁并发保护│ │
│  └───────────┬──────────┘  └──────────┬──────────┘  └────────────────┘  │
│              │                        │                                 │
│  ┌───────────▼────────────────────────▼──────────────────────────────┐  │
│  │               分级能效数据采集调度器 (Metrics Collector)           │  │
│  │  - 静态硬件 (启动仅读1次并缓存): SoC 型号、CPU 拓扑、电池设计容量 │  │
│  │  - 动态状态 (1~2秒采样): CPU 总负载与核心组平均负载、网络吞吐吞量 │  │
│  │  - 能量温控 (3秒采样): 电池电压、电流、实时功率、SoC/电池温度     │  │
│  │  - 存储信息 (30秒采样): statfs 内部存储容量与剩余空间             │  │
│  └────────────────────────────────────┬──────────────────────────────┘  │
│                                       │                                 │
│  ┌────────────────────────────────────▼──────────────────────────────┐  │
│  │    核心算法与数据解析层 (Hardware / SoC / BatteryProvider)          │  │
│  │  - ARM MIDR 核心解码器: 匹配 Cortex-X/A 系列与 Kryo/Oryon 核心    │  │
│  │  - CPU Topology 动态分簇: 按最大频率与架构聚合核心组平均利用率    │  │
│  │  - 电池健康与能量换算: 读取真实 charge_full 并换算标称 Wh 能量    │  │
│  │  - 60秒滑动平均功耗估算: 放电计算平滑剩余续航，充电自动隐藏续航   │  │
│  └────────────────────────────────────┬──────────────────────────────┘  │
└───────────────────────────────────────┼─────────────────────────────────┘
                                        │ 直接只读访问 (0 子进程)
┌───────────────────────────────────────▼─────────────────────────────────┐
│                    Linux / Android 内核与驱动接口                        │
│   /proc/stat  │  /proc/meminfo  │  /proc/net/dev  │  /sys/class/...     │
│   /sys/class/thermal/  │  /sys/class/power_supply/ (battery / bms)      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 技术协同机制
1. **纯 Go 无 CGO 静态交叉编译**：二进制文件直接在 Linux 内核上以系统调用方式运行，不依赖外部动态链接库，内存占用保持在 20MB 以内。
2. **零 Fork 进程内采集**：所有监控数据均由 Go 标准库文件 I/O 直接读取 `/proc` 与 `/sys` 虚拟文件系统完成，单次扫描同时计算总负载与核心组平均利用率，不产生任何 Shell 子进程。
3. **分级调度策略**：对于芯片型号、核心架构等固定信息在启动时读取一次并常驻内存，动态网络与负载维持合理采样间隔，从而兼顾了状态呈现的时效性与设备的低功耗运行。

---

## 💻 模块主要源码结构与代码示例

模块服务端源码完全模块化组织在 `server/` 目录下：

```text
server/
├── main.go               # 主程序入口、配置解析、分级数据采集循环、Web API 与原生 FTP 服务
├── hardware.go           # 系统属性读取、ARM MIDR 解析、CPU 拓扑分簇与集群平均利用率计算
├── battery_provider.go   # 电池底层驱动/BMS 节点探测、Wh 能量换算、健康度与滑动平均估算
└── soc_database.go       # ARM 核心解码表与主流芯片规格数据库
```

### 关键代码框架说明

#### 1. 进程内零 Fork 分级采集调度 (`server/main.go`)
```go
// 启动后台低开销采集循环 (0 外部子进程，单次遍历共享数据)
func startMetricsCollector(storagePath string) {
    go func() {
        tickCount := 0
        for {
            // 1. 每秒单次遍历 /proc/stat：同时计算总 CPU 负载与各核心利用率
            readProcStatAndComputeClusterUsages()

            // 2. 每秒读取 /proc/net/dev 计算实时网络上下行速率
            readNetDevThroughput()

            // 3. 每 2 秒读取 /proc/meminfo 与 /proc/loadavg
            if tickCount%2 == 0 {
                readMemoryAndLoadAvg()
            }

            // 4. 每 3 秒通过 BatteryProvider 更新电池能量、温度与滑动平均续航
            if tickCount%3 == 0 {
                updateBatteryAndThermalTelemetry()
            }

            // 5. 每 30 秒执行 statfs 获取内部存储容量
            if tickCount%30 == 0 {
                updateStorageStatfs(storagePath)
            }

            tickCount++
            time.Sleep(1 * time.Second)
        }
    }()
}
```

#### 2. 电池健康度与 Wh 标称能量管理 (`server/battery_provider.go`)
```go
// 动态读取真实内核节点并换算工程级 Wh 标称能量
func (bp *BatteryProvider) probeStaticCapacitiesLocked() {
    // 探测设计容量 (Design Capacity) 与实际健康容量 (Charge Full)
    // 标称能量 (Wh) = (容量(mAh) * 标称电压(V)) / 1000
    if bp.designCapacityMAh > 0 {
        bp.designEnergyWh = (float64(bp.designCapacityMAh) * bp.nominalVoltage) / 1000.0
    }
    if bp.healthCapacityMAh > 0 {
        bp.healthEnergyWh = (float64(bp.healthCapacityMAh) * bp.nominalVoltage) / 1000.0
        // 计算健康度百分比
        ratio := (float64(bp.healthCapacityMAh) / float64(bp.designCapacityMAh)) * 100.0
        bp.healthPercent = fmt.Sprintf("%.1f%%", ratio)
    } else {
        bp.healthPercent = "暂不可获取"
    }
}
```

---

## 🌟 v3.2.2 核心特性与更新记录

### 1. 🖥️ PC 大屏空间利用率重构与全响应式排版
- **消灭底部无效留白**：调整卡片比例与信息层级，使 PC 浏览器（1080p 屏幕）打开后内容自然铺满首屏视口。
- **4 级响应式网格**：
  - **超宽 PC 端（`≥ 1600px`）**：四列展开，图表适度放大；
  - **普通 PC 端（`1200px ~ 1599px`）**：紧凑 4 列核心状态 + 2 列波形 + 2 列服务面板；
  - **平板设备（`768px ~ 1199px`）**：2×2 均衡网格；
  - **手机移动端（`< 768px`）**：单列垂直流排版，数字醒目优先，无横向溢出。

### 2. 🔋 真实电池健康度与 Wh 标称能量管理
- **直读内核驱动/BMS 节点**：动态读取 `charge_full`、`charge_full_design` 与 `cycle_count`，获取真实电池健康度与充电循环次数，无法获取时如实提示“未知”，不编造数据。
- **Wh 能量为主单位**：容量展示以工程级 **Wh** 为主（如 `17.6 Wh`），并附带小字号 `≈ 4630 mAh` 说明。
- **平滑续航估算**：
  - **放电状态**：结合实际健康容量能量与 60 秒滑动平均功耗（EMA 滤波）估算剩余可用时长；
  - **充电状态**：自动隐藏剩余续航时间，自适应切换为展示 `⚡ 充电中 (充电功率: X.X W)` 或 `⚡ 已充满`。

### 3. ⚡ 全平台 SoC 动态识别与核心组平均利用率
- **动态核心拓扑解析**：读取 `/proc/cpuinfo` 的 ARM MIDR 与 `/sys/devices/system/cpu/` 拓扑簇，匹配主流芯片规格，不硬编码特定型号。
- **核心组平均负载**：展示各核心组平均利用率（如 `A55 24% 4 Core`、`A78 61% 3 Core`、`X1 18% 1 Core`）及系统负载、SoC 温度。
- **去繁就简**：剔除当前/最大 MHz、制程、GPU 型号等冗余跑分参数，聚焦服务器核心指标。

### 4. 🍃 纯 Go 单进程极低待机功耗架构
- **0-Fork 进程内采集**：告别高频 Shell 轮询，所有数据直接在单个 Go 守护进程内读取内核接口完成。
- **待机实测**：在测试设备（Xiaomi 11 Ultra / 骁龙888）上，熄屏待机功耗维持在 **~ 0.3W** 左右，亮屏空闲约 **1.x W**，内存常驻 **< 20MB**。

### 5. 💾 本地服务与一键交互
- **24/7 原生 FTP 服务（端口: 2121）**：默认共享 `/data/media/0`，支持匿名免密连接与路径安全保护。
- **KSU / Magisk 执行脚本 (`action.sh`)**：点击模块「执行」自动将 AList WebDAV 挂载链接复制到剪贴板，并调起浏览器打开控制台（端口: 8080）。

### 6. 🤝 配合常用推荐工具协同使用
为了满足更多文件管理与协议需求，推荐配合以下成熟工具协同操作：
1. **[文件闪传](https://xiaolifaa.com/)**：界面友好，适合在局域网跨设备快速浏览相册、图片、视频与日常文件快速互传。
2. **多系统工具箱**：若需要 Windows 原生网络邻居（SMB）共享，推荐有 Root 权限的用户通过多系统工具箱单独开启 SMB 共享服务配合使用。

---

## 🛠️ 本地编译命令

进入模块 `server/` 源码目录，执行以下单行静态交叉编译指令：

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o nas_server main.go hardware.go soc_database.go battery_provider.go
chmod 755 nas_server
```

---

## 📥 安装与使用指南

1. **模块刷入**：
   - 在 **KernelSU / Magisk / APatch** 管理器中选择模块包刷入并重启设备。
2. **快捷访问**：
   - 在管理器模块列表中点击「执行 / Action」按钮，将自动复制 WebDAV 挂载链接并直接在浏览器中打开 Web 控制台；
   - 或在局域网内任意设备的浏览器访问：`http://[手机局域网IP]:8080`。

---

## 📄 开源协议
本项目基于 [MIT License](LICENSE) 协议开源。
