# 口袋 NAS · PocketNAS Pro

<p align="center">
  <img src="https://img.shields.io/badge/Author-ruiRun0916-blue?style=flat-square&logo=github" alt="Author" />
  <img src="https://img.shields.io/badge/Root-KernelSU%20%7C%20Magisk%20%7C%20APatch-blue?style=flat-square&logo=android" alt="Root Compatibility" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20Linux%20Kernel-green?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License" />
</p>

PocketNAS Pro 是一个专为 Android Root 环境（KernelSU / Magisk / APatch）设计的轻量级私人 NAS 模块，旨在将闲置 Android 手机转换为 24/7 常驻的局域网存储与监控服务器。

---

## 📌 核心功能

### 1. 存储与文件共享
- **原生 FTP 服务（端口: 2121）**：
  - 默认共享目录 `/data/media/0`（手机内部存储）；
  - 支持匿名免密直接读写，适配 MT 管理器、FileZilla、电脑文件快传等场景；
  - 内置路径安全检查（`safeResolvePath`），防止 `../` 路径穿越及软链接逃逸；
  - 保护共享根目录本身，防止意外删除或重命名。
- **WebDAV / AList Lite 挂载（端口: 5244）**：
  - 支持在 Mac 访达（`Cmd + K`）及 Windows（映射网络驱动器）中挂载为本地磁盘；
  - 支持在 Kodi、影视仓、Infuse 等多媒体客户端中通过 WebDAV 播放局域网音视频。

### 2. 网页管理控制台（端口: 8080）
- 提供直观的 Web 端单页管理界面；
- 实时展示内部存储容量、运行内存占用、ZRAM 交换分区状态；
- 展示 CPU 实时负载波动与网络上下行实时吞吐曲线；
- 读取并展示 SoC 芯片温度、电池温度及电池侧功率（基于真实传感器数据，无法读取时显示 `--`，不使用伪造数据）。

### 3. 局域网传输测速
- 支持在浏览器端直接发起与手机 NAS 之间的双向网络传输测试；
- 包含 Ping 延迟、Jitter 抖动、客户端至 NAS（上传）与 NAS 至客户端（下载）吞吐压测；
- 单向压测持续 6 秒以上，减少瞬时网络波动带来的误差；
- 测速过程在内存中流式处理，不产生磁盘临时文件。

---

## ⚙️ 架构与能效设计

- **进程内无 Fork 采集**：直接读取 Linux 内核 `/proc/stat`、`/proc/meminfo`、`/proc/net/dev`、`/sys/class/thermal` 及 `statfs` 系统调用，避免频繁创建 Shell 子进程；
- **内存快照响应**：状态数据通过内存中的线程安全快照维护，API 直接返回内存数据，避免每秒读写磁盘；
- **分级采样频率**：
  - CPU 负载与网络吞吐：1 秒
  - 内存与系统负载：2 秒
  - 温度、电池状态与协议扫描：5 秒
  - 存储空间：30 秒
- **进程管理与容错**：采用 PID 文件管理后台进程，看门狗在检测到服务异常时采用指数退避机制重启，并设有重试次数上限以防止死循环。
- **VPN 兼容**：服务默认监听 `0.0.0.0`，不设 IP 白名单或网段限制，手机开启 VPN 或处于热点环境下仍可正常工作。

---

## 📱 适用环境

- **测试设备**：Xiaomi 11 Ultra（骁龙 888，12GB RAM，512GB UFS 3.1）
- **系统版本**：Android 14（Linux 内核 5.4 及以上）
- **Root 环境**：KernelSU / Magisk / APatch / SukiSU
- **运行建议**：建议插电长期运行，并将相关应用或模块排除在系统的激进后台清理策略之外。

---

## 🚀 安装与使用

### 安装步骤
1. 在 [Releases](../../releases) 页面下载最新的 `PocketNAS_vX.X.X.zip`；
2. 在 **KernelSU 管理器** 或 **Magisk App** 中选择「从本地安装」并刷入；
3. 刷入完成后重启设备（或在模块列表中直接点击「执行」启动控制台）。

### 访问方式
确保访问设备与手机处于同一局域网下：
- **Web 控制台**：`http://[手机局域网IP]:8080`
- **FTP 服务**：`ftp://[手机局域网IP]:2121`（匿名免密）
- **WebDAV 挂载**：`http://[手机局域网IP]:5244/dav`
- **AList 聚合面板**：`http://[手机局域网IP]:5244`

---

## 📂 项目结构

```text
pocket_nas/
├── module.prop          # 模块元数据定义
├── customize.sh         # 安装与权限配置脚本
├── service.sh           # 开机自启动与进程守护脚本
├── action.sh            # 管理器一键跳转入口
├── config/
│   └── config.json      # 服务端口与基础配置
├── scripts/
│   └── monitor.sh       # 备用状态采集脚本
├── server/
│   ├── main.go          # Go 守护进程主入口
│   └── speedtest.go     # 测速接口与并发控制
└── web/
    ├── index.html       # 控制台前端页面
    ├── style.css        # 控制台样式表
    └── app.js           # 前端数据交互与图表渲染
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。欢迎提交 Issue 或 Pull Request。
