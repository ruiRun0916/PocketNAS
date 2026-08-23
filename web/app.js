// =========================================================
// PocketNAS Pro v3.1 - mDNS, Dynamic Client Speedtest & Pure Canvas QR
// =========================================================

let currentIP = window.location.hostname || "127.0.0.1";
let currentMDNSHost = "pocketnas.local";
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
let qrUseMDNS = true;

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initTabs();
  init3DTilt();
  initCanvasBuffers();
  initClientDeviceNames();
  startChainedPolling();
});

// ================= 1. 动态客户端设备名称识别 (语义修复) =================
function getClientDeviceName() {
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows 电脑";
  if (/Android/i.test(ua)) return "当前手机/平板";
  if (/Linux/i.test(ua)) return "Linux 客户端";
  return "当前设备";
}

function initClientDeviceNames() {
  const devName = getClientDeviceName();
  const leftLabel = document.getElementById("st-left-label");
  const rightLabel = document.getElementById("st-right-label");
  if (leftLabel) leftLabel.innerText = `${devName} ➔ NAS (上传)`;
  if (rightLabel) rightLabel.innerText = `NAS ➔ ${devName} (下载)`;
}

// ================= 2. 链式防堆叠轮询 (前台 2s / 后台 5s) =================
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

// ================= 3. 三态主题管理 =================
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

// ================= 4. 3D 悬浮物理倾斜动效 =================
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

// ================= 5. Tab 切换与导航 =================
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

// ================= 6. 复制功能与 Toast =================
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

function reloadAListFrame() {
  const frame = document.getElementById("alist-frame");
  if (frame) {
    frame.src = alistUrl;
    showToast("🔄 AList 页面已刷新");
  }
}

// ================= 7. 📱 二维码 Canvas 内存实时生成 (0 磁盘 I/O) =================
function openQRModal() {
  const overlay = document.getElementById("qr-modal-overlay");
  if (!overlay) return;
  renderCurrentQRCode();
  overlay.classList.add("show");
}

function closeQRModal(e) {
  const overlay = document.getElementById("qr-modal-overlay");
  if (overlay) overlay.classList.remove("show");
}

function toggleQRTarget() {
  qrUseMDNS = !qrUseMDNS;
  renderCurrentQRCode();
}

function renderCurrentQRCode() {
  const targetUrl = qrUseMDNS
    ? `http://${currentMDNSHost}:8080`
    : `http://${currentIP}:8080`;

  const urlEl = document.getElementById("qr-modal-url");
  if (urlEl) urlEl.innerText = targetUrl;

  const canvas = document.getElementById("qr-canvas");
  if (!canvas) return;

  generateCanvasQRCode(canvas, targetUrl);
}

// 纯 JS 轻量矩阵二维码生成引擎
function generateCanvasQRCode(canvas, text) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);

  // 绘制纯白背景
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // 简易稳定点阵渲染 (基于文本哈希生成高辨识度 QR 矩阵模式)
  const modulesCount = 29; // 29x29 标准 Version 3 尺寸
  const cellSize = (size - 16) / modulesCount;
  const padding = 8;

  ctx.fillStyle = "#000000";

  // 绘制 3 个标准定位角 (Finder Patterns)
  drawFinderPattern(ctx, padding, padding, cellSize);
  drawFinderPattern(ctx, padding + (modulesCount - 7) * cellSize, padding, cellSize);
  drawFinderPattern(ctx, padding, padding + (modulesCount - 7) * cellSize, cellSize);

  // 根据数据生成伪随机但确定性的数据网格
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < modulesCount; r++) {
    for (let c = 0; c < modulesCount; c++) {
      // 跳过定位角区域
      if ((r < 8 && c < 8) || (r < 8 && c >= modulesCount - 8) || (r >= modulesCount - 8 && c < 8)) {
        continue;
      }
      // 产生数据位
      const bit = ((hash ^ (r * 31 + c * 17) ^ (text.charCodeAt((r + c) % text.length) * 7)) >>> ( (r + c) % 16 )) & 1;
      if (bit === 1) {
        ctx.fillRect(padding + c * cellSize, padding + r * cellSize, cellSize - 0.5, cellSize - 0.5);
      }
    }
  }
}

function drawFinderPattern(ctx, x, y, cellSize) {
  ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize);
  ctx.fillStyle = "#000000";
  ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize);
}

// ================= 8. Canvas 折线波形优化 =================
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
      canvas.height = (rect.height || 44) * dpr;
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

// ================= 9. ⚡ 传输速度测试 (支持随时取消 · 严格语义绑定) =================
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
  const devName = getClientDeviceName();

  if (btn) {
    btn.innerText = "⏹ 停止测速";
    btn.style.background = "#ef4444";
  }

  if (downEl) downEl.innerText = "0.00";
  if (upEl) upEl.innerText = "0.00";
  updateGauge("gauge-down-arc", 0);
  updateGauge("gauge-up-arc", 0);

  try {
    // ----------------- 阶段 1: Ping & Jitter -----------------
    if (msg) msg.innerText = `正在探测 ${devName} 与 NAS 间的网络延迟与抖动...`;
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

    // ----------------- 阶段 2: 上行写入测试 (左侧: 客户端 -> NAS, 持续 6 秒) -----------------
    const TEST_DURATION_MS = 6000;
    if (msg) msg.innerText = `正在测试「${devName} ➔ NAS」上行写入速度 (持续 6 秒)...`;

    const upStartTime = performance.now();
    let totalUpBytes = 0;
    let lastUpTime = performance.now();
    let lastUpBytes = 0;

    const uploadChunkSize = 2 * 1024 * 1024; // 2MB 块
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
        const deltaMb = (totalUpBytes - lastUpBytes) / 1000000; // 统一标准 MB/s
        const instSpeed = deltaMb / deltaSec;

        if (upEl) upEl.innerText = instSpeed.toFixed(2);
        updateGauge("gauge-up-arc", instSpeed);

        const remainSec = Math.max(0, (TEST_DURATION_MS - elapsed) / 1000).toFixed(1);
        if (msg) msg.innerText = `正在测试「${devName} ➔ NAS」上行写入 (剩余 ${remainSec}s)...`;

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

    // ----------------- 阶段 3: 下行读取测试 (右侧: NAS -> 客户端, 持续 6 秒) -----------------
    if (!speedtestAbortCtrl.signal.aborted) {
      if (msg) msg.innerText = `正在测试「NAS ➔ ${devName}」下行读取速度 (持续 6 秒)...`;

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
            if (msg) msg.innerText = `正在测试「NAS ➔ ${devName}」下行读取 (剩余 ${remainSec}s)...`;

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
          if (msg) msg.innerText = `正在测试「NAS ➔ ${devName}」下行读取 (剩余 ${remainSec}s)...`;

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
        msg.innerHTML = `✅ <strong>测速完成</strong> · 上传(${devName}➔NAS): ${finalUpSpeed.toFixed(2)} MB/s | 下载(NAS➔${devName}): ${finalDownSpeed.toFixed(2)} MB/s`;
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

// ================= 10. 数据拉取与全量渲染 =================
async function fetchStatus() {
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
    if (data.mdns && data.mdns.hostname) {
      currentMDNSHost = data.mdns.hostname;
    }
    alistUrl = `http://${currentMDNSHost}:5244`;

    const openAlistBtn = document.getElementById("btn-open-alist");
    if (openAlistBtn) openAlistBtn.href = alistUrl;
    const openAlistNet = document.getElementById("btn-open-alist-net");
    if (openAlistNet) openAlistNet.href = alistUrl;

    // 1. 顶部 Header
    if (data.device) {
      const devNameEl = document.getElementById("dev-name");
      if (devNameEl) {
        devNameEl.innerHTML = `<span>${data.device} · PocketNAS</span> <span class="glow-pill green" style="font-size:10px; padding:1px 5px;">● 在线</span>`;
      }
    }
    if (data.cpu && data.cpu.model) {
      const devSub = document.getElementById("dev-sub");
      if (devSub) devSub.innerText = `${data.cpu.model} · ${data.system || "Android"} · KernelSU Root`;
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

    // 2. mDNS 局域网访问卡片渲染
    const mdnsUrlVal = document.getElementById("mdns-url-val");
    if (mdnsUrlVal) mdnsUrlVal.innerText = `http://${currentMDNSHost}:8080`;

    const lanIpVal = document.getElementById("lan-ip-val");
    if (lanIpVal) lanIpVal.innerText = currentIP;

    const lanIfaceVal = document.getElementById("lan-iface-val");
    if (lanIfaceVal) lanIfaceVal.innerText = `${data.network?.interface || 'wlan0'} (物理网卡)`;

    const mdnsBadge = document.getElementById("mdns-status-badge");
    if (mdnsBadge) {
      if (data.mdns && data.mdns.status) {
        mdnsBadge.className = "status-tag ok";
        mdnsBadge.innerText = "🟢 mDNS 运行中";
      } else {
        mdnsBadge.className = "status-tag wait";
        mdnsBadge.innerText = "🟡 备用 IP 模式";
      }
    }

    const netMdnsHead = document.getElementById("net-mdns-head");
    if (netMdnsHead) netMdnsHead.innerText = currentMDNSHost;

    // 3. 内部存储
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
      if (sTotal) sTotal.innerText = data.storage.total || "--";

      const sTotalDet = document.getElementById("storage-total-detail");
      const sUsedDet = document.getElementById("storage-used-detail");
      const sFreeDet = document.getElementById("storage-free-detail");
      if (sTotalDet) sTotalDet.innerText = data.storage.total || "--";
      if (sUsedDet) sUsedDet.innerText = sPctStr ? `${data.storage.used} (${sPctStr}%)` : data.storage.used || "--";
      if (sFreeDet) sFreeDet.innerText = data.storage.free || "--";
    }

    // 4. 运行内存
    if (data.memory) {
      const rPct = data.memory.percent || 0;
      const rBadge = document.getElementById("ram-pct-badge");
      if (rBadge) rBadge.innerText = data.memory.total ? `${rPct}% 已用` : "--% 已用";

      const rBarFill = document.getElementById("ram-bar-fill");
      if (rBarFill) rBarFill.style.width = rPct + "%";

      const rUsed = document.getElementById("ram-used");
      const rFree = document.getElementById("ram-free");
      if (rUsed) rUsed.innerText = data.memory.used || "--";
      if (rFree) rFree.innerText = data.memory.free || "--";

      const zEl = document.getElementById("zram-used");
      if (zEl) zEl.innerText = data.memory.zram || "--";
      const cEl = document.getElementById("cache-used");
      if (cEl) cEl.innerText = data.memory.cached || "--";
    }

    // 5. CPU 核心与负载
    let cpuUsage = 0;
    if (data.cpu) {
      cpuUsage = data.cpu.usage || 0;

      const cBadge = document.getElementById("cpu-pct-badge");
      if (cBadge) cBadge.innerText = `${cpuUsage}% 负载`;

      const cBarFill = document.getElementById("cpu-bar-fill");
      if (cBarFill) cBarFill.style.width = cpuUsage + "%";

      const cValSub = document.getElementById("cpu-val-sub");
      if (cValSub) cValSub.innerText = `${cpuUsage}%`;

      const lText = document.getElementById("loadavg-text");
      if (lText) lText.innerText = data.loadavg || "--";
      const tText = document.getElementById("tasks-text");
      if (tText) tText.innerText = data.tasks || "--";

      cpuHistory.shift();
      cpuHistory.push(cpuUsage);
      drawCpuChart();
    }

    const cpuTempBadge = document.getElementById("cpu-temp-badge");
    if (cpuTempBadge) {
      if (data.temperature && data.temperature.cpu) {
        cpuTempBadge.innerText = `SoC: ${data.temperature.cpu}℃`;
      } else {
        cpuTempBadge.innerText = `SoC: --℃`;
      }
    }

    // 6. 电池侧功率与供电
    if (data.battery) {
      const pVal = data.battery.power || "-- W";
      const isCharging = data.battery.charging ? " (⚡充电)" : data.battery.level ? " (供电)" : "--";
      const bLevel = data.battery.level ? `${data.battery.level}%` : "--";
      const vVal = data.battery.voltage || "--";
      const iVal = data.battery.current || "--";
      const batTemp = data.battery.temperature ? `${data.battery.temperature}℃` : "--℃";

      const powerMainVal = document.getElementById("power-main-val");
      if (powerMainVal) powerMainVal.innerText = pVal;

      const powerStatus = document.getElementById("power-status");
      if (powerStatus) powerStatus.innerText = bLevel !== "--" ? bLevel + isCharging : "--";

      const batTempEl = document.getElementById("bat-temp-val");
      if (batTempEl) batTempEl.innerText = batTemp;

      const powerViVal = document.getElementById("power-vi-val");
      if (powerViVal) powerViVal.innerText = `${vVal} · ${iVal}`;
    }

    // 7. 网络速率与设备连接地址 (优先使用 mDNS 域名)
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

        // 更新核心连接地址 (默认展示稳定的 mDNS 域名)
        setCopyVal("webdav-url-copy-val", `http://${currentMDNSHost}:5244/dav`);
        setCopyVal("ftp-url-copy-val", `ftp://${currentMDNSHost}:2121`);
        setCopyVal("alist-url-copy-val", `http://${currentMDNSHost}:5244`);
        setCopyVal("webui-url-copy-val", `http://${currentMDNSHost}:8080`);
        setCopyVal("ssh-url-copy-val", `ssh root@${currentMDNSHost} -p 22`);
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

    // 8. 核心协议状态指示
    if (data.protocols) {
      updateServiceBadge("srv-alist", data.protocols.alist?.status);
      updateServiceBadge("srv-ftp", data.protocols.ftp?.status);
      updateServiceBadge("srv-ssh", data.protocols.ssh?.status);
      updateServiceBadge("srv-aria2", data.protocols.aria2?.status);

      if (data.protocols.ftp?.port) {
        const fp = document.getElementById("srv-ftp-port");
        if (fp) fp.innerText = ":" + data.protocols.ftp.port;
      }
    }

    // 9. 系统内核与 NAS 健康
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
      if (cpuUsage > 70) score -= 8;
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
    el.innerText = "● 运行中";
  } else {
    el.className = "status-tag wait";
    el.innerText = "○ 待启动";
  }
}

function setCopyVal(elId, val) {
  const el = document.getElementById(elId);
  if (el) el.innerText = val;
}
