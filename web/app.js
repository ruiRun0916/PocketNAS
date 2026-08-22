// =========================================================
// Xiaomi 11 Ultra NAS - Advanced UI Engine & 3D Tilt Physics
// =========================================================

let currentIP = window.location.hostname || "127.0.0.1";
let alistUrl = "http://" + currentIP + ":5244";
const RING_CIRCUMFERENCE = 238.76; // 2 * PI * 38

// 历史波形队列
const cpuHistory = [12, 15, 10, 18, 14, 22, 16, 12, 25, 18, 14, 20, 15, 12, 19, 14, 16, 21, 15, 14];
const netDownHistory = [2, 5, 8, 12, 6, 15, 20, 14, 18, 25, 16, 10, 12, 18, 22, 14, 8, 12, 16, 20];
const netUpHistory = [1, 2, 4, 3, 5, 4, 6, 5, 8, 7, 6, 4, 5, 6, 8, 4, 3, 5, 6, 7];

// 当前主题模式 ('auto' | 'light' | 'dark')
let currentThemeMode = localStorage.getItem("xiaomi_nas_theme") || "auto";

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  init3DTilt();
  initCharts();
  fetchStatus();
  setInterval(fetchStatus, 3500);
});

// ================= 1. 三态主题管理 (System Auto / Gradient Light / Liquid Dark) =================
function initTheme() {
  // 监听系统深色偏好改变
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (currentThemeMode === "auto") {
      applyTheme(e.matches ? "dark" : "light");
    }
  });

  setThemeMode(currentThemeMode);
}

function setThemeMode(mode) {
  currentThemeMode = mode;
  localStorage.setItem("xiaomi_nas_theme", mode);

  // 更新切换按钮高亮
  ["auto", "light", "dark"].forEach((m) => {
    const btn = document.getElementById(`theme-btn-${m}`);
    if (btn) {
      if (m === mode) btn.classList.add("active");
      else btn.classList.remove("active");
    }
  });

  if (mode === "auto") {
    const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(isSystemDark ? "dark" : "light");
  } else {
    applyTheme(mode);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // 重新绘制适配主题的波形图
  drawCpuChart();
  drawNetChart();
}

// ================= 2. 3D 悬浮物理倾斜动效 (3D Tilt Physics) =================
function init3DTilt() {
  const tiltElements = document.querySelectorAll(".glass-card, .btn-glass-tile");
  const MAX_TILT = 8; // 最大倾斜角度 (度)

  tiltElements.forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 归一化中心偏移量 (-0.5 到 0.5)
      const dx = x / rect.width - 0.5;
      const dy = y / rect.height - 0.5;

      // 计算 3D 旋转角度 (鼠标在右上角时，右上角往下倾斜)
      const rotateX = -dy * MAX_TILT;
      const rotateY = dx * MAX_TILT;

      el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;

      // 设置光斑跟随坐标
      el.style.setProperty("--mouse-x", `${x}px`);
      el.style.setProperty("--mouse-y", `${y}px`);
    });

    el.addEventListener("mouseleave", () => {
      el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      el.style.transition = "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
    });

    el.addEventListener("mouseenter", () => {
      el.style.transition = "none";
    });
  });
}

// ================= 3. Tab 切换与导航 =================
function initTabs() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetTabId = item.getAttribute("data-tab");
      switchTab(targetTabId);
    });
  });
}

function switchTab(tabId) {
  const navItems = document.querySelectorAll(".nav-item");
  const tabPanes = document.querySelectorAll(".tab-pane");

  navItems.forEach((n) => {
    if (n.getAttribute("data-tab") === tabId) {
      n.classList.add("active");
    } else {
      n.classList.remove("active");
    }
  });

  tabPanes.forEach((tab) => {
    if (tab.id === tabId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // 如果切换到 AList，自动加载 iframe
  if (tabId === "tab-alist") {
    const frame = document.getElementById("alist-frame");
    if (frame && (!frame.src || frame.src === "about:blank")) {
      frame.src = alistUrl;
    }
  }
}

// ================= 4. 复制功能与 Toast 交互 =================
async function copyText(text, label = "内容") {
  if (!text || text === "--") return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    showToast(`已复制 ${label}: ${text}`);
  } catch (err) {
    showToast(`复制失败，请手动选择`);
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toast-text");
  if (!toast || !toastText) return;
  toastText.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function handleQuickRun() {
  fetchStatus(true);
  showToast("⚡ 已触发系统刷新与数据同步");
}

function reloadAListFrame() {
  const frame = document.getElementById("alist-frame");
  if (frame) {
    frame.src = alistUrl;
    showToast("🔄 AList 页面已刷新");
  }
}

// ================= 5. 动态 Canvas 折线波形图 =================
function initCharts() {
  drawCpuChart();
  drawNetChart();
  window.addEventListener("resize", () => {
    drawCpuChart();
    drawNetChart();
  });
}

function drawCpuChart() {
  const canvas = document.getElementById("cpu-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1) || 300;
  canvas.height = rect.height * (window.devicePixelRatio || 1) || 68;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const len = cpuHistory.length;
  const step = w / (len - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const lineColor = isLight ? "#0284c7" : "#00f2fe";
  const gradColor = isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 242, 254, 0.35)";

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, gradColor);
  grad.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const val = Math.min(100, Math.max(0, cpuHistory[i]));
    const y = h - (val / 100) * (h * 0.85) - 4;
    if (i === 0) ctx.lineTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const val = Math.min(100, Math.max(0, cpuHistory[i]));
    const y = h - (val / 100) * (h * 0.85) - 4;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.stroke();
}

function drawNetChart() {
  const canvas = document.getElementById("net-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1) || 300;
  canvas.height = rect.height * (window.devicePixelRatio || 1) || 68;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const len = netDownHistory.length;
  const step = w / (len - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const downLineColor = isLight ? "#0284c7" : "#00f2fe";
  const upLineColor = isLight ? "#059669" : "#10b981";

  // 下行曲线
  const gradDown = ctx.createLinearGradient(0, 0, 0, h);
  gradDown.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.22)" : "rgba(0, 242, 254, 0.3)");
  gradDown.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const val = Math.min(40, Math.max(0, netDownHistory[i]));
    const y = h - (val / 40) * (h * 0.8) - 4;
    if (i === 0) ctx.lineTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = gradDown;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const val = Math.min(40, Math.max(0, netDownHistory[i]));
    const y = h - (val / 40) * (h * 0.8) - 4;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = downLineColor;
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.stroke();

  // 上行曲线
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const val = Math.min(40, Math.max(0, netUpHistory[i]));
    const y = h - (val / 40) * (h * 0.7) - 4;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = upLineColor;
  ctx.lineWidth = 1.5 * (window.devicePixelRatio || 1);
  ctx.stroke();
}

// ================= 6. 数据拉取与界面渲染 =================
async function fetchStatus(isManual = false) {
  try {
    let res = await fetch("/api/status").catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/status.json");
    }
    if (!res || !res.ok) throw new Error("API Offline");
    const data = await res.json();

    if (data.network && data.network.ip && data.network.ip !== "127.0.0.1") {
      currentIP = data.network.ip;
    }
    alistUrl = data.services && data.services.alist_url ? data.services.alist_url : `http://${currentIP}:5244`;

    const openAlistBtn = document.getElementById("btn-open-alist");
    if (openAlistBtn) openAlistBtn.href = alistUrl;

    // 1. 顶部 Hero
    if (data.device) document.getElementById("dev-name").innerText = data.device + " · PocketNAS";
    if (data.cpu && data.cpu.model) {
      const devSub = document.getElementById("dev-sub");
      if (devSub) devSub.innerHTML = '<span>' + data.cpu.model + '</span> <span>·</span> <span>' + (data.system || 'Android') + ' (Root)</span>';
    }
    if (data.uptime) document.getElementById("uptime-badge").innerHTML = `<span>⏱️ 运行: ${data.uptime}</span>`;
    if (data.time) document.getElementById("last-update").innerText = `更新: ${data.time}`;

    // 2. 存储环形图
    if (data.storage) {
      const sPct = Math.min(100, Math.max(0, parseFloat(data.storage.percent) || 0));
      const sOffset = (sPct / 100) * RING_CIRCUMFERENCE;
      document.getElementById("storage-pct").innerText = sPct + "%";
      document.getElementById("storage-ring").setAttribute("stroke-dasharray", `${sOffset}, ${RING_CIRCUMFERENCE}`);
      document.getElementById("storage-used").innerText = data.storage.used;
      document.getElementById("storage-free").innerText = data.storage.free;
      document.getElementById("storage-total").innerText = data.storage.total;

      const sTotalDet = document.getElementById("storage-total-detail");
      const sUsedDet = document.getElementById("storage-used-detail");
      const sFreeDet = document.getElementById("storage-free-detail");
      if (sTotalDet) sTotalDet.innerText = data.storage.total;
      if (sUsedDet) sUsedDet.innerText = data.storage.used;
      if (sFreeDet) sFreeDet.innerText = data.storage.free;
    }

    // 3. 内存环形图
    if (data.memory) {
      const rPct = Math.min(100, Math.max(0, parseFloat(data.memory.percent) || 0));
      const rOffset = (rPct / 100) * RING_CIRCUMFERENCE;
      document.getElementById("ram-pct").innerText = rPct + "%";
      document.getElementById("ram-ring").setAttribute("stroke-dasharray", `${rOffset}, ${RING_CIRCUMFERENCE}`);
      document.getElementById("ram-used").innerText = data.memory.used;
      document.getElementById("ram-free").innerText = data.memory.free;
      document.getElementById("ram-total").innerText = data.memory.total;

      const ramPressure = document.getElementById("ram-pressure");
      if (ramPressure) {
        if (rPct > 85) {
          ramPressure.innerText = "压力: 偏高";
          ramPressure.style.color = "var(--accent-orange)";
        } else {
          ramPressure.innerText = "压力: 正常";
          ramPressure.style.color = "var(--accent-green)";
        }
      }
    }

    // 4. 实时功耗与电池
    if (data.battery) {
      const pVal = data.battery.power || "-- W";
      const isCharging = data.battery.charging ? " (⚡ 充电中)" : " (电池供电)";
      const bLevel = (data.battery.level ?? "--") + "%";
      const vVal = data.battery.voltage || "-- V";
      const iVal = data.battery.current || "-- mA";
      const batTemp = (data.battery.temperature || "--") + "℃";

      document.getElementById("power-badge").innerHTML = `<span>⚡ 功耗: ${pVal}</span>`;
      document.getElementById("power-main-val").innerText = pVal;
      document.getElementById("power-status").innerText = bLevel + isCharging;
      document.getElementById("bat-temp-val").innerText = batTemp;
      document.getElementById("power-vi-val").innerText = `${vVal} · ${iVal}`;
    }

    // 5. CPU & 温度 & 波形图推进
    let cpuUsage = 0;
    if (data.cpu) {
      cpuUsage = Math.min(100, Math.max(0, parseFloat(data.cpu.usage) || 0));
      document.getElementById("cpu-val").innerText = cpuUsage + "%";
      
      cpuHistory.shift();
      cpuHistory.push(cpuUsage);
      drawCpuChart();
    }
    if (data.temperature) {
      const cpuT = (data.temperature.cpu || "--") + "℃";
      document.getElementById("cpu-temp-badge").innerText = `SoC: ${cpuT}`;
    }

    // 6. 网络速率与设置页端点
    if (data.network) {
      document.getElementById("net-down").innerText = "↓ " + (data.network.download || "0 B/s");
      document.getElementById("net-up").innerText = "↑ " + (data.network.upload || "0 B/s");

      const downNum = parseFloat(data.network.download) || (Math.random() * 8 + 4);
      const upNum = parseFloat(data.network.upload) || (Math.random() * 3 + 1);
      netDownHistory.shift();
      netDownHistory.push(downNum);
      netUpHistory.shift();
      netUpHistory.push(upNum);
      drawNetChart();

      if (data.network.ip) {
        document.getElementById("net-ip-tag").innerText = data.network.ip;
        
        const ipCopy = document.getElementById("net-ip-copy-val");
        if (ipCopy) ipCopy.innerText = data.network.ip;

        const webCopy = document.getElementById("webui-url-copy-val");
        if (webCopy) webCopy.innerText = `http://${data.network.ip}:8080`;

        const alistCopy = document.getElementById("alist-url-copy-val");
        if (alistCopy) alistCopy.innerText = `http://${data.network.ip}:5244`;

        const davCopy = document.getElementById("webdav-url-copy-val");
        if (davCopy) davCopy.innerText = `http://${data.network.ip}:5244/dav`;
      }

      if (data.network.interface) {
        document.getElementById("net-if").innerText = data.network.interface;
      }
    }

    // 7. 计算 NAS 健康评分
    const healthBadge = document.getElementById("health-badge");
    if (healthBadge) {
      let score = 100;
      if (cpuUsage > 70) score -= 8;
      const cTemp = parseFloat(data.temperature?.cpu) || 40;
      if (cTemp > 65) score -= 10;
      const sPct = parseFloat(data.storage?.percent) || 0;
      if (sPct > 90) score -= 10;
      score = Math.max(75, Math.min(100, score));
      healthBadge.innerHTML = `<span>🛡️ 健康评分: ${score}%</span>`;
    }

    if (isManual) {
      showToast("✅ 数据刷新成功");
    }

  } catch (err) {
    console.warn("获取 NAS 状态异常:", err);
  }
}
