# 口袋 NAS · PocketNAS Pro v3.2.2

<p align="center">
  <img src="https://img.shields.io/badge/Release-v3.2.2-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20(Pure%20Go%20Static)-green?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Root-KernelSU%20%7C%20Magisk%20%7C%20APatch-blueviolet?style=flat-square" alt="Root" />
  <img src="https://img.shields.io/badge/Android-11%20~%2015%20(Kernel%205.4%2B)-orange?style=flat-square" alt="Android" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

PocketNAS Pro 是一个专为 Android 设备（KernelSU / Magisk / APatch 环境）打造的**通用型 Android 私人 NAS 与全景硬件监控平台**。

它旨在将任意闲置的 Android 手机/平板，转变为低功耗（熄屏待机仅约 **0.3W**）、免运维、开箱即用的 24/7 局域网私有云盘与硬件监控服务器。

---

## 🌐 局域网快捷访问端点速查

在同一局域网（同一 Wi-Fi 或热点）下，通过手机 IP 即可直接接入以下核心服务：

| 访问端点 / 协议 | 默认端口 | 完整访问链接 | 用途与支持客户端 |
| :--- | :--- | :--- | :--- |
| **🖥️ Web 控制台** | `8080` | `http://[手机IP]:8080` | **全景硬件监控仪表盘**（浏览器打开，查看负载、温度、电量、功耗、测速） |
| **📺 WebDAV 挂载** | `5244` | `http://[手机IP]:5244/dav` | **局域网磁盘挂载**（Mac 访达 `Cmd+K`、Win 映射网络驱动器、电视 Kodi/Infuse 4K 播放） |
| **⚡ 原生安全 FTP** | `2121` | `ftp://[手机IP]:2121` | **24/7 原生轻量文件直连**（免密匿名读写，支持 MT 管理器、FileZilla、CX 文件管理器） |
| **📁 AList 文件管理** | `5244` | `http://[手机IP]:5244` | **私人云盘聚合后台**（网页端管理手机内部存储及多源网盘挂载、音视频预览） |

> 💡 **小技巧**：在路由器后台将闲置手机的 MAC 地址绑定为**固定 IP**（例如 `192.168.1.100`），然后在电脑/平板浏览器中收藏 `http://192.168.1.100:8080` 为书签，或添加桌面快捷方式，即可随时一键秒开！

---

## 🎯 模块解决的核心痛点与应用场景

### 痛点一：闲置手机做服务器，黑屏插电放在角落“盲盒运行”
* **旧痛点**：很多玩家用闲置手机刷入 Linux/Termux 或搭建家庭 Web/媒体服务器，手机通常黑屏插着充电器放在弱电箱或角落。想看当前**手机 SoC 发热温度、电池充放电功率、剩余电量、CPU 负载、RAM 占用或闪存剩余空间**，必须走过去点亮屏幕、解锁手机、打开一堆系统设置或软件才能查看。
* **PocketNAS 解决方案**：只需在电脑、iPad 或另一台主力手机上打开浏览器书签，就能通过精美的响应式 Dashboard 远程直观查看手机的全部硬件状态与温控，无需碰触手机本身。

### 痛点二：传统监控脚本每秒疯狂唤醒，造成严重待机发热与功耗反噬
* **旧痛点**：早期的 Android 监控方案多采用 Shell 脚本死循环（`while true; do cat ... grep ...; sleep 1; done`），每秒 Fork/Exec 上百个进程，频繁唤醒 CPU 大小核，导致骁龙 888 等旗舰芯片核心锁频在 1.6GHz~2.2GHz，待机功耗高达 3W+，机身滚烫。
* **PocketNAS 解决方案**：全量重构为单一静态编译的 **Go 原生常驻 Daemon**，所有指标直接通过内存指针读取内核 procfs 与 sysfs，**0 子进程创建、0 磁盘高频写入**。熄屏待机功耗直线下降至 **~0.3W**（小核平稳休眠在最低 710MHz），即使拔掉充电器纯电池供电也能平稳运行数天。

### 痛点三：多端文件传输繁琐，不同操作系统互通困难
* **旧痛点**：电脑传文件到手机需要插数据线或登录第三方即时通讯软件，电视盒子播放手机里的 4K 电影缺乏轻量稳定的协议支持。
* **PocketNAS 解决方案**：开机自动拉起 24/7 原生 FTP（端口 2121）与 WebDAV（端口 5244/dav），全平台原生免客户端接入，无论是 Windows 映射网络驱动器、Mac 访达挂载、还是 Apple TV / Android TV 电视盒子运行 Infuse/Kodi，均可直连手机内置 UFS 闪存，实现百兆级 4K 原画原盘秒播。

---

## 🏗️ 模块内部架构与技术工作流

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             局域网多端客户端 (Clients)                              │
│   PC 浏览器 / Mac 访达 (WebDAV) / Windows 资源管理器 / 电视盒子 Kodi / MT 管理器   │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ TCP 局域网直连 (8080 / 5244 / 2121)
┌────────────────────────────────────────▼─────────────────────────────────────────┐
│                    PocketNAS Pro 守护进程核心 (Go Native Daemon)                   │
│                                                                                  │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐   │
│   │   Web 控制台服务     │  │   24/7 原生 FTP 服务  │  │    WebDAV / AList 引擎   │   │
│   │    (Port: 8080)     │  │    (Port: 2121)     │  │      (Port: 5244)       │   │
│   └──────────┬──────────┘  └──────────┬──────────┘  └────────────┬────────────┘   │
│              │                        │                          │                │
│   ┌──────────▼────────────────────────▼──────────────────────────▼────────────┐   │
│   │                 零 Fork 内存数据采集引擎 (In-Memory Collector)              │   │
│   │      单次扫描、分级缓存、无磁盘 I/O、无外部子进程、瞬时内存 Snapshot 交换       │   │
│   └───────────────────────────────────┬───────────────────────────────────────┘   │
│                                       │                                           │
│   ┌───────────────────┬───────────────┴───────────────┬───────────────────────┐   │
│   │   SoC 拓扑引擎     │    BatteryProvider 能量子系统   │     存储与网络雷达     │   │
│   │ ARM MIDR 核心解码  │ 真实 BMS 探针 / Wh 标称能量换算 │  statfs / proc/net/dev│   │
│   │ 多核簇利用率计算   │ 60s 滑动平均功耗与平滑续航算法 │  TCP 端口状态实时探测 │   │
│   └─────────┬─────────┴───────────────┬───────────────┴───────────┬───────────┘   │
└─────────────┼─────────────────────────┼───────────────────────────┼───────────────┘
              │                         │                           │
┌─────────────▼─────────────────────────▼───────────────────────────▼───────────────┐
│                        Linux Kernel & Android 底层硬件驱动                         │
│   /proc/stat · /proc/cpuinfo · /sys/class/thermal/ · /sys/class/power_supply/     │
│   /proc/net/dev · /proc/loadavg · UFS 内部存储分区 (/data/media/0)                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 核心技术协同说明
1. **纯 Go 静态交叉编译（0-CGO）**：
   - 采用 `CGO_ENABLED=0 GOOS=linux GOARCH=arm64` 构建裸二进制，彻底摆脱 Android 动态链接库与 NDK 依赖，内存常驻开销小于 20MB。
2. **内核级直读与分级能效调度**：
   - **静态数据（启动读 1 次）**：SoC 型号、CPU 物理核心拓扑、电池设计容量、系统属性；
   - **高动态数据（1~2 秒更新）**：单次遍历 `/proc/stat` 同时解出 CPU 总负载与各核心组平均利用率，读取 `/proc/net/dev` 计算瞬时吞吐；
   - **中动态数据（3 秒更新）**：读取温区 `/sys/class/thermal/` 与供电节点，推入 EMA 滑动滤波窗口；
   - **低动态数据（30 秒更新）**：调用 `syscall.Statfs` 获取存储容量。
3. **ARM MIDR 核心解码器 + SoC 数据库**：
   - 读取 `/proc/cpuinfo` 中的 `CPU implementer` 与 `CPU part`，将 `0x41:0xd44`、`0x41:0xd41` 等十六进制核心指纹解码为真实的 `Cortex-X1`、`Cortex-A78`、`Cortex-A55`、`Qualcomm Oryon` 核心，不依赖硬编码。
4. **前端响应式磨砂玻璃 UI（Vanilla JS + Canvas）**：
   - 纯原生 HTML5/CSS3 开发，零臃肿第三方框架。内置贝塞尔平滑波形曲线算法与 4 级响应式断点，PC 宽屏与手机竖屏自适应无缝渲染。

---

## 💻 核心代码框架与实现解析

### 1. 电池健康与 Wh 能量检测算法 (`server/battery_provider.go`)
```go
// 动态探测各厂商 BMS 节点，计算真实健康度与标称能量 (Wh)
func (bp *BatteryProvider) probeStaticCapacitiesLocked() {
    // 1. 优先获取设计容量 (charge_full_design)
    // 2. 探测真实健康容量 (charge_full / fg_fullcapnom)
    if healthMah > 0 && bp.designCapacityMAh > 0 {
        // 计算健康百分比
        ratio := (float64(healthMah) / float64(bp.designCapacityMAh)) * 100.0
        bp.healthPercent = fmt.Sprintf("%.1f%%", ratio)
        // 标称能量换算: Wh = (mAh * V_nominal) / 1000
        bp.healthEnergyWh = (float64(healthMah) * bp.nominalVoltage) / 1000.0
    }
    // 3. 读取硬件真实循环次数 (cycle_count)
}

// 60秒滑动平均功耗滤波算法，估算平滑剩余可用续航
func (bp *BatteryProvider) CollectTelemetry(...) BatteryHealthInfo {
    if isCharging {
        bp.powerSamples = bp.powerSamples[:0] // 充电状态清空历史，隐藏剩余续航
        return ...
    }
    // 维护 20 个样本 (约 60 秒) 滑动窗口
    avgPower := sum / float64(len(bp.powerSamples))
    remainEnergy := bp.healthEnergyWh * (float64(levelInt) / 100.0)
    remainHours := remainEnergy / avgPower
    // 格式化输出: ≈ 1天 4小时 或 ≈ 4小时 12分
}
```

### 2. 零 Fork 单次遍历 CPU 核心组利用率 (`server/main.go`)
```go
// 单次扫描 /proc/stat：零外部进程同时解出 CPU 总利用率与各个核心负载
scanner := bufio.NewScanner(file)
for scanner.Scan() {
    line := scanner.Text()
    if strings.HasPrefix(line, "cpu ") {
        // 计算全核总利用率 (Total CPU Usage)
    } else if strings.HasPrefix(line, "cpu") {
        // 计算单核心利用率: cpu0, cpu1, cpu2...
    }
}
// 结合启动时建立的 CPU Topology，聚合输出核心组平均利用率 (如 A55 24% 4 Core)
liveClusters := CalculateClusterUsages(GlobalHardwareInfo.Clusters, perCoreUsage)
```

---

## 📊 功耗实测对照表（Xiaomi 11 Ultra / Snapdragon 888）

| 测试场景 | 旧版高频 Shell 架构 | PocketNAS Pro v3.2.2 (Go 原生) | 能效提升 |
| :--- | :--- | :--- | :--- |
| **熄屏待机功耗** | `2.2W ~ 3.4W` (小核被锁在 1.6GHz) | **`~ 0.3W`** (小核休眠在 710MHz) | ⬇️ **降低约 85% ~ 90%** |
| **亮屏空闲功耗** | `2.5W ~ 3.8W` | **`~ 1.x W`** | ⬇️ **降低约 60%** |
| **系统进程调度** | 每秒产生 150+ 个子进程 (Fork/Exec) | **0 子进程创建 (单一二进制常驻)** | ⬇️ **完全杜绝进程唤醒开销** |
| **常驻内存占用** | 波动较大且随命令堆叠 | **`< 20MB` 稳定常驻** | 极佳内存控制 |

---

## 📋 PocketNAS Pro v3.2.2 详细更新日志

* **PC 大屏空间极致优化**：全面调整卡片高度与比例，消除 PC 浏览器访问时底部大面积无意义留白，1080p 屏幕首屏自然铺满；
* **四级响应式排版**：新增超宽 PC（`≥1600px`）、普通桌面（`1200~1599px`）、平板（`768~1199px`）与手机（`<768px`）自适应网格断点；
* **真实电池健康度检测**：引入 `BatteryProvider` 探针，直读底层 BMS 驱动节点，展示真实健康度（如 `92.6%`）与真实循环次数（如 `387 次`）；
* **Wh 主单位能量呈现**：全面升级为以工程级 **Wh** 为主单位（如 `17.6 Wh`），辅以小字号 `≈ 4630 mAh`；
* **充电状态续航自适应**：放电状态展示 60s 滑动平均平滑续航（`≈ 1天 4小时`），插电/充满状态自动隐藏续航并显示充电功率（`4.8 W`）；
* **SoC 动态多核拓扑**：动态识别高通骁龙全系、联发科天玑全系、Google Tensor 与三星 Exynos，展示核心组平均利用率（`A55 24% 4 Core`），移除所有冗余跑分参数；
* **一键复制与快捷交互 (`action.sh`)**：点击模块列表「执行」按钮，自动提取局域网 IP 并将 WebDAV 挂载链接复制到剪贴板，同时调起手机浏览器进入 Web 控制台。

---

## 🛠️ 本地编译与构建

在具备 Go 1.22+ 环境的终端中执行以下命令生成无依赖的 ARM64 裸二进制：

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o nas_server main.go hardware.go soc_database.go battery_provider.go
chmod 755 nas_server
```

---

## 📥 安装与快速上手

1. 在 **KernelSU / Magisk / APatch** 管理器中刷入 `PocketNAS-Pro-v3.2.2.zip` 模块并重启手机；
2. 在模块卡片点击「执行 / Action」即可复制 WebDAV 链接并打开控制台；
3. 同局域网内任意设备打开浏览器访问：`http://[手机局域网IP]:8080` 即可开始使用！

---

## 📄 开源协议
本项目基于 [MIT License](LICENSE) 协议开源。
