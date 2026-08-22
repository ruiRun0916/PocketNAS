# ⚡ 口袋 NAS · PocketNAS

<p align="center">
  <img src="https://img.shields.io/badge/Author-ruiRun0916-blue?style=for-the-badge&logo=github" alt="Author" />
  <img src="https://img.shields.io/badge/Root-Magisk%20%7C%20KernelSU%20%7C%20APatch%20%7C%20SukiSU-blue?style=for-the-badge&logo=android" alt="Root Compatibility" />
  <img src="https://img.shields.io/badge/UI-Liquid%20Glass%20%7C%20visionOS-cyan?style=for-the-badge" alt="UI Style" />
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20Linux%20Kernel-green?style=for-the-badge" alt="Architecture" />
  <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="License" />
</p>

> 📱 **项目全称**：口袋 NAS · PocketNAS  
> **作者**：[@ruiRun0916](https://github.com/ruiRun0916)  
> 将闲置安卓手机化身为高性能、超低功耗的口袋私人 NAS 智能中枢。专为 Root 环境（Magisk / KernelSU / KernelSU Next / SukiSU Ultra / APatch 等）设计的现代化 Web 控制台。

---

## ✨ 核心特性

- 🎨 **磨砂液态玻璃设计（Liquid Glass UI）**：融合 Apple visionOS、飞牛 NAS（fnOS）与群晖 DSM 设计语言，支持三态主题（跟随系统 / 柔光渐变白 / 液态深色星空）。
- 🕹️ **3D 物理悬浮倾斜动效**：基于光标位置的 3D 物理压感倾斜反馈与动态聚光灯追踪特效（Spotlight Glow）。
- ⚡ **内核级传感器直读**：通过 Linux 内核 `/proc` 与 `/sys` 标准接口零开销直读：
  - 实时整机功耗（瓦数 W / 电压 V / 电流 mA）
  - SoC 芯片温度与电池温度
  - 存储空间（UFS 3.1 / 内部存储挂载点）
  - 运行内存（LPDDR5 实时压力指示）
  - 动态 CPU 负载与实时波形曲线
  - 实时网络双流波形（上下行速率与局域网 IP）
- 📁 **原生内嵌 AList Lite**：一站式集成 AList 文件管理与 WebDAV 挂载，状态监控与私人网盘无缝切换。
- 📋 **地址一键复制**：内置局域网 IP、Dashboard 链接、AList 端点一键快速复制与 Toast 提示。
- 🚀 **全自动硬件识别**：自动探测手机商业市场名（如 Xiaomi 11 Ultra、Redmi、OnePlus 等）与处理器芯片（高通骁龙全系 / 联发科天玑全系 / Tensor / Exynos / 麒麟）。
- 🔒 **100% 纯离线运行**：零外部 CDN、零外网调用，纯本地局域网毫秒级加载。
- 🔋 **超低功耗**：后台 CPU 占用 < 1%，内存开销 < 30MB。

---

## 📲 安装与使用

### 方式一：直接刷入模块（推荐）
1. 从 [Releases](../../releases) 页面下载最新的 `PocketNAS_vX.X.zip`。
2. 打开 **KernelSU 管理器**、**Magisk App**、**KernelSU Next**、**SukiSU Ultra** 或 **APatch**。
3. 选择「从本地安装」并刷入 ZIP 模块。
4. **无需重启**，直接在模块列表中点击 **「执行」** 按钮，手机将自动调起浏览器打开控制台！
5. 在同局域网的电脑、电视或平板浏览器中访问：`http://[手机局域网IP]:8080`。

---

## 🛠️ 项目结构

```text
pocket_nas/
├── module.prop          # 模块元数据定义 (口袋 NAS · PocketNAS | 作者: ruiRun0916)
├── customize.sh         # 安装与权限配置
├── service.sh           # 开机自启与守护脚本
├── action.sh            # 管理器一键「执行」跳转脚本
├── config/
│   └── config.json      # 端口与刷新率配置
├── scripts/
│   └── monitor.sh       # 内核级数据采集引擎
├── server/
│   └── main.go          # Go 语言后端源码
└── web/
    ├── index.html       # Liquid Glass 控制台入口
    ├── style.css        # visionOS 磨砂玻璃与 3D 样式
    └── app.js           # 实时 Canvas 波形与数据引擎
```

---

## 👤 作者与开源协议

- **主要开发者**：[@ruiRun0916](https://github.com/ruiRun0916)
- **开源协议**：[MIT License](LICENSE)
