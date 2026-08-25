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

模块本身主要聚焦于**以极低待机功耗（熄屏约 0.3W）实时呈现 CPU 负载、电池真实健康与能量、存储空间、网络吞吐等设备状态**，并常驻轻量 FTP 服务与 Web 控制台。多端文件挂载与协议互联主要依托于 AList / WebDAV 等成熟生态，用户亦可配合第三方工具扩展功能。

---

## 🌟 v3.2.2 核心特性与更新

### 1. 🖥️ PC 大屏空间利用率重构与全响应式排版
- **消灭底部无效留白**：调整卡片比例与信息层级，使 PC 浏览器（1080p 屏幕）打开后内容自然铺满首屏视口。
- **4 级响应式网格**：
  - 超宽 PC 端（`≥ 1600px`）：四列展开，图表适度放大；
  - 普通 PC 端（`1200px ~ 1599px`）：紧凑 4 列核心状态 + 2 列波形 + 2 列服务面板；
  - 平板设备（`768px ~ 1199px`）：2×2 均衡网格；
  - 手机移动端（`< 768px`）：单列垂直流排版，数字醒目优先，无横向溢出。

### 2. 🔋 真实电池健康度与 Wh 标称能量管理
- **直读内核驱动/BMS 节点**：动态读取 `charge_full`、`charge_full_design` 与 `cycle_count`，获取真实电池健康度与充电循环次数，无法获取时如实提示“未知”，不编造数据。
- **Wh 能量为主单位**：容量展示以工程级 **Wh** 为主（如 `17.6 Wh`），并附带小字号 `≈ 4630 mAh` 说明。
- **平滑续航估算**：
  - 放电状态：基于健康容量与 60 秒滑动平均功耗（EMA 滤波）估算剩余可用时长；
  - 充电状态：自动隐藏剩余续航时间，自适应切换为展示 `⚡ 充电中 (充电功率: X.X W)`。

### 3. ⚡ 全平台 SoC 动态识别与核心组平均利用率
- **动态核心拓扑解析**：读取 `/proc/cpuinfo` 的 ARM MIDR 与 `/sys/devices/system/cpu/` 拓扑簇，匹配主流芯片规格，不硬编码骁龙 888。
- **核心组平均负载**：展示各核心组平均利用率（如 `A55 24% 4 Core`、`A78 61% 3 Core`、`X1 18% 1 Core`）及系统负载、SoC 温度。
- **去繁就简**：剔除当前/最大 MHz、制程、GPU 型号等冗余参数。

### 4. 🍃 纯 Go 单进程极低待机功耗架构
- **0-Fork 进程内采集**：告别高频 Shell 轮询，所有数据直接在单个 Go 守护进程内读取内核接口完成。
- **待机实测**：熄屏待机功耗维持在 **~ 0.3W** 左右，亮屏空闲约 **1.x W**，内存常驻 **< 20MB**。

### 5. 💾 本地服务与一键交互
- **24/7 原生 FTP 服务（端口: 2121）**：默认共享 `/data/media/0`，支持匿名免密连接与路径安全保护。
- **KSU / Magisk 执行脚本 (`action.sh`)**：点击模块「执行」自动将 AList WebDAV 挂载链接复制到剪贴板，并调起浏览器打开控制台（端口: 8080）。

### 6. 🤝 配合常用推荐工具协同使用
为了满足更多文件管理与协议需求，推荐配合以下第三方工具协同操作：
1. **[文件闪传](https://xiaolifaa.com/)**：界面简洁友好，适合在局域网跨设备快速浏览相册、图片、视频与日常文件快速互传。
2. **多系统工具箱**：由于目前技术原因暂无法将完整 SMB 协议栈稳定内置于本模块中，推荐有 Root 权限且需要 Windows 原生网络邻居共享的用户，通过多系统工具箱单独开启 SMB 共享服务。

---

## 🛠️ 本地编译命令

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o nas_server main.go hardware.go soc_database.go battery_provider.go
chmod 755 nas_server
```

---

## 📄 开源协议
本项目基于 [MIT License](LICENSE) 协议开源。
