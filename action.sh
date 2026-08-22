#!/system/bin/sh
# Action script triggered by KernelSU / Magisk "执行 / Action" button

MODDIR="/data/adb/modules/pocket_nas"
[ -d "$MODDIR" ] || MODDIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

PORT=8080
if [ -f "$MODDIR/config/config.json" ]; then
    PORT_CONF=$(grep -o '"port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$PORT_CONF" ] && [ "$PORT_CONF" -gt 0 ] && PORT="$PORT_CONF"
fi

# 获取当前 Wi-Fi IP
IP=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 | head -n1)
if [ -z "$IP" ]; then
    IP=$(ip -4 addr show 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v '127.0.0.1' | cut -d' ' -f2 | head -n1)
fi
[ -z "$IP" ] && IP="127.0.0.1"

# 通过 Android Intent 直接在手机浏览器中打开 Web 控制台
am start -a android.intent.action.VIEW -d "http://${IP}:${PORT}" >/dev/null 2>&1 || \
am start -a android.intent.action.VIEW -d "http://127.0.0.1:${PORT}" >/dev/null 2>&1
