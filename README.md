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

它旨在将任意闲置的 Android 手机/平板，转变为极低功耗（熄屏待机仅约 **0.3W**）、免运维、开箱即用的 24/7 局域网私有云盘与硬件监控服务器。

---

## 🌟 核心设计与硬件识别体系

### 1. 🖥️ PC 大屏空间极致利用与全响应式排版
- **4 级响应式断点**：覆盖超宽 PC（`>=1600px`）、普通桌面（`1200px~1599px`）、平板（`768px~1199px`）与手机（`<768px`）。
- **消灭底部无效留白**：优化各监控卡片的信息层级与高度比例，在 1080p 标准屏幕下实现内容自然铺满首屏，信息密度大幅提升。
- **数字优先设计**：核心存储空间、内存占用、实时功耗等关键指标采用醒目大字号展示，一眼尽览核心状态。

### 2. 🔋 真实电池健康度与 Wh 主单位能量管理
- **真实健康度探测（BatteryProvider）**：动态探测 Linux/Android 内核底层与各厂商 BMS 节点（`charge_full`、`charge_full_design`、`cycle_count`），杜绝粗暴写死 100% 健康度。
- **Wh 标称能量优先**：全面以工程级 **Wh** 为主单位呈现容量（如 `17.6 Wh`），并以较小字号辅助显示 `≈ 4630 mAh`。
- **真实循环次数**：如实读取并呈现电池充电循环次数（`cycle_count`），无法获取时显示“未知”，绝不编造虚假数据。
- **智能平滑续航估算**：
  - 放电状态：基于健康容量能量与 60 秒滑动平均功耗（EMA 滤波）计算稳定剩余可用时间（如 `≈ 1天 4小时` 或 `≈ 4小时 12分`）；
  - 充电状态：**自动隐藏剩余续航时间**，自适应切换为展示 `⚡ 充电中 (充电功率: X.X W)` 或 `⚡ 已充满`。

### 3. ⚡ 通用多平台 SoC 架构与动态拓扑识别
- **多层解耦识别引擎**：直接从 `/proc/cpuinfo` 读取 ARM MIDR，结合 `/sys/devices/system/cpu/` 动态扫描并聚合 CPU 拓扑簇（Cluster），匹配高通骁龙全系、联发科天玑全系、Google Tensor、三星 Exynos 数据库。
- **核心组平均利用率**：单次遍历 `/proc/stat` 同时计算各核心组（如 `A55 24% 4 Core`、`A78 61% 3 Core`、`X1 18% 1 Core`）的平均负载与系统负载。

### 4. 🤝 配合常用推荐工具协同使用

为满足更丰富的相册浏览与文件共享需求，推荐配合以下常用工具协同操作：

1. **[文件闪传](https://xiaolifaa.com/)**：界面简洁，非常适合在局域网内多设备间快速查看手机图片、相册媒体，以及日常文件的高速互传。

2. **多系统工具箱**：由于目前技术原因暂未将完整 SMB 协议栈稳定内置于本模块中，如有 Root 权限且需要原生 Windows 网络邻居 SMB 共享的用户，推荐通过多系统工具箱单独开启 SMB 共享服务。

---

## 🌐 全生态跨端多设备联动体系（核心联动）

PocketNAS Pro 深度打通了苹果、微软、安卓、智能电视等多端生态，支持多种通用存储协议无缝互联：

```
                              ┌────────────────────────┐
                              │  PocketNAS Pro (手机)  │
                              │  /data/media/0 (存储)   │
                              └───────────┬────────────┘
                                          │
        ┌───────────────────┬─────────────┼───────────────────┬───────────────────┐
        │ WebDAV (:5244/dav)│             │ FTP (:2121)       │ WebUI (:8080)     │ AList (:5244)
        ▼                   ▼             ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Mac 访达    │   │  Windows PC   │   │  Android手机  │   │  浏览器控制台  │   │  多网盘聚合   │
│  (Cmd + K 挂载)│   │ (映射网络驱动器)│   │ (MT管理器/ES)  │   │ (全景状态/测速) │   │ (音视频在线预览)│
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
        │                   │
        ▼                   ▼
┌───────────────────────────────────┐
│     智能电视 / 电视盒子 / 平板    │
│  (Kodi / 影视仓 / Infuse / nPlayer) │
│     4K 原画高码率免解压直接播放    │
└───────────────────────────────────┘
```

### 1. 📺 电视盒子 / 平板 / 手机播放器联动（Kodi / Infuse / 影视仓）
- 在智能电视（Apple TV、小米电视、索尼电视等）或平板中打开 **Kodi**、**Infuse**、**影视仓**、**nPlayer**；
- 添加 **WebDAV** 源，填入 `http://[手机IP]:5244/dav`（或使用 FTP `ftp://[手机IP]:2121`）；
- 局域网千兆/Wi-Fi 6 极速直连，手机存储内的 4K REMUX 原盘、高码率 HDR 电影免解压秒开、随心拖拽进度条！

### 2. 🍏 Mac 访达（Finder）原生磁盘挂载联动
- 在 Mac 电脑上按快捷键 `Cmd + K`（或点击菜单栏「前往」➔「连接服务器」）；
- 输入服务器地址：`http://[手机IP]:5244/dav`，点击连接；
- 手机内部存储瞬间变为 Mac 的一个**本地网络磁盘卷标**，像操作本机硬盘一样直接拖拽传输照片、备份视频！

### 3. 🪟 Windows 资源管理器网络驱动器联动
- 在 Windows「此电脑」空白处右键，选择「映射网络驱动器」；
- 驱动器盘符选择 `Z:`，文件夹填入 `http://[手机IP]:5244/dav`；
- 映射成功后，手机存储变身 Windows 本地独立分区，支持批量复制、重命名与工程文件直读。

### 4. ⚡ 24/7 原生安全 FTP 服务联动（MT 管理器 / FileZilla）
- 默认监听 `2121` 端口，共享根目录 `/data/media/0`；
- 支持匿名免密直连，内置 `safeResolvePath` 软链接防逃逸与 Root 目录穿越保护；
- 在手机端 MT 管理器、电脑端 FileZilla 中秒级接入，实现跑满 Wi-Fi 物理带宽的高速文件读写。

### 5. 📱 KernelSU / Magisk「一键执行」无缝联动
- 在管理器模块列表中点击「执行 / Action」按钮：
  1. 脚本自动探测当前 Wi-Fi 物理 IP；
  2. **一键复制 WebDAV 挂载链接（`http://[IP]:5244/dav`）至系统剪贴板**；
  3. 弹出系统 Toast 提醒，并直接拉起浏览器跳转至 Web 控制台。

---

## 📊 功耗表现实测（Xiaomi 11 Ultra / Snapdragon 888）

| 运行状态 | 旧版 Shell 轮询架构 | PocketNAS Pro v3.2.2 (Go 原生) | 优化幅度 |
| :--- | :--- | :--- | :--- |
| **熄屏待机功耗** | ~ 2.2W - 3.4W (高频唤醒锁核) | **~ 0.3W (小核休眠 710MHz)** | ⬇️ **降低约 85% - 90%** |
| **亮屏空闲功耗** | ~ 2.5W - 3.8W | **~ 1.x W** | ⬇️ **降低约 60%** |
| **进程与线程开销** | 150+ 进程创建/秒 | **0 子进程创建 (单二进制常驻)** | ⬇️ **100% 杜绝 Fork 消耗** |
| **内存占用 (RAM)** | 波动且多命令占用 | **< 20MB 稳定常驻** | 极低内存开销 |

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
   - 在 **KernelSU / Magisk / APatch** 管理器中选择 `PocketNAS-Pro-v3.2.2.zip` 刷入并重启手机。
2. **进入控制台**：
   - 在模块列表中点击「执行 / Action」，自动复制 WebDAV 挂载链接并直接在手机浏览器中打开 Web 控制台；
   - 或局域网内任意设备浏览器访问：`http://[手机局域网IP]:8080`。
3. **服务端口一览**：
   - **Web 控制台**：`http://[手机局域网IP]:8080`
   - **WebDAV 挂载**：`http://[手机局域网IP]:5244/dav`
   - **FTP 文件服务**：`ftp://[手机局域网IP]:2121`
   - **AList 聚合盘**：`http://[手机局域网IP]:5244`

---

## 📄 开源协议与声明
本项目基于 [MIT License](LICENSE) 协议开源。
