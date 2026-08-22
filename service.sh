#!/system/bin/sh
# PocketNAS - Service Auto-start Script
# Runs at boot via Magisk / KernelSU late_start service

MODDIR="/data/adb/modules/pocket_nas"
[ -d "$MODDIR" ] || MODDIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

# 1. 等待系统开机广播完成
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 3
done

# 等待网络与存储就绪
sleep 2

# 2. 查找 Busybox 可执行路径 (适配 Magisk、KernelSU、KernelSU Next、SukiSU Ultra、APatch 等)
BB=""
for p in \
    /data/adb/magisk/busybox \
    /data/adb/ksu/bin/busybox \
    /data/adb/ap/bin/busybox \
    /data/adb/sukisu/bin/busybox \
    /data/adb/ksunext/bin/busybox \
    /system/bin/busybox \
    /system/xbin/busybox; do
    if [ -f "$p" ] && [ -x "$p" ]; then
        BB="$p"
        break
    fi
done
if [ -z "$BB" ] && which busybox >/dev/null 2>&1; then
    BB="busybox"
fi

# 3. 准备运行与输出目录
mkdir -p /data/local/tmp/nas
mkdir -p "$MODDIR/web/api"
chmod 777 /data/local/tmp/nas 2>/dev/null
chmod -R 755 "$MODDIR/scripts" 2>/dev/null
chmod -R 755 "$MODDIR/server" 2>/dev/null

# 读取端口配置
PORT=8080
if [ -f "$MODDIR/config/config.json" ]; then
    PORT_CONF=$(grep -o '"port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$PORT_CONF" ] && [ "$PORT_CONF" -gt 0 ] && PORT="$PORT_CONF"
fi

# 4. 启动数据采集脚本
pkill -f "monitor.sh" 2>/dev/null
nohup sh "$MODDIR/scripts/monitor.sh" >/dev/null 2>&1 &

# 5. 启动 Web 服务
pkill -f "nas_server" 2>/dev/null

if [ -f "$MODDIR/server/nas_server" ] && [ -x "$MODDIR/server/nas_server" ]; then
    nohup "$MODDIR/server/nas_server" >/dev/null 2>&1 &
elif [ -n "$BB" ]; then
    pkill -f "httpd -p $PORT" 2>/dev/null
    $BB httpd -p "$PORT" -h "$MODDIR/web"
fi

# 6. 后台守护进程
(
    while true; do
        sleep 30
        if ! pgrep -f "monitor.sh" >/dev/null 2>&1; then
            nohup sh "$MODDIR/scripts/monitor.sh" >/dev/null 2>&1 &
        fi
    done
) &
