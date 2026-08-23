#!/system/bin/sh
# PocketNAS Pro v2.9.0 - P1: PID-Managed Daemon Launcher & Bounded Backoff Watchdog

MODDIR=${0%/*}
[ -d "$MODDIR" ] || MODDIR="/data/adb/modules/pocket_nas"

# 1. 等待系统开机广播就绪
until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 3
done

sleep 2

# 2. 查找 Busybox 工具链
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

# 3. 初始化持久化与临时目录
mkdir -p "$MODDIR/logs" "$MODDIR/data" 2>/dev/null
mkdir -p /data/local/tmp/nas/etc 2>/dev/null
mkdir -p "$MODDIR/web/api" 2>/dev/null

LOG_FILE="$MODDIR/logs/service.log"
PID_FILE="$MODDIR/data/pocket_nas.pid"
FTP_PID_FILE="$MODDIR/data/ftp.pid"

log() {
    local ts=$(date "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "2026-08-23 13:00:00")
    echo "[$ts] $1" >> "$LOG_FILE" 2>/dev/null
    if [ -f "$LOG_FILE" ]; then
        local sz=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$sz" -gt 256000 ]; then
            tail -n 100 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null
            mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null
        fi
    fi
}

log "PocketNAS Pro 服务启动流程开始..."

# 动态在内存/临时区生成测速分块 (开机动态生成，0 刷机包空间占用)
if [ ! -f /data/local/tmp/nas/speedtest_chunk.bin ]; then
    dd if=/dev/zero of=/data/local/tmp/nas/speedtest_chunk.bin bs=64k count=32 2>/dev/null
fi
ln -sf /data/local/tmp/nas/speedtest_chunk.bin "$MODDIR/web/speedtest_chunk.bin" 2>/dev/null

# 注入 FTP 匿名鉴权表
echo "anonymous::0:0:Anonymous:/data/media/0:/bin/sh" > /data/local/tmp/nas/etc/passwd 2>/dev/null
echo "root::0:0:Root:/data/media/0:/bin/sh" >> /data/local/tmp/nas/etc/passwd 2>/dev/null
chmod 644 /data/local/tmp/nas/etc/passwd 2>/dev/null

chmod 777 /data/local/tmp/nas 2>/dev/null
chmod -R 755 "$MODDIR/scripts" 2>/dev/null
chmod -R 755 "$MODDIR/server" 2>/dev/null

PORT=8080
if [ -f "$MODDIR/config/config.json" ]; then
    PORT_CONF=$(grep -o '"port"[^:]*:[^,]*' "$MODDIR/config/config.json" | tr -dc '0-9')
    [ -n "$PORT_CONF" ] && [ "$PORT_CONF" -gt 0 ] && PORT="$PORT_CONF"
fi

# 4. 精准停止旧进程 (基于 PID 管理)
stop_process_by_pid() {
    local pfile=$1
    if [ -f "$pfile" ]; then
        local old_pid=$(cat "$pfile" 2>/dev/null | tr -dc '0-9')
        if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
            kill -TERM "$old_pid" 2>/dev/null
            sleep 1
            kill -0 "$old_pid" 2>/dev/null && kill -9 "$old_pid" 2>/dev/null
        fi
        rm -f "$pfile" 2>/dev/null
    fi
}

stop_process_by_pid "$PID_FILE"
stop_process_by_pid "$FTP_PID_FILE"

# 5. 启动主守护进程 (Go 整合后端)
start_daemon() {
    if [ -f "$MODDIR/server/nas_server" ] && [ -x "$MODDIR/server/nas_server" ]; then
        nohup "$MODDIR/server/nas_server" >> "$LOG_FILE" 2>&1 &
        local n_pid=$!
        echo "$n_pid" > "$PID_FILE"
        log "PocketNAS Go 守护进程已启动 (PID: $n_pid, 端口: $PORT)"
        return 0
    elif [ -n "$BB" ]; then
        # 备用方案 (Busybox 托管)
        $BB tcpsvd -vE 0.0.0.0 2121 $BB ftpd -w -A /data/media/0 >> "$LOG_FILE" 2>&1 &
        echo "$!" > "$FTP_PID_FILE"
        
        $BB httpd -p "$PORT" -h "$MODDIR/web" >> "$LOG_FILE" 2>&1 &
        echo "$!" > "$PID_FILE"
        
        # 备用轻量采集脚本
        nohup sh "$MODDIR/scripts/monitor.sh" >> "$LOG_FILE" 2>&1 &
        log "PocketNAS Busybox 备用服务已拉起"
        return 0
    fi
    log "【错误】未找到可执行的 nas_server 或 busybox"
    return 1
}

start_daemon

# 6. 后台看门狗守护循环 (P1: 指数退避与有限重启机制，防止死循环)
(
    crash_count=0
    max_crashes=3
    backoff_delay=2

    while true; do
        sleep 25

        is_alive="false"
        if [ -f "$PID_FILE" ]; then
            cur_pid=$(cat "$PID_FILE" 2>/dev/null | tr -dc '0-9')
            if [ -n "$cur_pid" ] && kill -0 "$cur_pid" 2>/dev/null; then
                is_alive="true"
                crash_count=0
                backoff_delay=2
            fi
        fi

        if [ "$is_alive" = "false" ]; then
            if [ "$crash_count" -lt "$max_crashes" ]; then
                crash_count=$((crash_count + 1))
                log "【警告】主服务进程异常退出，将在 ${backoff_delay} 秒后尝试第 ${crash_count} 次自愈重启..."
                sleep "$backoff_delay"
                backoff_delay=$((backoff_delay * 2))
                start_daemon
            else
                log "【致命】主服务连续发生 ${max_crashes} 次异常崩溃，为保护系统能效已暂停自动重启。"
                break
            fi
        fi
    done
) &
