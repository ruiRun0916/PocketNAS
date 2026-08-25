# 口袋 NAS · PocketNAS Pro v3.2.0

<p align="center">
  <img src="https://img.shields.io/badge/Release-v3.2.0-blue?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go" alt="Go" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20(Pure%20Go)-green?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Root-KernelSU%20%7C%20Magisk%20%7C%20APatch-blueviolet?style=flat-square" alt="Root" />
  <img src="https://img.shields.io/badge/Android-11%20~%2015-orange?style=flat-square" alt="Android" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

PocketNAS Pro 是一个专为 Android Root 环境（KernelSU / Magisk / APatch）设计的轻量级私人 NAS 与硬件状态监控系统。它可以将闲置的 Android 设备转变为局域网内的文件共享服务器与状态监控中枢。

---

## 📌 功能介绍

### 1. 响应式控制台排版
- **多端适配**：支持超宽屏 PC、普通桌面显示器、平板和手机屏幕的自适应排版。
- **页面空间利用**：调整了卡片的高度与信息密度，在电脑端浏览器中能够较好地填充页面，减少空白区域。
- **直观的数据展示**：存储容量、内存占用、实时功耗等常用数据采用醒目大字号展示，方便快速查看。

### 2. 电池信息与健康状态
- **电池健康检测**：尝试读取系统底层的电池容量节点（如 `charge_full`、`charge_full_design` 等），计算当前电池健康百分比；若当前设备未提供相关节点，则提示为“暂不可获取”。
- **容量双单位显示**：主要以 Wh（瓦时）展示电池设计容量与健康容量，并以 mAh（毫安时）作为辅助参考。
- **循环次数读取**：读取系统记录的电池循环充放电次数，无法读取时显示“未知”。
- **平滑续航估算**：
  - 电池供电状态：结合近期平均放电功耗与电池健康容量，估算剩余可用时间（如 `≈ 4小时 12分`）；
  - 充电状态：自动切换显示为充电状态与当前充电功率，隐藏剩余续航时间。

### 3. CPU / SoC 架构与多核状态
- **动态芯片识别**：通过读取系统属性与 `/proc/cpuinfo` 中的 ARM 核心标识，匹配常见的高通骁龙（Snapdragon）、联发科天玑（Dimensity）、Google Tensor 和三星 Exynos 芯片。
- **核心组平均负载**：自动将处理器核心按架构分组（例如大核、中核、小核），展示各核心组的平均利用率与系统平均负载。
- **实用的监控数据**：移除了实时频率、制程、GPU 等非日常监控参数，重点保留处理器型号、总负载、核心状态、系统负载与芯片温度。

### 4. 低开销运行架构
- **Go 原生后台服务**：核心数据采集与 Web 服务集成在一个纯 Go 编写的单二进制程序中，直接通过 Linux `/proc` 和 `/sys` 文件节点读取系统状态，不再使用 Shell 脚本循环执行外部命令。
- **分级数据采集**：
  - 芯片型号、CPU 拓扑、电池设计容量等静态信息在启动时读取一次；
  - CPU 负载与网络流量按常规周期更新；
  - 电池状态与温度按较低频率更新；
  - 存储空间信息定时读取。

---

## 💾 存储与文件共享支持

1. **FTP 服务（默认端口: 2121）**：
   - 默认共享路径为 `/data/media/0`（手机内部存储）；
   - 支持局域网免密读写访问，包含基础的路径安全检查。
2. **WebDAV 挂载（默认端口: 5244/dav）**：
   - 支持在 Mac 访达（Finder）、Windows 网络驱动器以及电视盒子、平板等播放器（如 Kodi、Infuse 等）中作为网络驱动器挂载使用。
3. **AList 文件管理（默认端口: 5244）**：
   - 提供网页端文件浏览与管理功能。
4. **Web 监控控制台与测速（默认端口: 8080）**：
   - 提供实时状态仪表盘与双向网络传输测速工具。

---

## 🛠️ 本地编译说明

如果需要自行编译服务端二进制，可以在 Go 1.22 及以上环境中执行以下交叉编译命令：

```bash
cd server
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o nas_server main.go hardware.go soc_database.go battery_provider.go
chmod 755 nas_server
```

---

## 📥 安装与使用方法

1. **安装模块**：
   - 在 **KernelSU / Magisk / APatch** 管理器中选择模块压缩包进行刷入，刷入完成后重启设备。
2. **访问控制台**：
   - 在模块列表中点击「执行 / Action」，会自动复制 WebDAV 链接并在浏览器中打开控制台；
   - 也可以在局域网其他设备的浏览器中输入：`http://[设备局域网IP]:8080`。
3. **文件连接地址**：
   - **WebDAV**：`http://[设备局域网IP]:5244/dav`
   - **FTP**：`ftp://[设备局域网IP]:2121`
   - **AList 网页**：`http://[设备局域网IP]:5244`

---

## 📄 开源协议
本项目基于 [MIT License](LICENSE) 开源。
