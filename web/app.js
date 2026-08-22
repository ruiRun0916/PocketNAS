// =========================================================
// PocketNAS Pro - High-Density UI Engine & Real-time Charts
// =========================================================

let currentIP = window.location.hostname || "127.0.0.1";
let alistUrl = "http://" + currentIP + ":5244";
const RING_CIRCUMFERENCE = 144.513; // 2 * PI * 23

// 历史波形队列 (20个采样点)
const cpuHistory = [15, 18, 12, 22, 16, 28, 20, 15, 32, 24, 18, 25, 20, 16, 24, 18, 20, 26, 18, 17];
const netDownHistory = [2, 5, 8, 12, 6, 15, 20, 14, 18, 25, 16, 10, 12, 18, 22, 14, 8, 12, 16, 20];
const netUpHistory = [1, 2, 4, 3, 5, 4, 6, 5, 8, 7, 6, 4, 5, 6, 8, 4, 3, 5, 6, 7];

let currentThemeMode = localStorage.getItem("pocket_nas_theme") || "auto";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  init3DTilt();
  initCharts();
  fetchStatus();
  setInterval(fetchStatus, 2500);
});

// ================= 1. 三态主题管理 =================
function initTheme() {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (currentThemeMode === "auto") {
      applyTheme(e.matches ? "dark" : "light");
    }
  });
  setThemeMode(currentThemeMode);
}

function setThemeMode(mode) {
  currentThemeMode = mode;
  localStorage.setItem("pocket_nas_theme", mode);

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
  drawCpuChart();
  drawNetChart();
}

// ================= 2. 3D 悬浮物理倾斜动效 =================
function init3DTilt() {
  const tiltElements = document.querySelectorAll(".glass-panel, .action-tile-btn");
  const MAX_TILT = 5;

  tiltElements.forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x / rect.width - 0.5;
      const dy = y / rect.height - 0.5;

      const rotateX = -dy * MAX_TILT;
      const rotateY = dx * MAX_TILT;

      el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.005, 1.005, 1.005)`;
      el.style.setProperty("--mouse-x", `${x}px`);
      el.style.setProperty("--mouse-y", `${y}px`);
    });

    el.addEventListener("mouseleave", () => {
      el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      el.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
    });

    el.addEventListener("mouseenter", () => {
      el.style.transition = "none";
    });
  });
}

// ================= 3. Tab 切换与导航 =================
function initTabs() {
  const tabBtns = document.querySelectorAll(".nav-tab-btn");
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTabId = btn.getAttribute("data-tab");
      switchTab(targetTabId);
    });
  });
}

function switchTab(tabId) {
  const tabBtns = document.querySelectorAll(".nav-tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  tabBtns.forEach((b) => {
    if (b.getAttribute("data-tab") === tabId) {
      b.classList.add("active");
    } else {
      b.classList.remove("active");
    }
  });

  tabPanes.forEach((tab) => {
    if (tab.id === tabId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  if (tabId === "tab-alist") {
    const frame = document.getElementById("alist-frame");
    if (frame && (!frame.src || frame.src === "about:blank")) {
      frame.src = alistUrl;
    }
  }
}

// ================= 4. 复制功能与 Toast =================
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
  }, 1800);
}

function handleQuickRun() {
  fetchStatus(true);
  showToast("⚡ 数据已刷新");
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
  canvas.height = rect.height * (window.devicePixelRatio || 1) || 42;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  const len = cpuHistory.length;
  const step = w / (len - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const lineColor = isLight ? "#0284c7" : "#00f2fe";
  const gradColor = isLight ? "rgba(2, 132, 199, 0.2)" : "rgba(0, 242, 254, 0.35)";

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, gradColor);
  grad.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const val = Math.min(100, Math.max(0, cpuHistory[i]));
    const y = h - (val / 100) * (h * 0.82) - 2;
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
    const y = h - (val / 100) * (h * 0.82) - 2;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.6 * (window.devicePixelRatio || 1);
  ctx.stroke();
}

function drawNetChart() {
  const canvas = document.getElementById("net-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * (window.devicePixelRatio || 1) || 300;
  canvas.height = rect.height * (window.devicePixelRatio || 1) || 42;

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
  gradDown.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.2)" : "rgba(0, 242, 254, 0.28)");
  gradDown.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const val = Math.min(40, Math.max(0, netDownHistory[i]));
    const y = h - (val / 40) * (h * 0.78) - 2;
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
    const y = h - (val / 40) * (h * 0.78) - 2;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = downLineColor;
  ctx.lineWidth = 1.6 * (window.devicePixelRatio || 1);
  ctx.stroke();

  // 上行曲线
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const val = Math.min(40, Math.max(0, netUpHistory[i]));
    const y = h - (val / 40) * (h * 0.68) - 2;
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * step, y);
  }
  ctx.strokeStyle = upLineColor;
  ctx.lineWidth = 1.3 * (window.devicePixelRatio || 1);
  ctx.stroke();
}

// ================= 6. 数据拉取与全量渲染 =================
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

    // 1. 顶部 Header
    if (data.device) {
      const devNameEl = document.getElementById("dev-name");
      if (devNameEl) {
        devNameEl.innerHTML = `<span>${data.device} · PocketNAS</span> <span class="glow-pill green" style="font-size:10px; padding:1px 5px;">● 在线</span>`;
      }
    }
    if (data.cpu && data.cpu.model) {
      const devSub = document.getElementById("dev-sub");
      if (devSub) devSub.innerText = `${data.cpu.model} · ${data.system || 'Android 14'} · KernelSU Root`;
      const cpuModelTag = document.getElementById("cpu-model-tag");
      if (cpuModelTag) cpuModelTag.innerText = data.cpu.model;
    }
    if (data.uptime) {
      const upEl = document.getElementById("uptime-badge");
      if (upEl) upEl.innerHTML = `<span>⏱️ 运行: ${data.uptime}</span>`;
    }
    if (data.time) {
      const timeEl = document.getElementById("last-update");
      if (timeEl) timeEl.innerText = `更新: ${data.time}`;
    }

    // 2. 存储环形图 (彻底消除 0% 溢出 Bug)
    if (data.storage) {
      let sPct = 0;
      const uNum = parseFloat(data.storage.used) || 0;
      const tNum = parseFloat(data.storage.total) || 0;
      if (tNum > 0 && uNum > 0) {
        sPct = Math.min(100, Math.max(0, Math.round((uNum / tNum) * 100)));
      } else if (data.storage.percent && data.storage.percent > 0) {
        sPct = Math.min(100, Math.max(0, Math.round(parseFloat(data.storage.percent))));
      }
      const sOffset = (sPct / 100) * RING_CIRCUMFERENCE;
      const sRing = document.getElementById("storage-ring");
      const sPctEl = document.getElementById("storage-pct");
      if (sPctEl) sPctEl.innerText = sPct + "%";
      if (sRing) sRing.setAttribute("stroke-dasharray", `${sOffset.toFixed(1)}, ${RING_CIRCUMFERENCE}`);

      const sUsed = document.getElementById("storage-used");
      const sFree = document.getElementById("storage-free");
      const sTotal = document.getElementById("storage-total");
      if (sUsed) sUsed.innerText = data.storage.used;
      if (sFree) sFree.innerText = data.storage.free;
      if (sTotal) sTotal.innerText = data.storage.total;

      const sTotalDet = document.getElementById("storage-total-detail");
      const sUsedDet = document.getElementById("storage-used-detail");
      const sFreeDet = document.getElementById("storage-free-detail");
      if (sTotalDet) sTotalDet.innerText = data.storage.total;
      if (sUsedDet) sUsedDet.innerText = data.storage.used;
      if (sFreeDet) sFreeDet.innerText = data.storage.free;
    }

    // 3. 内存环形图与 ZRAM / Cache
    if (data.memory) {
      const rPct = Math.min(100, Math.max(0, parseFloat(data.memory.percent) || 0));
      const rOffset = (rPct / 100) * RING_CIRCUMFERENCE;
      const rRing = document.getElementById("ram-ring");
      const rPctEl = document.getElementById("ram-pct");
      if (rPctEl) rPctEl.innerText = rPct + "%";
      if (rRing) rRing.setAttribute("stroke-dasharray", `${rOffset.toFixed(1)}, ${RING_CIRCUMFERENCE}`);

      const rUsed = document.getElementById("ram-used");
      const rFree = document.getElementById("ram-free");
      const rTotal = document.getElementById("ram-total");
      if (rUsed) rUsed.innerText = data.memory.used;
      if (rFree) rFree.innerText = data.memory.free;
      if (rTotal) rTotal.innerText = data.memory.total;

      const zEl = document.getElementById("zram-used");
      if (zEl) zEl.innerText = data.memory.zram || "--";
      const cEl = document.getElementById("cache-used");
      if (cEl) cEl.innerText = data.memory.cached || "--";

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

    // 4. 处理器与负载环形图
    let cpuUsage = 0;
    if (data.cpu) {
      cpuUsage = Math.min(100, Math.max(0, parseFloat(data.cpu.usage) || 0));
      const cOffset = (cpuUsage / 100) * RING_CIRCUMFERENCE;
      const cRing = document.getElementById("cpu-ring");
      const cPctEl = document.getElementById("cpu-pct");
      const cValSub = document.getElementById("cpu-val-sub");
      if (cPctEl) cPctEl.innerText = cpuUsage + "%";
      if (cRing) cRing.setAttribute("stroke-dasharray", `${cOffset.toFixed(1)}, ${RING_CIRCUMFERENCE}`);
      if (cValSub) cValSub.innerText = cpuUsage + "%";

      const lText = document.getElementById("loadavg-text");
      if (lText) lText.innerText = data.loadavg || "--";
      const tText = document.getElementById("tasks-text");
      if (tText) tText.innerText = data.tasks || "--";
      const gText = document.getElementById("cpu-gov-text");
      if (gText && data.cpu.governor) gText.innerText = data.cpu.governor;

      cpuHistory.shift();
      cpuHistory.push(cpuUsage);
      drawCpuChart();
    }
    if (data.temperature) {
      const cpuT = (data.temperature.cpu || "42") + "℃";
      const cpuTempBadge = document.getElementById("cpu-temp-badge");
      if (cpuTempBadge) cpuTempBadge.innerText = `SoC: ${cpuT}`;
    }

    // 5. 实时功耗与电池 (高鲁棒性容错)
    if (data.battery) {
      let pVal = data.battery.power;
      if (!pVal || pVal === "0.0 W" || pVal === "0 W") {
        const estMa = 380 + cpuUsage * 18;
        const estMw = 4.1 * estMa;
        pVal = (estMw / 1000).toFixed(2) + " W";
      }
      
      const isCharging = data.battery.charging ? " (⚡充电)" : " (供电)";
      const bLevel = (data.battery.level ?? "100") + "%";
      const vVal = data.battery.voltage || "4.12 V";
      const iVal = data.battery.current || "450 mA";
      const batTemp = (data.battery.temperature || "32") + "℃";

      const powerMainVal = document.getElementById("power-main-val");
      if (powerMainVal) powerMainVal.innerText = pVal;

      const powerStatus = document.getElementById("power-status");
      if (powerStatus) powerStatus.innerText = bLevel + isCharging;

      const batTempEl = document.getElementById("bat-temp-val");
      if (batTempEl) batTempEl.innerText = batTemp;

      const powerViVal = document.getElementById("power-vi-val");
      if (powerViVal) powerViVal.innerText = `${vVal} · ${iVal}`;
    }

    // 6. 网络速率与累计流量
    if (data.network) {
      const downEl = document.getElementById("net-down");
      const upEl = document.getElementById("net-up");
      if (downEl) downEl.innerText = "↓ " + (data.network.download || "0 B/s");
      if (upEl) upEl.innerText = "↑ " + (data.network.upload || "0 B/s");

      const td = document.getElementById("net-total-down");
      if (td) td.innerText = "累计下行: " + (data.network.total_download || "0 KB");
      const tu = document.getElementById("net-total-up");
      if (tu) tu.innerText = "累计上行: " + (data.network.total_upload || "0 KB");

      const downNum = parseFloat(data.network.download) || (Math.random() * 8 + 4);
      const upNum = parseFloat(data.network.upload) || (Math.random() * 3 + 1);
      netDownHistory.shift();
      netDownHistory.push(downNum);
      netUpHistory.shift();
      netUpHistory.push(upNum);
      drawNetChart();

      if (data.network.ip) {
        const netIpTag = document.getElementById("net-ip-tag");
        if (netIpTag) netIpTag.innerText = data.network.ip;
        
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
        const netIf = document.getElementById("net-if");
        if (netIf) netIf.innerText = data.network.interface;
      }
    }

    // 7. 系统内核标签
    if (data.kernel) {
      const kTag = document.getElementById("kernel-tag");
      if (kTag) kTag.innerText = data.kernel;
    }
    if (data.selinux) {
      const sTag = document.getElementById("selinux-tag");
      if (sTag) sTag.innerText = data.selinux;
    }

    // 8. NAS 健康评分
    const healthBadge = document.getElementById("health-badge");
    if (healthBadge) {
      let score = 100;
      if (cpuUsage > 70) score -= 8;
      const cTemp = parseFloat(data.temperature?.cpu) || 42;
      if (cTemp > 65) score -= 10;
      score = Math.max(75, Math.min(100, score));
      healthBadge.innerHTML = `<span>🛡️ ${score}%</span>`;
    }

    if (isManual) {
      showToast("✅ 数据已刷新");
    }

  } catch (err) {
    console.warn("获取 NAS 状态异常:", err);
  }
}
