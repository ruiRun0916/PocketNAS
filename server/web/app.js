// =========================================================
// PocketNAS Pro v3.3.6 - Universal Responsive Server Dashboard
// 移动端 2x4 双行紧凑胶囊导航 · 首页设备连接快捷直达 · Tailscale 互联
// =========================================================

let currentIP = window.location.hostname || "127.0.0.1";
let alistUrl = "http://" + currentIP + ":5244";
let fsendUrl = "http://" + currentIP + ":2333";

const DEFAULT_NAV_ORDER = ["overview", "storage", "network", "services", "alist", "fsend", "speedtest", "tailscale"];
const NAV_NAMES = {
  overview: "全景看板",
  storage: "存储空间",
  network: "设备连接",
  services: "NAS 服务",
  alist: "文件管理",
  fsend: "文件上传",
  speedtest: "传输测速",
  tailscale: "Tailscale"
};

const SEG_CLASS_MAPPING = {
  "app": "seg-app",
  "image": "seg-img",
  "audio": "seg-aud",
  "video": "seg-vid",
  "apk": "seg-apk",
  "doc": "seg-doc",
  "archive": "seg-arch",
  "other": "seg-oth"
};

const OV_ID_MAPPING = {
  "app": "ov-cat-app",
  "image": "ov-cat-img",
  "audio": "ov-cat-aud",
  "video": "ov-cat-vid",
  "apk": "ov-cat-apk",
  "doc": "ov-cat-doc",
  "archive": "ov-cat-arch",
  "other": "ov-cat-oth"
};

let currentConfig = {
  port: 8080,
  ftp_port: 2121,
  refresh_seconds: 2,
  ui: {
    font_scale: "standard",
    motion: "light",
    navigation: {
      order: [...DEFAULT_NAV_ORDER],
      visible: {
        overview: true,
        storage: true,
        network: true,
        services: true,
        alist: true,
        fsend: true,
        speedtest: true,
        tailscale: true
      }
    },
    services: {
      order: ["alist", "webdav", "ftp", "smb", "fsend"],
      visible: {
        alist: true,
        webdav: true,
        ftp: true,
        smb: true,
        fsend: true
      }
    },
    embedding: {
      alist: true,
      fsend: true
    },
    tailscale: {
      ip: "",
      magic_dns: "",
      custom_links: [
        { id: "link_ts_webdav", name: "Tailscale 远程 WebDAV", url: "http://{ts_ip}:5244/dav", icon: "📺", desc: "异地远程挂载 4K 原画免解压播放" },
        { id: "link_ts_webui", name: "Tailscale 远程控制台", url: "http://{ts_ip}:8080", icon: "🌐", desc: "异地全功能遥测与运维控制" },
        { id: "link_ts_admin", name: "Tailscale 管理后台", url: "https://login.tailscale.com/admin/machines", icon: "🛡️", desc: "设备在线状态与子网路由管理" }
      ]
    }
  }
};

let editingUI = JSON.parse(JSON.stringify(currentConfig.ui));
let latestServices = [];
let latestStatus = null;
let isFetching = false;
let pollTimer = null;
let activeTab = "tab-overview";

const cpuHistory = [15, 18, 16, 22, 19, 28, 22, 18, 30, 24, 18, 22, 19, 16, 23, 19, 21, 24, 18, 17];
const netDownHistory = [2, 5, 8, 12, 10, 16, 22, 18, 24, 30, 22, 14, 16, 22, 28, 20, 12, 18, 22, 26];
const netUpHistory = [1, 2, 4, 3, 5, 4, 6, 5, 8, 7, 6, 4, 5, 6, 8, 4, 3, 5, 6, 7];

const GAUGE_CIRCUMFERENCE = 235.619;
let isSpeedtesting = false;
let speedtestAbortCtrl = null;

// ================= 初始化入口 =================
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initTabs();
  initCanvasBuffers();
  await loadBackendConfig();
  updateExternalLinks();
  renderTailscaleTab();
  startChainedPolling();
});

// ================= 1. 配置加载与应用 =================
async function loadBackendConfig() {
  try {
    const res = await fetch("/api/config?t=" + Date.now()).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      if (data && data.ui) {
        currentConfig = data;
        if (!currentConfig.ui.navigation || !currentConfig.ui.navigation.order) {
          currentConfig.ui.navigation = { order: [...DEFAULT_NAV_ORDER], visible: {} };
        }
        DEFAULT_NAV_ORDER.forEach(k => {
          if (!currentConfig.ui.navigation.order.includes(k)) currentConfig.ui.navigation.order.push(k);
          if (currentConfig.ui.navigation.visible[k] === undefined) currentConfig.ui.navigation.visible[k] = true;
        });
        if (!currentConfig.ui.services || !currentConfig.ui.services.order) {
          currentConfig.ui.services = { order: ["alist", "webdav", "ftp", "smb", "fsend"], visible: { alist: true, webdav: true, ftp: true, smb: true, fsend: true } };
        }
        if (!currentConfig.ui.embedding) {
          currentConfig.ui.embedding = { alist: true, fsend: true };
        }
        if (!currentConfig.ui.tailscale) {
          currentConfig.ui.tailscale = { ip: "", custom_links: [] };
        }
      }
    }
  } catch (e) {
    console.warn("加载后端配置失败，采用预设配置:", e);
  }
  applyUIConfig(currentConfig.ui);
}

function applyUIConfig(ui) {
  if (!ui) return;
  document.documentElement.setAttribute("data-font-scale", ui.font_scale || "standard");
  document.documentElement.setAttribute("data-motion", ui.motion || "light");
  renderNavigationRail(ui.navigation);
  applyEmbeddingMode(ui.embedding);
  renderTailscaleTab();

  if (latestServices && latestServices.length > 0) {
    renderServicesHub(latestServices);
    renderOverviewServices(latestServices);
  }
}

function renderNavigationRail(nav) {
  if (!nav || !nav.order) return;
  const navContainer = document.getElementById("main-hud-nav");
  if (!navContainer) return;

  nav.order.forEach(tabKey => {
    const btn = document.getElementById(`nav-item-${tabKey}`);
    if (btn) {
      navContainer.appendChild(btn);
      const isVis = nav.visible ? nav.visible[tabKey] !== false : true;
      btn.style.display = isVis ? "flex" : "none";
    }
  });

  const curActiveBtn = navContainer.querySelector(".hud-nav-btn.active");
  if (!curActiveBtn || curActiveBtn.style.display === "none") {
    const firstVisible = Array.from(navContainer.querySelectorAll(".hud-nav-btn")).find(b => b.style.display !== "none");
    if (firstVisible) {
      const tabId = firstVisible.getAttribute("data-tab");
      switchTab(tabId);
    }
  }
}

function applyEmbeddingMode(emb) {
  if (!emb) return;
  const alistWrapper = document.getElementById("alist-view-wrapper");
  if (alistWrapper) {
    if (emb.alist) {
      alistWrapper.innerHTML = `<iframe class="embedded-iframe" id="alist-frame" src="${alistUrl}"></iframe>`;
    } else {
      alistWrapper.innerHTML = `
        <div class="embedded-placeholder">
          <div style="font-size: 2.2em;">📂</div>
          <div style="font-size: 1.1em; font-weight:700; color:var(--text-pure);">已开启独立新标签打开模式</div>
          <p style="font-size: 0.88em; max-width:400px; color:var(--text-muted);">AListLite 现以轻量外部模式运行，可避免页面嵌套冲突并提供更佳的触控全屏体验。</p>
          <a class="btn-speed-run" style="text-decoration:none; padding:8px 24px; font-size:0.95em; background:var(--accent-cyan); color:#000;" href="${alistUrl}" target="_blank">↗ 在新窗口打开 AList</a>
        </div>`;
    }
  }

  const fsendWrapper = document.getElementById("fsend-view-wrapper");
  if (fsendWrapper) {
    if (emb.fsend) {
      fsendWrapper.innerHTML = `<iframe class="embedded-iframe" id="fsend-frame" src="${fsendUrl}"></iframe>`;
    } else {
      fsendWrapper.innerHTML = `
        <div class="embedded-placeholder">
          <div style="font-size: 2.2em;">⚡</div>
          <div style="font-size: 1.1em; font-weight:700; color:var(--text-pure);">已开启独立新标签打开模式</div>
          <p style="font-size: 0.88em; max-width:400px; color:var(--text-muted);">文件闪传现以独立网页模式运行，跨端拖拽互传相册与文件更顺畅。</p>
          <a class="btn-speed-run" style="text-decoration:none; padding:8px 24px; font-size:0.95em; background:var(--accent-crimson); color:#fff;" href="${fsendUrl}" target="_blank">↗ 在新窗口打开文件闪传</a>
        </div>`;
    }
  }
}

// ================= 2. Tailscale 模块专属逻辑 =================
function renderTailscaleTab() {
  const tsConfig = currentConfig.ui?.tailscale || { ip: "", custom_links: [] };
  const tsIpInput = document.getElementById("input-tailscale-ip");
  if (tsIpInput && !tsIpInput.value) {
    tsIpInput.value = tsConfig.ip || "";
  }
  renderTailscaleEndpoints(tsConfig.ip || "");
  renderCustomLinks(tsConfig.custom_links || []);
}

function renderTailscaleEndpoints(tsIp) {
  const container = document.getElementById("tailscale-endpoints-grid");
  if (!container) return;

  const displayIp = tsIp.trim() || "[请先填入Tailscale_IP]";
  const isSet = tsIp.trim().length > 0;

  const endpoints = [
    { title: "📺 远程 WebDAV 挂载", port: ":5244/dav", tag: "4K 影视挂载", url: `http://${displayIp}:5244/dav`, open: false },
    { title: "⚡ 远程原生 FTP 传输", port: ":2121", tag: "免密全盘", url: `ftp://${displayIp}:2121`, open: false },
    { title: "📁 远程 SMB / 网络邻居", port: ":445", tag: "加密共享", url: `\\\\${displayIp}\\PocketNAS`, open: false },
    { title: "🌐 远程 PocketNAS 控制台", port: ":8080", tag: "异地运维", url: `http://${displayIp}:8080`, open: true },
    { title: "📂 远程 AList 多网盘", port: ":5244", tag: "文件预览", url: `http://${displayIp}:5244`, open: true },
    { title: "⚡ 远程文件闪传", port: ":2333", tag: "极速传图", url: `http://${displayIp}:2333`, open: true }
  ];

  let html = "";
  endpoints.forEach(ep => {
    html += `
      <div class="ep-card">
        <div class="ep-head">
          <div class="ep-title-txt">${ep.title} <span class="status-tag green" style="font-size:0.7em;">${ep.tag}</span></div>
          <span style="font-family:var(--font-mono); font-size:0.8em; color:var(--text-dim);">${ep.port}</span>
        </div>
        <div class="ep-code-box">
          <code>${ep.url}</code>
          <div style="display:flex; gap:3px;">
            <button class="btn-copy-action" onclick="copyText('${ep.url}', '${ep.title}')">复制</button>
            ${ep.open && isSet ? `<a class="btn-open-action" href="${ep.url}" target="_blank">打开</a>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderCustomLinks(links) {
  const container = document.getElementById("custom-links-container");
  if (!container) return;

  const tsIp = (currentConfig.ui?.tailscale?.ip || "").trim() || currentIP;

  let html = "";
  links.forEach(item => {
    const realUrl = item.url.replace(/{ts_ip}/g, tsIp).replace(/{ip}/g, currentIP);
    html += `
      <div class="service-hud-card">
        <div class="sh-head-row">
          <div class="sh-title">
            <span style="font-size:1.15em;">${item.icon || '🌐'}</span>
            <span>${item.name}</span>
          </div>
          <div style="display:flex; gap:3px;">
            <button class="btn-hud" style="padding:1px 5px; font-size:0.72em;" onclick="openEditCustomLinkModal('${item.id}')">编辑</button>
            <button class="btn-hud" style="padding:1px 5px; font-size:0.72em; color:var(--accent-crimson);" onclick="deleteCustomLink('${item.id}')">删除</button>
          </div>
        </div>
        <p class="sh-desc">${item.desc || '快捷直达链接'}</p>
        <div class="ep-code-box" style="margin-top:2px;">
          <code>${realUrl}</code>
          <div style="display:flex; gap:3px;">
            <button class="btn-copy-action" onclick="copyText('${realUrl}', '${item.name}')">复制</button>
            <a class="btn-open-action" href="${realUrl}" target="_blank">↗ 打开</a>
          </div>
        </div>
      </div>
    `;
  });

  if (links.length === 0) {
    html = `<div style="grid-column: 1 / -1; padding:18px; text-align:center; color:var(--text-dim); font-size:0.9em;">暂无自定义链接，点击右上角「+ 添加自定义链接」可快速增加常用应用与穿透入口</div>`;
  }
  container.innerHTML = html;
}

async function saveTailscaleIP() {
  const input = document.getElementById("input-tailscale-ip");
  if (!input) return;
  const ipVal = input.value.trim();

  if (!currentConfig.ui.tailscale) currentConfig.ui.tailscale = { ip: "", custom_links: [] };
  currentConfig.ui.tailscale.ip = ipVal;

  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui: currentConfig.ui })
    });
    if (res.ok) {
      showToast("✅ Tailscale 固定 IP 已保存并同步！");
      renderTailscaleTab();
    } else {
      showToast("❌ 保存失败");
    }
  } catch (err) {
    showToast("❌ 网络连接异常");
  }
}

function openAddCustomLinkModal() {
  const m = document.getElementById("modal-custom-link");
  const form = document.getElementById("form-custom-link");
  if (form) form.reset();
  document.getElementById("cl-id").value = "";
  document.getElementById("cl-icon").value = "🌐";
  document.getElementById("cl-modal-title").innerText = "添加常用直达链接";
  if (m) m.classList.add("show");
}

function openEditCustomLinkModal(id) {
  const links = currentConfig.ui?.tailscale?.custom_links || [];
  const target = links.find(l => l.id === id);
  if (!target) return;

  document.getElementById("cl-id").value = target.id;
  document.getElementById("cl-name").value = target.name || "";
  document.getElementById("cl-icon").value = target.icon || "🌐";
  document.getElementById("cl-url").value = target.url || "";
  document.getElementById("cl-desc").value = target.desc || "";
  document.getElementById("cl-modal-title").innerText = "编辑直达链接";

  const m = document.getElementById("modal-custom-link");
  if (m) m.classList.add("show");
}

function closeCustomLinkModal() {
  const m = document.getElementById("modal-custom-link");
  if (m) m.classList.remove("show");
}

async function handleSaveCustomLink(e) {
  e.preventDefault();
  const id = document.getElementById("cl-id").value.trim();
  const name = document.getElementById("cl-name").value.trim();
  const icon = document.getElementById("cl-icon").value.trim() || "🌐";
  const url = document.getElementById("cl-url").value.trim();
  const desc = document.getElementById("cl-desc").value.trim();

  if (!currentConfig.ui.tailscale) currentConfig.ui.tailscale = { ip: "", custom_links: [] };
  if (!currentConfig.ui.tailscale.custom_links) currentConfig.ui.tailscale.custom_links = [];

  const links = currentConfig.ui.tailscale.custom_links;
  if (id) {
    const idx = links.findIndex(l => l.id === id);
    if (idx !== -1) {
      links[idx] = { id, name, icon, url, desc };
    }
  } else {
    links.push({
      id: `link_${Date.now()}`,
      name,
      icon,
      url,
      desc
    });
  }

  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui: currentConfig.ui })
    });
    if (res.ok) {
      showToast("✅ 自定义链接已保存并持久化！");
      closeCustomLinkModal();
      renderTailscaleTab();
    } else {
      showToast("❌ 保存失败");
    }
  } catch (err) {
    showToast("❌ 网络连接异常");
  }
}

async function deleteCustomLink(id) {
  if (!confirm("确定要删除此直达链接吗？")) return;
  if (!currentConfig.ui.tailscale || !currentConfig.ui.tailscale.custom_links) return;

  currentConfig.ui.tailscale.custom_links = currentConfig.ui.tailscale.custom_links.filter(l => l.id !== id);

  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui: currentConfig.ui })
    });
    if (res.ok) {
      showToast("✅ 链接已删除");
      renderTailscaleTab();
    } else {
      showToast("❌ 删除失败");
    }
  } catch (err) {
    showToast("❌ 网络异常");
  }
}

// ================= 3. 方案一设置弹窗 =================
function openSettingsModal() {
  editingUI = JSON.parse(JSON.stringify(currentConfig.ui || defaultUIConfig()));
  renderSettingsForm();
  const m = document.getElementById("modal-settings");
  if (m) m.classList.add("show");
}

function closeSettingsModal() {
  const m = document.getElementById("modal-settings");
  if (m) m.classList.remove("show");
}

function renderSettingsForm() {
  const scaleBtns = document.querySelectorAll("#group-font-scale .choice-chip");
  scaleBtns.forEach(b => {
    if (b.getAttribute("data-scale") === editingUI.font_scale) b.classList.add("active");
    else b.classList.remove("active");
  });

  const motionBtns = document.querySelectorAll("#group-motion .choice-chip");
  motionBtns.forEach(b => {
    if (b.getAttribute("data-motion") === editingUI.motion) b.classList.add("active");
    else b.classList.remove("active");
  });

  const chkAlist = document.getElementById("chk-embed-alist");
  if (chkAlist) chkAlist.checked = editingUI.embedding ? editingUI.embedding.alist !== false : true;
  const chkFsend = document.getElementById("chk-embed-fsend");
  if (chkFsend) chkFsend.checked = editingUI.embedding ? editingUI.embedding.fsend !== false : true;

  renderSettingsNavList();
  renderSettingsServicesList();
}

function selectFontScale(scale) {
  editingUI.font_scale = scale;
  document.documentElement.setAttribute("data-font-scale", scale);
  const scaleBtns = document.querySelectorAll("#group-font-scale .choice-chip");
  scaleBtns.forEach(b => {
    if (b.getAttribute("data-scale") === scale) b.classList.add("active");
    else b.classList.remove("active");
  });
}

function selectMotion(motion) {
  editingUI.motion = motion;
  document.documentElement.setAttribute("data-motion", motion);
  const motionBtns = document.querySelectorAll("#group-motion .choice-chip");
  motionBtns.forEach(b => {
    if (b.getAttribute("data-motion") === motion) b.classList.add("active");
    else b.classList.remove("active");
  });
}

function handleEmbeddingChange() {
  if (!editingUI.embedding) editingUI.embedding = { alist: true, fsend: true };
  editingUI.embedding.alist = document.getElementById("chk-embed-alist").checked;
  editingUI.embedding.fsend = document.getElementById("chk-embed-fsend").checked;
}

function renderSettingsNavList() {
  const container = document.getElementById("settings-nav-list");
  if (!container) return;
  const order = editingUI.navigation.order || DEFAULT_NAV_ORDER;
  const visible = editingUI.navigation.visible || {};

  let html = "";
  order.forEach((key, index) => {
    const isVis = visible[key] !== false;
    const name = NAV_NAMES[key] || key;
    html += `
      <div class="sortable-row">
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="chk-nav-vis-${key}" ${isVis ? 'checked' : ''} onchange="toggleNavVisibility('${key}')">
          <label for="chk-nav-vis-${key}" style="font-weight:600; color:var(--text-pure); cursor:pointer;">${name}</label>
        </div>
        <div style="display:flex; gap:3px;">
          <button class="btn-reorder-tiny" onclick="moveNavItemUp(${index})" ${index === 0 ? 'disabled' : ''}>▲ 上移</button>
          <button class="btn-reorder-tiny" onclick="moveNavItemDown(${index})" ${index === order.length - 1 ? 'disabled' : ''}>▼ 下移</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function toggleNavVisibility(key) {
  if (!editingUI.navigation.visible) editingUI.navigation.visible = {};
  const currentVal = editingUI.navigation.visible[key] !== false;
  const visCount = Object.values(editingUI.navigation.visible).filter(v => v).length;
  if (currentVal && visCount <= 1) {
    showToast("⚠️ 至少需要保留一个导航项目可见");
    renderSettingsNavList();
    return;
  }
  editingUI.navigation.visible[key] = !currentVal;
  renderSettingsNavList();
}

function moveNavItemUp(index) {
  if (index <= 0) return;
  const order = editingUI.navigation.order;
  const temp = order[index];
  order[index] = order[index - 1];
  order[index - 1] = temp;
  renderSettingsNavList();
}

function moveNavItemDown(index) {
  const order = editingUI.navigation.order;
  if (index >= order.length - 1) return;
  const temp = order[index];
  order[index] = order[index + 1];
  order[index + 1] = temp;
  renderSettingsNavList();
}

function resetNavSettings() {
  editingUI.navigation.order = [...DEFAULT_NAV_ORDER];
  editingUI.navigation.visible = { overview: true, storage: true, network: true, services: true, alist: true, fsend: true, speedtest: true, tailscale: true };
  renderSettingsNavList();
  showToast("导航栏配置已重置为默认");
}

function renderSettingsServicesList() {
  const container = document.getElementById("settings-services-list");
  if (!container) return;
  const order = editingUI.services.order || ["alist", "webdav", "ftp", "smb", "fsend"];
  const visible = editingUI.services.visible || {};

  let html = "";
  order.forEach((sid, index) => {
    const isVis = visible[sid] !== false;
    const matchService = latestServices.find(s => s.id === sid);
    const sName = matchService ? matchService.name : (sid.toUpperCase());

    html += `
      <div class="sortable-row">
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="chk-srv-vis-${sid}" ${isVis ? 'checked' : ''} onchange="toggleServiceVisibility('${sid}')">
          <label for="chk-srv-vis-${sid}" style="font-weight:600; color:var(--text-pure); cursor:pointer;">${sName}</label>
        </div>
        <div style="display:flex; gap:3px;">
          <button class="btn-reorder-tiny" onclick="moveServiceItemUp(${index})" ${index === 0 ? 'disabled' : ''}>▲ 上移</button>
          <button class="btn-reorder-tiny" onclick="moveServiceItemDown(${index})" ${index === order.length - 1 ? 'disabled' : ''}>▼ 下移</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function toggleServiceVisibility(sid) {
  if (!editingUI.services.visible) editingUI.services.visible = {};
  editingUI.services.visible[sid] = !(editingUI.services.visible[sid] !== false);
  renderSettingsServicesList();
}

function moveServiceItemUp(index) {
  if (index <= 0) return;
  const order = editingUI.services.order;
  const temp = order[index];
  order[index] = order[index - 1];
  order[index - 1] = temp;
  renderSettingsServicesList();
}

function moveServiceItemDown(index) {
  const order = editingUI.services.order;
  if (index >= order.length - 1) return;
  const temp = order[index];
  order[index] = order[index + 1];
  order[index + 1] = temp;
  renderSettingsServicesList();
}

function resetServiceSettings() {
  editingUI.services.order = ["alist", "webdav", "ftp", "smb", "fsend"];
  editingUI.services.visible = { alist: true, webdav: true, ftp: true, smb: true, fsend: true };
  renderSettingsServicesList();
  showToast("NAS 服务排序已重置为默认");
}

async function saveAllSettingsToBackend() {
  handleEmbeddingChange();
  currentConfig.ui = JSON.parse(JSON.stringify(editingUI));

  try {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ui: currentConfig.ui })
    });

    if (res.ok) {
      showToast("✅ 配置已保存到后端，全端设备同步生效！");
      applyUIConfig(currentConfig.ui);
      closeSettingsModal();
    } else {
      showToast("❌ 配置保存失败");
    }
  } catch (err) {
    showToast("❌ 网络连接异常");
  }
}

// ================= 4. 主题与导航 =================
function initTheme() {
  let savedTheme = localStorage.getItem("pocket_nas_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleThemeNext() {
  let cur = document.documentElement.getAttribute("data-theme") || "dark";
  let next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("pocket_nas_theme", next);
  updateThemeIcon(next);
  drawCpuChart();
  drawNetChart();
  showToast(`已切换至${next === 'dark' ? '深色工控' : '浅色工控'}主题`);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon-svg");
  if (!icon) return;
  if (theme === "light") {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  }
}

function initTabs() {
  const tabBtns = document.querySelectorAll(".hud-nav-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTabId = btn.getAttribute("data-tab");
      switchTab(targetTabId);
    });
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  const tabBtns = document.querySelectorAll(".hud-nav-btn");
  const tabViews = document.querySelectorAll(".tab-view");

  tabBtns.forEach(b => {
    if (b.getAttribute("data-tab") === tabId) b.classList.add("active");
    else b.classList.remove("active");
  });

  tabViews.forEach(v => {
    if (v.id === tabId) v.classList.add("active");
    else v.classList.remove("active");
  });

  if (tabId === "tab-alist" && currentConfig.ui?.embedding?.alist) {
    const frame = document.getElementById("alist-frame");
    if (frame && (!frame.src || frame.src === "about:blank")) frame.src = alistUrl;
  }
  if (tabId === "tab-fsend" && currentConfig.ui?.embedding?.fsend) {
    const frame = document.getElementById("fsend-frame");
    if (frame && (!frame.src || frame.src === "about:blank")) frame.src = fsendUrl;
  }
}

function reloadAListFrame() {
  const frame = document.getElementById("alist-frame");
  if (frame) frame.src = alistUrl;
  showToast("已刷新 AList 视图");
}

function reloadFSendFrame() {
  const frame = document.getElementById("fsend-frame");
  if (frame) frame.src = fsendUrl;
  showToast("已刷新文件闪传视图");
}

function openHelpModal() {
  const m = document.getElementById("modal-help");
  if (m) m.classList.add("show");
}

function closeHelpModal() {
  const m = document.getElementById("modal-help");
  if (m) m.classList.remove("show");
}

function openAddServiceModal() {
  const m = document.getElementById("modal-custom-service");
  const form = document.getElementById("form-custom-service");
  if (form) form.reset();
  document.getElementById("cs-id").value = "";
  document.getElementById("cs-modal-title").innerText = "添加自定义服务";
  if (m) m.classList.add("show");
}

function closeCustomServiceModal() {
  const m = document.getElementById("modal-custom-service");
  if (m) m.classList.remove("show");
}

function closeModalOnMask(e, modalId) {
  if (e.target && e.target.id === modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove("show");
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  const textEl = document.getElementById("toast-text");
  if (!toast || !textEl) return;
  textEl.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 2000);
}

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
    showToast(`复制失败，请手动选择复制`);
  }
}

async function triggerStorageRescan() {
  const btn = document.getElementById("btn-trigger-rescan");
  const tag = document.getElementById("storage-scan-status-tag");
  if (btn) btn.disabled = true;
  if (tag) {
    tag.className = "status-tag amber";
    tag.innerText = "○ 正在扫描中...";
  }
  showToast("已启动后台全盘存储分析...");
  try {
    const res = await fetch("/api/storage/rescan", { method: "POST" });
    if (res.ok) {
      setTimeout(fetchStatus, 1500);
    }
  } catch (e) {
    console.error("Rescan error:", e);
  } finally {
    setTimeout(() => { if (btn) btn.disabled = false; }, 3000);
  }
}

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
  const refreshSec = (currentConfig && currentConfig.refresh_seconds) ? currentConfig.refresh_seconds : 2;
  const interval = document.hidden ? 5000 : (refreshSec * 1000);
  pollTimer = setTimeout(pollStep, interval);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollStep();
});

function handleQuickRun() {
  pollStep();
  showToast("⚡ 遥测数据已即时同步");
}

function updateExternalLinks() {
  const btnAlistNet = document.getElementById("btn-open-alist-net");
  if (btnAlistNet) btnAlistNet.href = alistUrl;
  const btnAlist = document.getElementById("btn-open-alist");
  if (btnAlist) btnAlist.href = alistUrl;

  const btnFsendNet = document.getElementById("btn-open-fsend-net");
  if (btnFsendNet) btnFsendNet.href = fsendUrl;
  const btnFsend = document.getElementById("btn-open-fsend");
  if (btnFsend) btnFsend.href = fsendUrl;
}

// ================= 5. 数据拉取与渲染 =================
async function fetchStatus(isManual = false) {
  try {
    let res = await fetch("/api/status?t=" + Date.now()).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch("/status.json?t=" + Date.now()).catch(() => null);
    }
    if (!res || !res.ok) return;

    const data = await res.json();
    latestStatus = data;

    if (data.network && data.network.ip && data.network.ip !== "127.0.0.1") {
      currentIP = data.network.ip;
    } else if (window.location.hostname && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      currentIP = window.location.hostname;
    }
    alistUrl = `http://${currentIP}:5244`;
    fsendUrl = `http://${currentIP}:2333`;
    updateExternalLinks();

    const chipSoc = document.getElementById("chip-soc-val");
    if (chipSoc) {
      const soc = data.cpu?.model || "ARM64";
      chipSoc.innerText = soc.replace(/Snapdragon/g, "骁龙").replace(/Qualcomm/g, "").trim() || soc;
    }
    const chipOs = document.getElementById("chip-os-val");
    if (chipOs) {
      const osVer = (data.device?.android_version || data.system || "").replace(/Android/gi, "").trim() || "14";
      chipOs.innerText = `A${osVer}`;
    }
    const chipRoot = document.getElementById("chip-root-val");
    if (chipRoot) {
      chipRoot.innerText = "KSU";
    }

    if (data.time) {
      const timeEl = document.getElementById("last-update");
      if (timeEl) timeEl.innerText = `更新: ${data.time}`;
    }

    // 2. 存储空间与 8 类深度分类
    if (data.storage) {
      const sPct = data.storage.percent || "--";
      const pctBadge = document.getElementById("storage-pct-badge");
      if (pctBadge) pctBadge.innerText = `${sPct}% 已用`;
      const sUsed = document.getElementById("storage-used");
      if (sUsed) sUsed.innerText = data.storage.used || "--";
      const sTotal = document.getElementById("storage-total");
      if (sTotal) sTotal.innerText = data.storage.total ? `/ ${data.storage.total}` : "/ --";
      const sFree = document.getElementById("storage-free");
      if (sFree) sFree.innerText = data.storage.free || "--";
    }

    if (data.storage_categories) {
      const sc = data.storage_categories;
      const heroDesc = document.getElementById("storage-hero-desc");
      if (heroDesc) {
        const usedStr = sc.total_used_format || (data.storage ? data.storage.used : "--");
        const freeStr = sc.total_free_format || (data.storage ? data.storage.free : "--");
        const totalStr = sc.total_size_format || (data.storage ? data.storage.total : "--");
        const usedPct = sc.used_percent > 0 ? `${sc.used_percent.toFixed(1)}%` : (data.storage?.percent ? `${data.storage.percent}%` : "");
        heroDesc.innerText = `已使用 ${usedStr}${usedPct ? ' (' + usedPct + ')' : ''}，剩余可用 ${freeStr}，总容量 ${totalStr}`;
      }
      const scanTag = document.getElementById("storage-scan-status-tag");
      if (scanTag) {
        if (sc.is_scanning) {
          scanTag.className = "status-tag amber";
          scanTag.innerText = "○ 正在扫描中...";
        } else {
          scanTag.className = "status-tag green";
          scanTag.innerText = "● 数据已就绪";
        }
      }
      const scanTime = document.getElementById("storage-last-scan-time");
      if (scanTime) scanTime.innerText = `上次扫描: ${sc.last_scan_time || '尚未完成'}`;

      const ovBar = document.getElementById("overview-storage-bar");
      const stBar = document.getElementById("storage-multi-bar");
      const barTip = `已使用: ${sc.total_used_format || '--'} | 剩余可用: ${sc.total_free_format || '--'} (总容量 ${sc.total_size_format || '--'})`;
      if (ovBar) ovBar.title = barTip;
      if (stBar) stBar.title = barTip;

      if (sc.categories && sc.categories.length > 0) {
        sc.categories.forEach(item => {
          const ovId = OV_ID_MAPPING[item.id] || `ov-cat-${item.id}`;
          const ovEl = document.getElementById(ovId);
          if (ovEl) ovEl.innerText = item.size_format;

          const catSizeEl = document.getElementById(`cat-size-${item.id}`);
          if (catSizeEl) catSizeEl.innerText = item.size_format;

          const catPctEl = document.getElementById(`cat-pct-${item.id}`);
          if (catPctEl) {
            catPctEl.innerText = item.percent > 0 ? `(${item.percent.toFixed(1)}%)` : `(0.0%)`;
          }

          const segClass = SEG_CLASS_MAPPING[item.id] || `seg-${item.id}`;
          const allMatchingSegs = document.querySelectorAll(`.${segClass}`);
          allMatchingSegs.forEach(segEl => {
            const p = item.percent > 0 ? Math.max(0.6, item.percent).toFixed(1) + "%" : "0%";
            segEl.style.width = p;
            segEl.title = `${item.name}: ${item.size_format} (${item.percent.toFixed(1)}% 总容量)`;
          });
        });
      }
    }

    // 3. 运行内存
    if (data.memory) {
      const rPct = data.memory.percent || 0;
      const ramBadge = document.getElementById("ram-pct-badge");
      if (ramBadge) ramBadge.innerText = `${rPct}% 已用`;
      const ramUsed = document.getElementById("ram-used");
      if (ramUsed) ramUsed.innerText = data.memory.used || "--";
      const ramTotal = document.getElementById("ram-total");
      if (ramTotal) ramTotal.innerText = data.memory.total ? `/ ${data.memory.total}` : "/ --";
      const ramFree = document.getElementById("ram-free");
      if (ramFree) ramFree.innerText = data.memory.free || "--";
      const zramUsed = document.getElementById("zram-used");
      if (zramUsed) zramUsed.innerText = data.memory.zram || "--";
      const cacheUsed = document.getElementById("cache-used");
      if (cacheUsed) cacheUsed.innerText = data.memory.cached || "--";
      const cachedVal = document.getElementById("ram-cached-val");
      if (cachedVal) cachedVal.innerText = data.memory.cached || "--";
      const zramPct = document.getElementById("ram-zram-pct");
      if (zramPct) zramPct.innerText = data.memory.zramPercent ? `${data.memory.zramPercent}%` : "--";

      const segUsed = document.getElementById("seg-mem-used-bar");
      if (segUsed) segUsed.style.width = `${Math.min(70, Math.max(10, rPct))}%`;
      const segFree = document.getElementById("seg-mem-free-bar");
      if (segFree) segFree.style.width = `${Math.max(10, 100 - rPct)}%`;
    }

    // 4. CPU & SoC
    if (data.cpu) {
      const cpuUsage = data.cpu.usage || 0;
      const cpuVal = document.getElementById("cpu-val-sub");
      if (cpuVal) cpuVal.innerText = `${cpuUsage}%`;
      const cpuBar = document.getElementById("cpu-bar-fill");
      if (cpuBar) cpuBar.style.width = `${cpuUsage}%`;
      const chartPct = document.getElementById("cpu-chart-pct");
      if (chartPct) chartPct.innerText = `${cpuUsage}%`;

      const socBadge = document.getElementById("soc-full-name");
      if (socBadge) {
        const vendor = data.cpu.vendor && data.cpu.vendor !== "Generic" ? data.cpu.vendor + " " : "";
        socBadge.innerText = `${vendor}${data.cpu.model || 'ARM64'}`;
      }

      const clusterContainer = document.getElementById("cpu-clusters-container");
      if (clusterContainer && data.cpu.clusters && data.cpu.clusters.length > 0) {
        let cHtml = "";
        let archParts = [];
        data.cpu.clusters.forEach(c => {
          const sName = c.short_name || c.core_model || 'Core';
          const uVal = c.usage !== undefined && c.usage >= 0 ? `${c.usage}%` : "--%";
          cHtml += `
            <div class="cluster-row">
              <span class="c-name">${sName}</span>
              <span class="c-usage">${uVal}</span>
              <span class="c-cores">${c.cores} Core</span>
            </div>
          `;
          archParts.push(`${c.cores}×${sName}`);
        });
        clusterContainer.innerHTML = cHtml;
        const archSummary = document.getElementById("cpu-arch-summary");
        if (archSummary) archSummary.innerText = `架构: ${archParts.join(" + ")}`;
      }

      cpuHistory.shift();
      cpuHistory.push(cpuUsage);
      drawCpuChart();
    }

    if (data.temperature?.cpu) {
      const cpuTemp = document.getElementById("cpu-temp-badge");
      if (cpuTemp) cpuTemp.innerText = `${data.temperature.cpu}°C`;
    }
    if (data.loadavg) {
      const lText = document.getElementById("loadavg-text");
      if (lText) lText.innerText = data.loadavg;
      const lTextRam = document.getElementById("loadavg-text-ram");
      if (lTextRam) lTextRam.innerText = data.loadavg;
    }

    // 5. 电池与供电
    if (data.battery) {
      const b = data.battery;
      const batLevel = document.getElementById("bat-level-val");
      if (batLevel) batLevel.innerText = b.level ? `${b.level}%` : "--%";
      const powerMain = document.getElementById("power-main-val");
      if (powerMain) powerMain.innerText = b.power || "-- W";
      const batBar = document.getElementById("bat-bar-fill");
      if (batBar && b.level) batBar.style.width = `${parseInt(b.level) || 0}%`;

      const healthPct = document.getElementById("bat-health-pct");
      if (healthPct) healthPct.innerText = b.health_percent || "--";
      const healthWh = document.getElementById("bat-health-wh");
      if (healthWh) healthWh.innerText = b.health_energy_wh > 0 ? `${b.health_energy_wh.toFixed(1)} Wh` : "-- Wh";
      const healthMah = document.getElementById("bat-health-mah");
      if (healthMah) healthMah.innerText = b.health_capacity_mah > 0 ? `≈ ${b.health_capacity_mah} mAh` : "≈ -- mAh";

      const designWh = document.getElementById("bat-design-wh");
      if (designWh) designWh.innerText = b.design_energy_wh > 0 ? `${b.design_energy_wh.toFixed(1)} Wh` : "-- Wh";
      const designMah = document.getElementById("bat-design-mah");
      if (designMah) designMah.innerText = b.design_capacity_mah > 0 ? `≈ ${b.design_capacity_mah} mAh` : "≈ -- mAh";

      const cycleCount = document.getElementById("bat-cycle-count");
      if (cycleCount) cycleCount.innerText = b.cycle_count || "未知";

      const statusBadge = document.getElementById("bat-status-badge");
      const enduranceVal = document.getElementById("bat-endurance-val");
      if (b.charging) {
        if (statusBadge) {
          statusBadge.innerText = `⚡ ${b.charging_status_text || '充电中'}`;
          statusBadge.style.color = "var(--accent-emerald)";
          statusBadge.style.background = "var(--accent-emerald-sub)";
        }
        if (enduranceVal) enduranceVal.innerText = `⚡ ${b.charging_status_text || '充电中'} ${b.charging_power ? '(' + b.charging_power + ')' : ''}`;
      } else {
        if (statusBadge) {
          statusBadge.innerText = "电池供电";
          statusBadge.style.color = "var(--accent-crimson)";
          statusBadge.style.background = "var(--accent-crimson-sub)";
        }
        if (enduranceVal) enduranceVal.innerText = b.estimated_endurance ? `预计剩余: ${b.estimated_endurance}` : "电池放电中";
      }

      const batTemp = document.getElementById("bat-temp-val");
      if (batTemp) batTemp.innerText = b.temperature ? `${b.temperature}°C` : "--°C";
      const powerVi = document.getElementById("power-vi-val");
      if (powerVi) powerVi.innerText = `${b.voltage || '--'} · ${b.current || '--'}`;
    }

    // 6. 网络吞吐与端点地址
    if (data.network) {
      const n = data.network;
      const netDown = document.getElementById("net-down");
      if (netDown) netDown.innerText = `↓ ${n.download || '0 B/s'}`;
      const netUp = document.getElementById("net-up");
      if (netUp) netUp.innerText = `↑ ${n.upload || '0 B/s'}`;
      const netTotDown = document.getElementById("net-total-down");
      if (netTotDown) netTotDown.innerText = n.total_download || "--";
      const netTotUp = document.getElementById("net-total-up");
      if (netTotUp) netTotUp.innerText = n.total_upload || "--";
      const netIf = document.getElementById("net-if");
      if (netIf) netIf.innerText = n.interface || "wlan0";
      const netIpTag = document.getElementById("net-ip-tag");
      if (netIpTag) netIpTag.innerText = n.ip || "127.0.0.1";
      const netIpHead = document.getElementById("net-ip-head");
      if (netIpHead) netIpHead.innerText = n.ip || "127.0.0.1";

      let dRateMB = 0, uRateMB = 0;
      if (n.download) {
        const val = parseFloat(n.download) || 0;
        if (n.download.includes("GB")) dRateMB = val * 1024;
        else if (n.download.includes("MB")) dRateMB = val;
        else if (n.download.includes("KB")) dRateMB = val / 1024;
      }
      if (n.upload) {
        const val = parseFloat(n.upload) || 0;
        if (n.upload.includes("GB")) uRateMB = val * 1024;
        else if (n.upload.includes("MB")) uRateMB = val;
        else if (n.upload.includes("KB")) uRateMB = val / 1024;
      }
      netDownHistory.shift(); netDownHistory.push(dRateMB);
      netUpHistory.shift(); netUpHistory.push(uRateMB);
      drawNetChart();

      setCopyVal("webdav-url-copy-val", `http://${n.ip}:5244/dav`);
      setCopyVal("ftp-url-copy-val", `ftp://${n.ip}:2121`);
      setCopyVal("smb-url-copy-val", `\\\\${n.ip}\\PocketNAS`);
      setCopyVal("alist-url-copy-val", `http://${n.ip}:5244`);
      setCopyVal("fsend-url-copy-val", `http://${n.ip}:2333`);
      setCopyVal("webui-url-copy-val", `http://${n.ip}:8080`);
    }

    // 7. NAS 服务中心动态渲染
    if (data.services && data.services.length > 0) {
      latestServices = data.services;
      renderServicesHub(latestServices);
      renderOverviewServices(latestServices);
    }

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
      const cU = data.cpu?.usage || 0;
      if (cU > 70) score -= 8;
      const cT = parseFloat(data.temperature?.cpu) || 0;
      if (cT > 65) score -= 10;
      score = Math.max(75, Math.min(100, score));
      healthBadge.innerHTML = `<span>健康 ${score}%</span>`;
    }

  } catch (err) {
    console.warn("遥测数据拉取异常:", err);
  }
}

function setCopyVal(elId, val) {
  const el = document.getElementById(elId);
  if (el) el.innerText = val;
}

function renderServicesHub(services) {
  const container = document.getElementById("service-center-container");
  const summaryTag = document.getElementById("services-stat-summary");
  if (!container) return;

  const srvConfig = currentConfig.ui?.services || { order: [], visible: {} };
  const orderList = srvConfig.order || [];
  const visibleMap = srvConfig.visible || {};

  const sortedServices = [...services].sort((a, b) => {
    const idxA = orderList.indexOf(a.id);
    const idxB = orderList.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  const runningCount = services.filter(s => s.running).length;
  if (summaryTag) summaryTag.innerText = `运行中: ${runningCount} / ${services.length}`;

  let html = "";
  sortedServices.forEach(s => {
    const isVisible = visibleMap[s.id] !== false;
    if (!isVisible) return;

    const uUrl = s.web_url ? s.web_url.replace(/{ip}/g, currentIP) : "";
    const isRunning = s.running;
    const statusTagClass = isRunning ? "green" : "amber";

    html += `
      <div class="service-hud-card">
        <div class="sh-head-row">
          <div class="sh-title">
            <span>${s.name}</span>
            <span style="font-family:var(--font-mono); font-size:0.8em; color:var(--text-dim);">${s.port > 0 ? ':' + s.port : ''}</span>
          </div>
          <span class="status-tag ${statusTagClass}" style="font-size:0.72em; padding:1px 5px;">${s.status_text}</span>
        </div>
        <p class="sh-desc">${s.description || '无附加描述'}</p>
        <div class="sh-metrics-bar">
          <span>PID: <strong>${s.pid > 0 ? s.pid : '--'}</strong></span>
          <span>CPU: <strong>${s.cpu_percent > 0 ? s.cpu_percent.toFixed(1) + '%' : '0%'}</strong></span>
          <span>内存: <strong>${s.rss_mb > 0 ? s.rss_mb.toFixed(1) + 'M' : '--'}</strong></span>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:4px; margin-top:2px;">
          ${s.web && uUrl ? `<a class="btn-open-action" href="${uUrl}" target="_blank">↗ 打开</a>` : ''}
          <button class="btn-hud" style="padding:2px 7px; font-size:0.8em;" onclick="openServiceDetail('${s.id}')">详情</button>
          ${!s.builtin ? `<button class="btn-hud" style="padding:2px 7px; font-size:0.8em; color:var(--accent-crimson);" onclick="deleteCustomService('${s.id}')">删除</button>` : ''}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderOverviewServices(services) {
  const container = document.getElementById("overview-services-grid");
  if (!container) return;

  const srvConfig = currentConfig.ui?.services || { order: [], visible: {} };
  const orderList = srvConfig.order || [];
  const visibleMap = srvConfig.visible || {};

  const sortedServices = [...services].sort((a, b) => {
    const idxA = orderList.indexOf(a.id);
    const idxB = orderList.indexOf(b.id);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return 0;
  });

  const visibleServices = sortedServices.filter(s => visibleMap[s.id] !== false);

  let html = "";
  visibleServices.slice(0, 4).forEach(s => {
    const isRunning = s.running;
    const tagClass = isRunning ? "green" : "amber";
    html += `
      <div class="ep-card" style="padding:6px 8px; cursor:pointer;" onclick="switchTab('tab-services')">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--text-pure); font-size:0.9em;">${s.name}</strong>
          <span class="status-tag ${tagClass}" style="font-size:0.7em; padding:1px 4px;">${s.status_text}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.78em; color:var(--text-dim); font-family:var(--font-mono);">
          <span>端口: ${s.port > 0 ? ':' + s.port : '--'}</span>
          <span>CPU: ${s.cpu_percent > 0 ? s.cpu_percent.toFixed(1) + '%' : '0%'}</span>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ================= 6. 自定义服务 CRUD & 详情 =================
async function handleSaveCustomService(e) {
  e.preventDefault();
  const id = document.getElementById("cs-id").value.trim();
  const name = document.getElementById("cs-name").value.trim();
  const process = document.getElementById("cs-process").value.trim();
  const port = parseInt(document.getElementById("cs-port").value) || 0;
  const detect = document.getElementById("cs-detect").value;
  const web = document.getElementById("cs-web").checked;
  const webUrl = document.getElementById("cs-weburl").value.trim() || `http://{ip}:${port}`;
  const desc = document.getElementById("cs-desc").value.trim();

  const payload = {
    id: id || `custom_${Date.now()}`,
    name: name,
    process: process,
    port: port,
    detect: detect,
    web: web,
    web_url: webUrl,
    description: desc,
    enabled: true
  };

  try {
    const res = await fetch("/api/services", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast("✅ 自定义服务已保存");
      closeCustomServiceModal();
      if (!currentConfig.ui.services.order.includes(payload.id)) {
        currentConfig.ui.services.order.push(payload.id);
        currentConfig.ui.services.visible[payload.id] = true;
      }
      fetchStatus(true);
    } else {
      showToast("❌ 保存失败");
    }
  } catch (err) {
    showToast("❌ 请求异常");
  }
}

async function deleteCustomService(id) {
  if (!confirm("确定要删除此自定义服务吗？")) return;
  try {
    const res = await fetch(`/api/services?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      showToast("✅ 服务已删除");
      fetchStatus(true);
    } else {
      showToast("❌ 删除失败");
    }
  } catch (err) {
    showToast("❌ 网络异常");
  }
}

function openServiceDetail(id) {
  const service = latestServices.find(s => s.id === id);
  if (!service) return;

  const m = document.getElementById("modal-service-detail");
  const titleEl = document.getElementById("sd-title");
  const contentEl = document.getElementById("sd-content");

  if (titleEl) titleEl.innerText = `${service.name} 运行详情`;
  if (contentEl) {
    const uUrl = service.web_url ? service.web_url.replace(/{ip}/g, currentIP) : "";
    contentEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-line); padding-bottom:6px;">
        <strong style="color:var(--text-pure); font-size:1.1em;">${service.name}</strong>
        <span class="status-tag ${service.running ? 'green' : 'amber'}">${service.status_text}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px;">
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">目标进程</span><strong style="color:var(--text-pure); font-family:var(--font-mono);">${service.process || '--'}</strong></div>
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">进程 PID</span><strong style="color:var(--text-pure); font-family:var(--font-mono);">${service.pid > 0 ? service.pid : '--'}</strong></div>
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">监听端口</span><strong style="color:var(--text-pure); font-family:var(--font-mono);">${service.port > 0 ? ':' + service.port : '--'}</strong></div>
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">运行时间</span><strong style="color:var(--text-pure); font-family:var(--font-mono);">${service.uptime || '--'}</strong></div>
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">CPU 占用</span><strong style="color:var(--accent-amber); font-family:var(--font-mono);">${service.cpu_percent > 0 ? service.cpu_percent.toFixed(1) + '%' : '0.0%'}</strong></div>
        <div class="ep-card"><span style="font-size:0.75em; color:var(--text-dim);">物理内存(RSS)</span><strong style="color:var(--accent-cyan); font-family:var(--font-mono);">${service.rss_mb > 0 ? service.rss_mb.toFixed(1) + ' MB' : '--'}</strong></div>
      </div>
      ${uUrl ? `
        <div class="ep-code-box" style="margin-top:6px;">
          <code>${uUrl}</code>
          <div style="display:flex; gap:3px;">
            <button class="btn-copy-action" onclick="copyText('${uUrl}', '服务访问地址')">复制</button>
            <a class="btn-open-action" href="${uUrl}" target="_blank">打开</a>
          </div>
        </div>` : ''}
      <p style="font-size:0.82em; color:var(--text-muted); margin-top:6px; line-height:1.4;">${service.description || '无附加描述'}</p>
    `;
  }
  if (m) m.classList.add("show");
}

function closeServiceDetailModal() {
  const m = document.getElementById("modal-service-detail");
  if (m) m.classList.remove("show");
}

// ================= 7. 折线图绘制 =================
function initCanvasBuffers() {
  resizeAllCanvas();
  window.addEventListener("resize", resizeAllCanvas);
}

function resizeAllCanvas() {
  const dpr = window.devicePixelRatio || 1;
  ["cpu-chart", "net-chart"].forEach(id => {
    const c = document.getElementById(id);
    if (c && c.parentElement) {
      const rect = c.parentElement.getBoundingClientRect();
      c.width = (rect.width || 300) * dpr;
      c.height = (rect.height || 48) * dpr;
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
  const lineColor = isLight ? "#0284c7" : "#00f0ff";
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 240, 255, 0.35)");
  grad.addColorStop(1, "rgba(0, 240, 255, 0.0)");

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
  const downLineColor = isLight ? "#0284c7" : "#00f0ff";
  const upLineColor = isLight ? "#059669" : "#00e699";

  let maxDown = 40;
  netDownHistory.forEach(v => { if (v > maxDown) maxDown = v * 1.15; });
  const gradDown = ctx.createLinearGradient(0, 0, 0, h);
  gradDown.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(0, 240, 255, 0.30)");
  gradDown.addColorStop(1, "rgba(0, 240, 255, 0.0)");

  const downPts = netDownHistory.map((val, i) => {
    const y = h - (Math.min(maxDown, val) / maxDown) * (h * 0.82) - 3;
    return { x: i * step, y: y };
  });
  renderSmoothSpline(ctx, downPts, w, h, downLineColor, gradDown, 2.0 * (window.devicePixelRatio || 1));

  let maxUp = 30;
  netUpHistory.forEach(v => { if (v > maxUp) maxUp = v * 1.15; });
  const upPts = netUpHistory.map((val, i) => {
    const y = h - (Math.min(maxUp, val) / maxUp) * (h * 0.70) - 3;
    return { x: i * step, y: y };
  });
  renderSmoothSpline(ctx, upPts, w, h, upLineColor, "transparent", 1.5 * (window.devicePixelRatio || 1));
}

// ================= 8. 测速引擎 =================
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
      showToast("测速已停止");
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
    if (msg) msg.innerText = "正在探测与 NAS 节点间的网络延迟与抖动...";
    const rtts = [];
    for (let i = 0; i < 10; i++) {
      if (speedtestAbortCtrl.signal.aborted) break;
      const t0 = performance.now();
      await fetch(`/api/ping?t=${Date.now()}_${i}`, { signal: speedtestAbortCtrl.signal }).catch(() => null);
      const t1 = performance.now();
      rtts.push(t1 - t0);
      await new Promise(r => setTimeout(r, 40));
    }

    if (rtts.length > 0) {
      const avgPing = rtts.reduce((a, b) => a + b, 0) / rtts.length;
      let totalJitter = 0;
      for (let i = 1; i < rtts.length; i++) {
        totalJitter += Math.abs(rtts[i] - rtts[i - 1]);
      }
      const avgJitter = rtts.length > 1 ? totalJitter / (rtts.length - 1) : 0;
      if (pingEl) pingEl.innerText = avgPing.toFixed(1);
      if (jitterEl) jitterEl.innerText = avgJitter.toFixed(1);
    }

    const TEST_DURATION_MS = 6000;
    if (msg) msg.innerText = "正在测试「客户端 ➔ NAS」上行写入带宽 (持续 6 秒)...";
    const upStartTime = performance.now();
    let totalUpBytes = 0;
    let lastUpTime = performance.now();
    let lastUpBytes = 0;
    const uploadChunkSize = 2 * 1024 * 1024;
    const uploadChunk = new Uint8Array(uploadChunkSize);
    for (let i = 0; i < uploadChunk.length; i++) uploadChunk[i] = i % 256;

    while (!speedtestAbortCtrl.signal.aborted) {
      await fetch(`/api/speedtest/upload?t=${Date.now()}`, {
        method: "POST",
        body: uploadChunk,
        signal: speedtestAbortCtrl.signal
      }).catch(() => null);
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
      if (elapsed >= TEST_DURATION_MS) break;
    }

    const actualUpSec = (performance.now() - upStartTime) / 1000;
    const finalUpSpeed = totalUpBytes / 1000000 / (actualUpSec || 6.0);
    if (upEl) upEl.innerText = finalUpSpeed.toFixed(2);
    updateGauge("gauge-up-arc", finalUpSpeed);

    await new Promise(r => setTimeout(r, 400));

    if (!speedtestAbortCtrl.signal.aborted) {
      if (msg) msg.innerText = "正在测试「NAS ➔ 客户端」下行读取带宽 (持续 6 秒)...";
      const downStartTime = performance.now();
      let totalDownBytes = 0;
      let lastDownTime = performance.now();
      let lastDownBytes = 0;

      let streamRes = await fetch(`/api/speedtest/download?size=250&t=${Date.now()}`, {
        signal: speedtestAbortCtrl.signal
      }).catch(() => null);

      if (streamRes && streamRes.ok && streamRes.body) {
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
      }

      const actualDownSec = (performance.now() - downStartTime) / 1000;
      const finalDownSpeed = totalDownBytes / 1000000 / (actualDownSec || 6.0);
      if (downEl) downEl.innerText = finalDownSpeed.toFixed(2);
      updateGauge("gauge-down-arc", finalDownSpeed);

      if (msg) {
        msg.innerHTML = `✅ 测速完成 · 上传: ${finalUpSpeed.toFixed(2)} MB/s | 下载: ${finalDownSpeed.toFixed(2)} MB/s`;
      }
      showToast("⚡ 传输速度测试完成");
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
      btn.innerText = "开始测速";
      btn.style.background = "var(--accent-crimson)";
    }
  }
}
