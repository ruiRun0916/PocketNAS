#!/system/bin/sh
# PocketNAS Pro v3.2.0 - Ultra-Low Power Go Daemon Manager
# Clean Port Cleanup, Single Go Binary Execution (0-Fork, 0-Disk I/O)

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR="/data/adb/modules/pocket_nas"

# 1. 等待系统开机广播完成
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 3
done

sleep 2

# 2. 查找 Busybox 工具链 (备用兜底)
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

# 3. 初始化目录与安全权限
mkdir -p "$MODDIR/logs" "$MODDIR/data" 2>/dev/null
mkdir -p /data/local/tmp/nas/etc 2>/dev/null
mkdir -p "$MODDIR/web/api" 2>/dev/null

LOG_FILE="$MODDIR/logs/service.log"

log() {
    local ts=$(date "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "2026-08-25 09:00:00")
    echo "[$ts] $1" >> "$LOG_FILE" 2>/dev/null
    if [ -f "$LOG_FILE" ]; then
        local sz=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$sz" -gt 128000 ]; then
            tail -n 60 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
            mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
        fi
    fi
}

log "PocketNAS Pro 服务启动流程开始..."

chmod 777 /data/local/tmp/nas 2>/dev/null
chmod -R 755 "$MODDIR/scripts" 2>/dev/null
chmod -R 755 "$MODDIR/server" 2>/dev/null
[ -f "$MODDIR/server/nas_server" ] && chmod 755 "$MODDIR/server/nas_server" 2>/dev/null

PORT=8080
if [ -f "$MODDIR/config/config.json" ]; then
    PORT_CONF=$(grep -o '"port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$PORT_CONF" ] && [ "$PORT_CONF" -gt 0 ] && PORT="$PORT_CONF"
fi

# 4. 彻底释放旧端口占用与旧进程 (解决 address already in use)
pkill -9 -f "nas_server" 2>/dev/null
pkill -9 -f "monitor.sh" 2>/dev/null
pkill -9 -f "tcpsvd.*2121" 2>/dev/null
pkill -9 -f "httpd -p $PORT" 2>/dev/null
if [ -n "$BB" ]; then
    $BB fuser -k -9 2121/tcp >/dev/null 2>&1
    $BB fuser -k -9 $PORT/tcp >/dev/null 2>&1
fi
sleep 2

# 5. 启动主守护服务
start_daemon() {
    # 优先启动编译好的 Go 原生单二进制 (0-Fork, 0-Disk I/O)
    if [ -f "$MODDIR/server/nas_server" ] && [ -x "$MODDIR/server/nas_server" ]; then
        nohup "$MODDIR/server/nas_server" >> "$LOG_FILE" 2>&1 &
        log "PocketNAS Go 原生守护进程已启动 (Web: $PORT, FTP: 2121)"
        return 0
    elif [ -n "$BB" ]; then
        # 备用轻量启动
        echo "anonymous::0:0:Anonymous:/data/media/0:/bin/sh" > /data/local/tmp/nas/etc/passwd 2>/dev/null
        echo "root::0:0:Root:/data/media/0:/bin/sh" >> /data/local/tmp/nas/etc/passwd 2>/dev/null
        chmod 644 /data/local/tmp/nas/etc/passwd 2>/dev/null

        if ! pgrep -f "tcpsvd.*2121" >/dev/null 2>&1; then
            $BB tcpsvd -vE 0.0.0.0 2121 $BB ftpd -w -A /data/media/0 >> "$LOG_FILE" 2>&1 &
        fi
        if ! pgrep -f "httpd -p $PORT" >/dev/null 2>&1; then
            $BB httpd -p "$PORT" -h "$MODDIR/web"
        fi
        if ! pgrep -f "monitor.sh" >/dev/null 2>&1; then
            nohup sh "$MODDIR/scripts/monitor.sh" >> "$LOG_FILE" 2>&1 &
        fi
        log "PocketNAS 备用服务已启动 (Web: $PORT, FTP: 2121)"
        return 0
    fi
    log "【错误】未找到可执行的 nas_server 或 busybox"
    return 1
}

start_daemon

# 6. 后台极低开销看门狗 (每 60 秒巡检一次，仅在进程真正缺失时拉起)
(
    while true; do
        sleep 60

        if [ -f "$MODDIR/server/nas_server" ] && [ -x "$MODDIR/server/nas_server" ]; then
            if ! pgrep -f "nas_server" >/dev/null 2>&1; then
                nohup "$MODDIR/server/nas_server" >> "$LOG_FILE" 2>&1 &
            fi
        elif [ -n "$BB" ]; then
            if ! pgrep -f "tcpsvd.*2121" >/dev/null 2>&1; then
                $BB tcpsvd -vE 0.0.0.0 2121 $BB ftpd -w -A /data/media/0 >> "$LOG_FILE" 2>&1 &
            fi
            if ! pgrep -f "httpd -p $PORT" >/dev/null 2>&1; then
                $BB httpd -p "$PORT" -h "$MODDIR/web"
            fi
            if ! pgrep -f "monitor.sh" >/dev/null 2>&1; then
                nohup sh "$MODDIR/scripts/monitor.sh" >> "$LOG_FILE" 2>&1 &
            fi
        fi
    done
) &
