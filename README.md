# 口袋 NAS · PocketNAS Pro v3.2.0

<p align="center">
  <img src="https://img.shields.io/badge/Release-v3.2.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20(Pure%20Go%20Static)-green?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Root-KernelSU%20%7C%20Magisk%20%7C%20APatch-blueviolet?style=flat-square" alt="Root" />
  <img src="https://img.shields.io/badge/Android-11%20~%2015%20(Kernel%205.4%2B)-orange?style=flat-square" alt="Android" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

PocketNAS Pro 是一个专为 Android 设备（KernelSU / Magisk / APatch 环境）打造的**通用型 Android 私人 NAS 与全景硬件监控平台**。

它旨在将任意闲置的 Android 手机/平板，转变为低功耗（熄屏待机仅约 **0.3W**）、免运维、开箱即用的 24/7 局域网私有云盘与硬件监控服务器。

---

## 🌟 v3.2.0 核心更新与技术亮点

### 1. 🖥️ PC 大屏空间极致利用与全响应式排版
- **多端视口自适应**：构建了覆盖超宽 PC（`>=1600px`）、普通桌面（`1200px~1599px`）、平板（`768px~1199px`）与手机（`<768px`）的 4 级响应式网格布局。
- **消灭底部无效留白**：优化各监控卡片的信息层级与高度比例，在 1080p 标准屏幕下实现内容自然铺满首屏，信息密度大幅提升。
- **数字优先设计**：核心存储空间、内存占用、实时功耗等关键指标采用醒目大字号展示，一眼尽览核心状态。

### 2. 🔋 真实电池健康度与 Wh 主单位能量管理
- **真实健康度探测（BatteryProvider）**：动态探测 Linux/Android 内核底层与各厂商 BMS 节点（`charge_full`、`charge_full_design`、`cycle_count`），杜绝粗暴写死 100% 健康度。
- **Wh 标称能量优先**：全面以工程级 **Wh** 为主单位呈现容量（如 `17.6 Wh`），并以较小字号辅助显示 `≈ 4630 mAh`。
- **真实循环次数**：如实读取并呈现电池充电循环次数（`cycle_count`），无法获取时显示“未知”，绝不编造虚假数据。
- **智能平滑续航估算**：
  - 放电状态：基于健康容量能量与 60 秒滑动平均功耗（EMA 滤波）计算稳定剩余可用时间（如 `≈ 1天 4小时` 或 `≈ 4小时 12分`），杜绝瞬间功耗波动导致的数值跳变；
  - 充电状态：**自动隐藏剩余续航时间**，自适应切换为展示 `⚡ 充电中 (充电功率: X.X W)` 或 `⚡ 已充满`。

### 3. ⚡ 通用多平台 SoC 架构与动态拓扑识别
- **多层解耦识别引擎**：
  - **第 1 层**：直接从 `/proc/cpuinfo` 读取 ARM MIDR（Implementer 与 Part），解码为具体核心（如 Cortex-X1..X4、A78..A720、A55..A520、Qualcomm Oryon/Kryo）；
  - **第 2 层**：从 `/sys/devices/system/cpu/` 动态扫描并聚合 CPU 拓扑簇（Cluster）；
  - **第 3 层**：匹配高通骁龙（8/7/6系列）、联发科天玑（9000/8000/7000/1000系列）、Google Tensor、三星 Exynos 规格数据库；
- **核心组平均利用率**：单次遍历 `/proc/stat` 同时计算各核心组（如 `A55 24% 4 Core`、`A78 61% 3 Core`、`X1 18% 1 Core`）的平均负载与系统 1/5/15 分钟负载。
- **极简实用**：主卡片彻底剔除当前 MHz、最大频率、制程、GPU 型号等冗余硬件参数，回归 NAS 监控本真。

### 4. 🍃 极低待机功耗架构（0-Fork / 纯 Go 单进程）
- **完全告别 Shell 轮询**：所有数据采集均在单一 Go 原生进程内直接通过 Linux sysfs、`/proc` 与系统调用完成，彻底移除了旧版产生的高频 `sh`、`cat`、`grep`、`getprop` 唤醒风暴。
- **分级能效采样**：
  - 静态规格（SoC 型号、CPU 拓扑、设计容量）：启动时读取 1 次并内存常驻；
  - 动态状态（CPU 负载、网络速率）：1~2 秒轻量更新；
  - 能量与温度（电池电压、电流、温区）：3 秒低频更新；
  - 存储 `statfs`：30 秒更新。

---

## 📊 功耗表现实测（Xiaomi 11 Ultra / Snapdragon 888）

| 运行状态 | 旧版 Shell 轮询架构 | PocketNAS Pro v3.2.0 (Go 原生) | 优化幅度 |
| :--- | :--- | :--- | :--- |
| **熄屏待机功耗** | ~ 2.2W - 3.4W (高频唤醒锁核) | **~ 0.3W (小核休眠 710MHz)** | ⬇️ **降低约 85% - 90%** |
| **亮屏空闲功耗** | ~ 2.5W - 3.8W | **~ 1.x W** | ⬇️ **降低约 60%** |
| **进程与线程开销** | 150+ 进程创建/秒 | **0 子进程创建 (单二进制常驻)** | ⬇️ **100% 杜绝 Fork 消耗** |
| **内存占用 (RAM)** | 波动且多命令占用 | **< 20MB 稳定常驻** | 极低内存开销 |

---

## 💾 核心存储与文件共享服务

1. **24/7 原生安全 FTP 服务（端口: 2121）**：
   - 默认共享路径 `/data/media/0`（手机内部存储）；
   - 支持匿名免密全速读写，内置 `safeResolvePath` 软链接防逃逸与根目录保护机制。
2. **WebDAV 局域网挂载（端口: 5244/dav）**：
   - Mac 访达（`Cmd + K` 输入 `http://[手机IP]:5244/dav`）直接挂载为本地磁盘；
   - Windows 此电脑 ➔ 映射网络驱动器挂载；
   - 电视盒子 / 平板（Kodi、影视仓、Infuse、nPlayer）直连 4K 原画免解压播放。
3. **AList / OpenList 私人云存储（端口: 5244）**：
   - 聚合网盘与本地存储管理，支持在线音视频预览与多源挂载。
4. **全景 Web 控制台 & 传输测速（端口: 8080）**：
   - 响应式磨砂玻璃 UI，集成实时 CPU/网速波形、多设备连接终端与双向传输测速引擎。

---

## 🛠️ 本地编译与打包

在具备 Go 1.22+ 环境的终端中执行以下单行静态交叉编译命令：

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o nas_server main.go hardware.go soc_database.go battery_provider.go
chmod 755 nas_server
```

---

## 📥 安装与使用指南

1. **刷入模块**：
   - 在 **KernelSU / Magisk / APatch** 管理器中选择 `PocketNAS-Pro-v3.2.0.zip` 刷入并重启手机。
2. **进入控制台**：
   - 在模块列表中点击「执行 / Action」，将自动复制 WebDAV 挂载链接并直接在手机浏览器中打开 Web 控制台；
   - 或局域网内任意设备浏览器访问：`http://[手机局域网IP]:8080`。
3. **文件访问**：
   - **WebDAV**：`http://[手机局域网IP]:5244/dav`
   - **FTP**：`ftp://[手机局域网IP]:2121`
   - **AList**：`http://[手机局域网IP]:5244`

---

## 📄 开源协议与声明
本项目基于 [MIT License](LICENSE) 协议开源。
