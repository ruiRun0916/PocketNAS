// =========================================================
// PocketNAS Pro v3.2.0 - Universal Responsive Server Dashboard
// Battery Health & Wh Primary · Minimalist CPU · Adaptive Polling
// =========================================================

let currentIP = window.location.hostname || "127.0.0.1";
let alistUrl = "http://" + currentIP + ":5244";

const cpuHistory = [15, 18, 16, 22, 19, 28, 22, 18, 30, 24, 18, 22, 19, 16, 23, 19, 21, 24, 18, 17];
const netDownHistory = [2, 5, 8, 12, 10, 16, 22, 18, 24, 30, 22, 14, 16, 22, 28, 20, 12, 18, 22, 26];
const netUpHistory = [1, 2, 4, 3, 5, 4, 6, 5, 8, 7, 6, 4, 5, 6, 8, 4, 3, 5, 6, 7];

const GAUGE_CIRCUMFERENCE = 235.619; // pi * 75
let isSpeedtesting = false;
let speedtestAbortCtrl = null;
let currentThemeMode = localStorage.getItem("pocket_nas_theme") || "auto";

let pollTimer = null;
let isFetching = false;

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  init3DTilt();
  initCanvasBuffers();
  startChainedPolling();
});

// ================= 1. 链式防堆叠轮询 (前台 2s / 后台 5s) =================
function startChainedPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollStep();
}

async function pollStep() {
  if (!isFetching && !isSpeedtesting) {
    isFetching = true;
    await fetchStatus().catch(() => null);
    isFetching = false;
  }
  
  const interval = document.hidden ? 5000 : 2000;
  pollTimer = setTimeout(pollStep, interval);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    pollStep();
  }
});

// ================= 2. 三态主题管理 =================
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

// ================= 3. 3D 悬浮物理倾斜动效 =================
function init3DTilt() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const tiltElements = document.querySelectorAll(".glass-panel, .device-connect-card, .action-tile-btn, .speed-modal-card");
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

// ================= 4. Tab 切换与导航 =================
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

function reloadAListFrame() {
  const frame = document.getElementById("alist-frame");
  if (frame) frame.src = alistUrl;
  showToast("已刷新 AList 视图");
}

// ================= 5. 复制功能与 Toast =================
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
  pollStep();
  showToast("⚡ 数据已刷新");
}

// ================= 6. Canvas 折线波形缓冲 =================
function initCanvasBuffers() {
  resizeAllCanvas();
  window.addEventListener("resize", resizeAllCanvas);
}

function resizeAllCanvas() {
  const dpr = window.devicePixelRatio || 1;
  ["cpu-chart", "net-chart"].forEach((id) => {
    const canvas = document.getElementById(id);
    if (canvas && canvas.parentElement) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = (rect.width || 300) * dpr;
      canvas.height = (rect.height || 48) * dpr;
    }
  });
  drawCpuChart();
  drawNetChart();
}

function renderSmoothSpline(ctx, points, width, height, strokeColor, fillColor, lineWidth) {
  const n = points.length;
  if (n < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, height);
  ctx.lineTo(points[0].x, points[0].y);

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : p2;

    const tension = 0.36;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.lineTo(points[n - 1].x, height);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : p2;

    const tension = 0.36;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawCpuChart() {
  const canvas = document.getElementById("cpu-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const len = cpuHistory.length;
  const step = w / (len - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const lineColor = isLight ? "#0284c7" : "#00f2fe";
  const gradColor = isLight ? "rgba(2, 132, 199, 0.22)" : "rgba(0, 242, 254, 0.38)";

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, gradColor);
  grad.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  const pts = cpuHistory.map((val, i) => {
    const clamped = Math.min(100, Math.max(0, val));
    const y = h - (clamped / 100) * (h * 0.82) - 3;
    return { x: i * step, y: y };
  });

  renderSmoothSpline(ctx, pts, w, h, lineColor, grad, 2.0 * (window.devicePixelRatio || 1));
}

function drawNetChart() {
  const canvas = document.getElementById("net-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const len = netDownHistory.length;
  const step = w / (len - 1);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const downLineColor = isLight ? "#0284c7" : "#00f2fe";
  const upLineColor = isLight ? "#059669" : "#10b981";

  let maxDown = 40;
  netDownHistory.forEach((v) => {
    if (v > maxDown) maxDown = v * 1.15;
  });

  const gradDown = ctx.createLinearGradient(0, 0, 0, h);
  gradDown.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 242, 254, 0.32)");
  gradDown.addColorStop(1, "rgba(0, 242, 254, 0.0)");

  const downPts = netDownHistory.map((val, i) => {
    const y = h - (Math.min(maxDown, val) / maxDown) * (h * 0.82) - 3;
    return { x: i * step, y: y };
  });
  renderSmoothSpline(ctx, downPts, w, h, downLineColor, gradDown, 2.0 * (window.devicePixelRatio || 1));

  let maxUp = 30;
  netUpHistory.forEach((v) => {
    if (v > maxUp) maxUp = v * 1.15;
  });

  const upPts = netUpHistory.map((val, i) => {
    const y = h - (Math.min(maxUp, val) / maxUp) * (h * 0.70) - 3;
    return { x: i * step, y: y };
  });
  renderSmoothSpline(ctx, upPts, w, h, upLineColor, "transparent", 1.5 * (window.devicePixelRatio || 1));
}

// ================= 7. ⚡ 传输速度测试 =================
function updateGauge(gaugeId, speed) {
  const arc = document.getElementById(gaugeId);
  if (!arc) return;
  const ratio = Math.min(1.0, Math.max(0.0, speed / 80.0));
  const offset = GAUGE_CIRCUMFERENCE * (1.0 - ratio);
  arc.style.strokeDashoffset = offset.toFixed(2);
}

function toggleSpeedtest() {
  if (isSpeedtesting) {
    if (speedtestAbortCtrl) {
      speedtestAbortCtrl.abort();
      showToast("已停止测速");
    }
  } else {
    runSpeedtest();
  }
}

async function runSpeedtest() {
  if (isSpeedtesting) return;
  isSpeedtesting = true;
  speedtestAbortCtrl = new AbortController();

  const btn = document.getElementById("btn-start-speedtest");
  const msg = document.getElementById("st-status-msg");
  const pingEl = document.getElementById("st-ping-val");
  const jitterEl = document.getElementById("st-jitter-val");
  const downEl = document.getElementById("st-down-val");
  const upEl = document.getElementById("st-up-val");

  if (btn) {
    btn.innerText = "⏹ 停止测速";
    btn.style.background = "#ef4444";
  }

  if (downEl) downEl.innerText = "0.00";
  if (upEl) upEl.innerText = "0.00";
  updateGauge("gauge-down-arc", 0);
  updateGauge("gauge-up-arc", 0);

  try {
    // 阶段 1: Ping & Jitter
    if (msg) msg.innerText = `正在探测与 NAS 间的网络延迟与抖动...`;
    const rtts = [];
    for (let i = 0; i < 10; i++) {
      if (speedtestAbortCtrl.signal.aborted) break;
      const t0 = performance.now();
      await fetch(`/api/ping?t=${Date.now()}_${i}`, { signal: speedtestAbortCtrl.signal }).catch(() => null);
      const t1 = performance.now();
      rtts.push(t1 - t0);
      await new Promise((r) => setTimeout(r, 40));
    }

    if (rtts.length > 0) {
      const avgPing = rtts.reduce((a, b) => a + b, 0) / rtts.length;
      let totalJitter = 0;
      for (let i = 1; i < rtts.length; i++) {
        totalJitter += Math.abs(rtts[i] - rtts[i - 1]);
      }
      const avgJitter = rtts.length > 1 ? totalJitter / (rtts.length - 1) : 0;

      if (pingEl) pingEl.innerText = avgPing.toFixed(2);
      if (jitterEl) jitterEl.innerText = avgJitter.toFixed(2);
    }

    // 阶段 2: 上行写入测试 (客户端 -> NAS, 持续 6 秒)
    const TEST_DURATION_MS = 6000;
    if (msg) msg.innerText = `正在测试「客户端 ➔ NAS」上行写入速度 (持续 6 秒)...`;

    const upStartTime = performance.now();
    let totalUpBytes = 0;
    let lastUpTime = performance.now();
    let lastUpBytes = 0;

    const uploadChunkSize = 2 * 1024 * 1024;
    const uploadChunk = new Uint8Array(uploadChunkSize);
    for (let i = 0; i < uploadChunk.length; i++) uploadChunk[i] = i % 256;

    while (!speedtestAbortCtrl.signal.aborted) {
      const bStart = performance.now();
      await fetch(`/api/speedtest/upload?t=${Date.now()}`, {
        method: "POST",
        body: uploadChunk,
        signal: speedtestAbortCtrl.signal,
      }).catch(() => null);
      const bEnd = performance.now();

      totalUpBytes += uploadChunkSize;
      const now = performance.now();
      const elapsed = now - upStartTime;

      if (now - lastUpTime >= 100) {
        const deltaSec = (now - lastUpTime) / 1000;
        const deltaMb = (totalUpBytes - lastUpBytes) / 1000000;
        const instSpeed = deltaMb / deltaSec;

        if (upEl) upEl.innerText = instSpeed.toFixed(2);
        updateGauge("gauge-up-arc", instSpeed);

        const remainSec = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000).toFixed(1);
        if (msg) msg.innerText = `正在测试「客户端 ➔ NAS」上行写入 (剩余 ${remainSec}s)...`;

        lastUpTime = now;
        lastUpBytes = totalUpBytes;
      }

      if (elapsed >= TEST_DURATION_MS) {
        break;
      }
    }

    const actualUpSec = (performance.now() - upStartTime) / 1000;
    const finalUpSpeed = totalUpBytes / 1000000 / (actualUpSec || 6.0);
    if (upEl) upEl.innerText = finalUpSpeed.toFixed(2);
    updateGauge("gauge-up-arc", finalUpSpeed);

    await new Promise((r) => setTimeout(r, 400));

    // 阶段 3: 下行读取测试 (NAS -> 客户端, 持续 6 秒)
    if (!speedtestAbortCtrl.signal.aborted) {
      if (msg) msg.innerText = `正在测试「NAS ➔ 客户端」下行读取速度 (持续 6 秒)...`;

      const downStartTime = performance.now();
      let totalDownBytes = 0;
      let lastDownTime = performance.now();
      let lastDownBytes = 0;

      let isStreaming = true;
      let streamRes = await fetch(`/api/speedtest/download?size=200&t=${Date.now()}`, {
        signal: speedtestAbortCtrl.signal,
      }).catch(() => null);

      if (!streamRes || !streamRes.ok || !streamRes.body) {
        isStreaming = false;
      }

      if (isStreaming && streamRes.body) {
        const reader = streamRes.body.getReader();
        while (!speedtestAbortCtrl.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          totalDownBytes += value.length;

          const now = performance.now();
          const elapsed = now - downStartTime;

          if (now - lastDownTime >= 100) {
            const deltaSec = (now - lastDownTime) / 1000;
            const deltaMb = (totalDownBytes - lastDownBytes) / 1000000;
            const instSpeed = deltaMb / deltaSec;

            if (downEl) downEl.innerText = instSpeed.toFixed(2);
            updateGauge("gauge-down-arc", instSpeed);

            const remainSec = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000).toFixed(1);
            if (msg) msg.innerText = `正在测试「NAS ➔ 客户端」下行读取 (剩余 ${remainSec}s)...`;

            lastDownTime = now;
            lastDownBytes = totalDownBytes;
          }

          if (elapsed >= TEST_DURATION_MS) {
            reader.cancel().catch(() => null);
            break;
          }
        }
      } else {
        while (!speedtestAbortCtrl.signal.aborted) {
          const bStart = performance.now();
          const chunkRes = await fetch(`/speedtest_chunk.bin?t=${Date.now()}_${Math.random()}`, {
            signal: speedtestAbortCtrl.signal,
          });
          const blob = await chunkRes.blob();
          const bEnd = performance.now();

          totalDownBytes += blob.size;
          const now = performance.now();
          const elapsed = now - downStartTime;

          const deltaSec = (bEnd - bStart) / 1000;
          const instSpeed = deltaSec > 0 ? blob.size / 1000000 / deltaSec : 0;

          if (downEl) downEl.innerText = instSpeed.toFixed(2);
          updateGauge("gauge-down-arc", instSpeed);

          const remainSec = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000).toFixed(1);
          if (msg) msg.innerText = `正在测试「NAS ➔ 客户端」下行读取 (剩余 ${remainSec}s)...`;

          if (elapsed >= TEST_DURATION_MS) {
            break;
          }
        }
      }

      const actualDownSec = (performance.now() - downStartTime) / 1000;
      const finalDownSpeed = totalDownBytes / 1000000 / (actualDownSec || 6.0);
      if (downEl) downEl.innerText = finalDownSpeed.toFixed(2);
      updateGauge("gauge-down-arc", finalDownSpeed);

      if (msg) {
        msg.innerHTML = `✅ <strong>测速完成</strong> · 上传: ${finalUpSpeed.toFixed(2)} MB/s | 下载: ${finalDownSpeed.toFixed(2)} MB/s`;
      }
      showToast("🎉 传输速度测试完成");
    }
  } catch (err) {
    if (speedtestAbortCtrl && speedtestAbortCtrl.signal.aborted) {
      if (msg) msg.innerText = "测速已手动终止。";
    } else {
      console.error("Speedtest error:", err);
      if (msg) msg.innerText = "测速异常，请检查网络连接后重试。";
    }
  } finally {
    isSpeedtesting = false;
    speedtestAbortCtrl = null;
    if (btn) {
      btn.innerText = "开始";
      btn.style.background = "var(--accent-pink)";
    }
  }
}

// ================= 8. 数据拉取与全量动态渲染 =================
async function fetchStatus(isManual = false) {
  try {
    const reqUrl = "/api/status?t=" + Date.now();
    let res = await fetch(reqUrl).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/status.json?t=" + Date.now());
    }
    if (!res || !res.ok) throw new Error("API Offline");
    const data = await res.json();

    if (data.network && data.network.ip && data.network.ip !== "127.0.0.1") {
      currentIP = data.network.ip;
    }
    alistUrl = `http://${currentIP}:5244`;

    // 1. 顶部 Header 动态设备型号识别
    if (data.device) {
      const brandModel = data.device.market_name || data.device.model || "Android Device";
      const brandModelEl = document.getElementById("header-brand-model");
      if (brandModelEl) brandModelEl.innerText = brandModel;

      const devSub = document.getElementById("dev-sub");
      if (devSub) {
        const socTag = data.cpu?.model || "ARM64";
        devSub.innerText = `${brandModel} · ${socTag} · ${data.device.android_version || 'Android'} · KernelSU Root`;
      }
    }

    if (data.uptime) {
      const upEl = document.getElementById("uptime-badge");
      if (upEl) upEl.innerText = data.uptime;
    }
    if (data.time) {
      const timeEl = document.getElementById("last-update");
      if (timeEl) timeEl.innerText = `更新: ${data.time}`;
    }

    // 2. 存储空间 (数字优先: 344.9 GB / 463.0 GB)
    if (data.storage) {
      const sPctStr = data.storage.percent;
      let sPct = parseFloat(sPctStr);
      if (isNaN(sPct) || sPct < 0) sPct = 0;

      const sBadge = document.getElementById("storage-pct-badge");
      if (sBadge) sBadge.innerText = sPctStr ? `${sPctStr}% 已用` : "--% 已用";

      const sBarFill = document.getElementById("storage-bar-fill");
      if (sBarFill) sBarFill.style.width = sPct + "%";

      const sUsed = document.getElementById("storage-used");
      const sFree = document.getElementById("storage-free");
      const sTotal = document.getElementById("storage-total");
      if (sUsed) sUsed.innerText = data.storage.used || "--";
      if (sFree) sFree.innerText = data.storage.free || "--";
      if (sTotal) sTotal.innerText = data.storage.total ? `/ ${data.storage.total}` : "/ --";

      const sTotalDet = document.getElementById("storage-total-detail");
      const sUsedDet = document.getElementById("storage-used-detail");
      const sFreeDet = document.getElementById("storage-free-detail");
      if (sTotalDet) sTotalDet.innerText = data.storage.total || "--";
      if (sUsedDet) sUsedDet.innerText = sPctStr ? `${data.storage.used} (${sPctStr}%)` : data.storage.used || "--";
      if (sFreeDet) sFreeDet.innerText = data.storage.free || "--";
    }

    // 3. 运行内存 (数字优先)
    if (data.memory) {
      const rPct = data.memory.percent || 0;
      const rBadge = document.getElementById("ram-pct-badge");
      if (rBadge) rBadge.innerText = data.memory.total ? `${rPct}% 已用` : "--% 已用";

      const rBarFill = document.getElementById("ram-bar-fill");
      if (rBarFill) rBarFill.style.width = rPct + "%";

      const rUsed = document.getElementById("ram-used");
      const rFree = document.getElementById("ram-free");
      const rTotal = document.getElementById("ram-total");
      if (rUsed) rUsed.innerText = data.memory.used || "--";
      if (rFree) rFree.innerText = data.memory.free || "--";
      if (rTotal) rTotal.innerText = data.memory.total ? `/ ${data.memory.total}` : "/ --";

      const zEl = document.getElementById("zram-used");
      if (zEl) zEl.innerText = data.memory.zram || "--";
      const cEl = document.getElementById("cache-used");
      if (cEl) cEl.innerText = data.memory.cached || "--";
    }

    // 4. ⚡ 动态 CPU / SoC 架构卡片 (极简实用：动态核心组平均负载、系统负载与SoC温度)
    if (data.cpu) {
      const cpuUsage = data.cpu.usage || 0;

      const cValSub = document.getElementById("cpu-val-sub");
      if (cValSub) cValSub.innerText = `${cpuUsage}%`;

      const cBarFill = document.getElementById("cpu-bar-fill");
      if (cBarFill) cBarFill.style.width = cpuUsage + "%";

      const chartPct = document.getElementById("cpu-chart-pct");
      if (chartPct) chartPct.innerText = `${cpuUsage}%`;

      // 动态显示 SoC 真实名称 (绝不硬编码)
      const socFullName = document.getElementById("soc-full-name");
      if (socFullName) {
        const vendor = data.cpu.vendor && data.cpu.vendor !== "Generic" ? data.cpu.vendor + " " : "";
        socFullName.innerText = `${vendor}${data.cpu.model || 'ARM64 Processor'}`;
      }

      // 动态生成核心组平均利用率矩阵 (例如 A55 24% 4 Core)
      const clusterBox = document.getElementById("cpu-clusters-container");
      if (clusterBox) {
        if (data.cpu.clusters && data.cpu.clusters.length > 0) {
          let clustHtml = "";
          let archParts = [];

          data.cpu.clusters.forEach((c) => {
            const shortName = c.short_name || c.core_model || 'Core';
            const uVal = c.usage !== undefined && c.usage >= 0 ? `${c.usage}%` : "--%";
            clustHtml += `
              <div class="cluster-row-item">
                <span class="c-name">${shortName}</span>
                <span class="c-usage">${uVal}</span>
                <span class="c-cores">${c.cores} Core</span>
              </div>
            `;
            archParts.push(`${c.cores}×${shortName}`);
          });
          clusterBox.innerHTML = clustHtml;

          const archSummary = document.getElementById("cpu-arch-summary");
          if (archSummary) {
            archSummary.innerText = `架构: ${archParts.join(" + ")}`;
          }
        } else {
          clusterBox.innerHTML = `
            <div class="cluster-row-item">
              <span class="c-name">核心状态</span>
              <span class="c-usage">核心架构信息暂不可用</span>
              <span class="c-cores">--</span>
            </div>
          `;
        }
      }

      const lText = document.getElementById("loadavg-text");
      if (lText) lText.innerText = data.loadavg || "--";

      cpuHistory.shift();
      cpuHistory.push(cpuUsage);
      drawCpuChart();
    }

    const cpuTempBadge = document.getElementById("cpu-temp-badge");
    if (cpuTempBadge) {
      if (data.temperature && data.temperature.cpu) {
        cpuTempBadge.innerText = `${data.temperature.cpu}°C`;
      } else {
        cpuTempBadge.innerText = `--°C`;
      }
    }

    // 5. 🔋 电池与真实健康卡片 (Wh为主，mAh为辅，健康度/健康容量/循环次数/平滑续航)
    if (data.battery) {
      const pVal = data.battery.power || "-- W";
      const powerMainVal = document.getElementById("power-main-val");
      if (powerMainVal) powerMainVal.innerText = pVal;

      const batLevelVal = document.getElementById("bat-level-val");
      if (batLevelVal) batLevelVal.innerText = data.battery.level ? `${data.battery.level}%` : "--%";

      const batBarFill = document.getElementById("bat-bar-fill");
      if (batBarFill && data.battery.level) {
        const pct = parseInt(data.battery.level) || 0;
        batBarFill.style.width = pct + "%";
      }

      // 电池健康度
      const batHealthPct = document.getElementById("bat-health-pct");
      if (batHealthPct) batHealthPct.innerText = data.battery.health_percent || "--";

      // 健康容量 (Wh 与 mAh)
      const batHealthWh = document.getElementById("bat-health-wh");
      const batHealthMah = document.getElementById("bat-health-mah");
      if (batHealthWh) {
        if (data.battery.health_energy_wh > 0) {
          batHealthWh.innerText = `${data.battery.health_energy_wh.toFixed(1)} Wh`;
        } else {
          batHealthWh.innerText = `-- Wh`;
        }
      }
      if (batHealthMah) {
        if (data.battery.health_capacity_mah > 0) {
          batHealthMah.innerText = `≈ ${data.battery.health_capacity_mah} mAh`;
        } else {
          batHealthMah.innerText = `≈ -- mAh`;
        }
      }

      // 设计容量 (Wh 与 mAh)
      const batDesignWh = document.getElementById("bat-design-wh");
      const batDesignMah = document.getElementById("bat-design-mah");
      if (batDesignWh) {
        if (data.battery.design_energy_wh > 0) {
          batDesignWh.innerText = `${data.battery.design_energy_wh.toFixed(1)} Wh`;
        } else {
          batDesignWh.innerText = `-- Wh`;
        }
      }
      if (batDesignMah) {
        if (data.battery.design_capacity_mah > 0) {
          batDesignMah.innerText = `≈ ${data.battery.design_capacity_mah} mAh`;
        } else {
          batDesignMah.innerText = `≈ -- mAh`;
        }
      }

      // 循环次数
      const batCycleCount = document.getElementById("bat-cycle-count");
      if (batCycleCount) batCycleCount.innerText = data.battery.cycle_count || "未知";

      // 电压 · 电流
      const powerViVal = document.getElementById("power-vi-val");
      if (powerViVal) powerViVal.innerText = `${data.battery.voltage || '--'} · ${data.battery.current || '--'}`;

      // 电池温度
      const batTempEl = document.getElementById("bat-temp-val");
      if (batTempEl) batTempEl.innerText = data.battery.temperature ? `${data.battery.temperature}°C` : "--°C";

      // 供电状态与续航指示
      const statusBadge = document.getElementById("bat-status-badge");
      const batEnduranceVal = document.getElementById("bat-endurance-val");

      if (data.battery.charging) {
        if (statusBadge) statusBadge.innerText = data.battery.charging_status_text ? `⚡ ${data.battery.charging_status_text}` : "⚡ 充电中";
        if (batEnduranceVal) {
          const chgP = data.battery.charging_power ? ` (功率: ${data.battery.charging_power})` : "";
          batEnduranceVal.innerHTML = `<span style="color:var(--accent-orange);">⚡ ${data.battery.charging_status_text || '充电中'}${chgP}</span>`;
        }
      } else {
        if (statusBadge) statusBadge.innerText = "电池供电";
        if (batEnduranceVal) {
          if (data.battery.estimated_endurance) {
            batEnduranceVal.innerText = `预计剩余: ${data.battery.estimated_endurance}`;
          } else {
            batEnduranceVal.innerText = "电池放电中";
          }
        }
      }
    }

    // 6. 网络速率与设备连接地址
    if (data.network) {
      const downEl = document.getElementById("net-down");
      const upEl = document.getElementById("net-up");
      if (downEl) downEl.innerText = "↓ " + (data.network.download || "0 B/s");
      if (upEl) upEl.innerText = "↑ " + (data.network.upload || "0 B/s");

      const td = document.getElementById("net-total-down");
      if (td) td.innerText = "累计下行: " + (data.network.total_download || "0 KB");
      const tu = document.getElementById("net-total-up");
      if (tu) tu.innerText = "累计上行: " + (data.network.total_upload || "0 KB");

      let downRateMB = 0;
      let upRateMB = 0;
      if (data.network.download) {
        const num = parseFloat(data.network.download) || 0;
        if (data.network.download.includes("GB")) downRateMB = num * 1024;
        else if (data.network.download.includes("MB")) downRateMB = num;
        else if (data.network.download.includes("KB")) downRateMB = num / 1024;
      }
      if (data.network.upload) {
        const num = parseFloat(data.network.upload) || 0;
        if (data.network.upload.includes("GB")) upRateMB = num * 1024;
        else if (data.network.upload.includes("MB")) upRateMB = num;
        else if (data.network.upload.includes("KB")) upRateMB = num / 1024;
      }

      netDownHistory.shift();
      netDownHistory.push(downRateMB);
      netUpHistory.shift();
      netUpHistory.push(upRateMB);
      drawNetChart();

      if (data.network.ip) {
        const netIpTag = document.getElementById("net-ip-tag");
        if (netIpTag) netIpTag.innerText = data.network.ip;
        const netIpHead = document.getElementById("net-ip-head");
        if (netIpHead) netIpHead.innerText = data.network.ip;

        setCopyVal("webdav-url-copy-val", `http://${data.network.ip}:5244/dav`);
        setCopyVal("ftp-url-copy-val", `ftp://${data.network.ip}:2121`);
        setCopyVal("alist-url-copy-val", `http://${data.network.ip}:5244`);
        setCopyVal("webui-url-copy-val", `http://${data.network.ip}:8080`);
        setCopyVal("ssh-url-copy-val", `ssh root@${data.network.ip} -p 22`);
      }

      if (data.network.interface) {
        const netIf = document.getElementById("net-if");
        if (netIf) netIf.innerText = data.network.interface;
      }

      const gwEl = document.getElementById("net-gw-val");
      if (gwEl) gwEl.innerText = data.network.gateway || "--";
      const macEl = document.getElementById("net-mac-val");
      if (macEl) macEl.innerText = data.network.mac || "--";
      const mtuEl = document.getElementById("net-mtu-val");
      if (mtuEl) mtuEl.innerText = `${data.network.mtu || 1500} Bytes`;
    }

    // 7. 核心协议状态指示
    if (data.protocols) {
      updateServiceBadge("srv-alist", data.protocols.alist?.status);
      updateServiceBadge("srv-ftp", data.protocols.ftp?.status);
      updateServiceBadge("srv-webdav", data.protocols.webdav?.status);
      updateServiceBadge("srv-ssh", data.protocols.ssh?.status);

      if (data.protocols.ftp?.port) {
        const fp = document.getElementById("srv-ftp-port");
        if (fp) fp.innerText = ":" + data.protocols.ftp.port;
      }
    }

    // 8. 系统内核与 NAS 健康
    if (data.kernel) {
      const kTag = document.getElementById("kernel-tag");
      if (kTag) kTag.innerText = data.kernel;
    }
    if (data.selinux) {
      const sTag = document.getElementById("selinux-tag");
      if (sTag) sTag.innerText = data.selinux;
    }

    const healthBadge = document.getElementById("health-badge");
    if (healthBadge) {
      let score = 100;
      const curCpu = data.cpu?.usage || 0;
      if (curCpu > 70) score -= 8;
      const cTemp = parseFloat(data.temperature?.cpu) || 0;
      if (cTemp > 65) score -= 10;
      score = Math.max(75, Math.min(100, score));
      healthBadge.innerHTML = `<span>🛡️ ${score}%</span>`;
    }
  } catch (err) {
    console.warn("获取 NAS 状态异常:", err);
  }
}

function updateServiceBadge(elId, isActive) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (isActive) {
    el.className = "status-tag ok";
    el.innerText = "● 运行";
  } else {
    el.className = "status-tag wait";
    el.innerText = "○ 未运行";
  }
}

function setCopyVal(elId, val) {
  const el = document.getElementById(elId);
  if (el) el.innerText = val;
}
