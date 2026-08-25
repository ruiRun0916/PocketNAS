#!/system/bin/sh
# Action script triggered by KernelSU / Magisk "执行 / Action" button

MODDIR="/data/adb/modules/pocket_nas"
[ -d "$MODDIR" ] || MODDIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

PORT=8080
ALIST_PORT=5244

if [ -f "$MODDIR/config/config.json" ]; then
    PORT_CONF=$(grep -o '"port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$PORT_CONF" ] && [ "$PORT_CONF" -gt 0 ] && PORT="$PORT_CONF"

    ALIST_CONF=$(grep -o '"alist_port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$ALIST_CONF" ] && [ "$ALIST_CONF" -gt 0 ] && ALIST_PORT="$ALIST_CONF"
fi

# 获取当前 Wi-Fi IP (优先 wlan0)
IP=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 | head -n1)
if [ -z "$IP" ]; then
    IP=$(ip -4 addr show 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v '127.0.0.1' | cut -d' ' -f2 | head -n1)
fi
[ -z "$IP" ] && IP="127.0.0.1"

WEBDAV_URL="http://${IP}:${ALIST_PORT}/dav"

# 1. 复制 WebDAV 链接至 Android 系统剪贴板
cmd clipboard set text "$WEBDAV_URL" >/dev/null 2>&1 || \
service call clipboard 2 i32 1 i32 0 s16 "$WEBDAV_URL" >/dev/null 2>&1 || \
am broadcast -a clipper.set -e text "$WEBDAV_URL" >/dev/null 2>&1

# 2. 弹出系统通知/Toast 提示用户已复制 WebDAV 链接
cmd notification post -S bigtext -t "PocketNAS Pro" "Tag" "已复制 WebDAV 挂载链接: ${WEBDAV_URL}" >/dev/null 2>&1

# 3. 通过 Android Intent 直接在手机浏览器中打开 Web 控制台
am start -a android.intent.action.VIEW -d "http://${IP}:${PORT}" >/dev/null 2>&1 || \
am start -a android.intent.action.VIEW -d "http://127.0.0.1:${PORT}" >/dev/null 2>&1
