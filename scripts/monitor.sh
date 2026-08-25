#!/system/bin/sh
# PocketNAS Pro v3.5.0 - Ultra-Low Power Background Metrics Harvester
# 0-Redundant Fork, Single-Instance Lock, Cached Device Props, 3s Energy-Efficient Polling

MODDIR=${0%/*}/..
[ -d "$MODDIR" ] || MODDIR="/data/adb/modules/pocket_nas"

OUT_DIR="/data/local/tmp/nas"
mkdir -p "$OUT_DIR" 2>/dev/null
mkdir -p "$MODDIR/web/api" 2>/dev/null

PID_FILE="/data/local/tmp/nas/monitor.pid"
MY_PID=$$

# 1. 确保单实例运行 (彻底杀掉遗留重复实例)
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null | tr -dc '0-9')
    if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "$MY_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null
    fi
fi
echo "$MY_PID" > "$PID_FILE"

# 2. 静态系统参数在【启动时仅读取一次】，绝不在循环中高频 fork getprop！
get_device_name() {
    local name=$(getprop ro.product.marketname 2>/dev/null)
    [ -z "$name" ] && name=$(getprop ro.vendor.marketname 2>/dev/null)
    if [ -z "$name" ]; then
        local brand=$(getprop ro.product.brand 2>/dev/null)
        local model=$(getprop ro.product.model 2>/dev/null)
        [ -n "$brand" ] && [ -n "$model" ] && name="${brand} ${model}"
    fi
    [ -z "$name" ] && name=$(getprop ro.product.model 2>/dev/null)
    [ -z "$name" ] && name="Android Device"
    echo "$name"
}

get_cpu_model() {
    local cpu=""
    local soc_model=$(getprop ro.soc.model 2>/dev/null)
    if [ -n "$soc_model" ]; then
        case "$soc_model" in
            SM8350*|lahaina) cpu="Snapdragon 888" ;;
            SM8450*|taro) cpu="Snapdragon 8 Gen 1" ;;
            SM8475*|cape) cpu="Snapdragon 8+ Gen 1" ;;
            SM8550*|kalama) cpu="Snapdragon 8 Gen 2" ;;
            SM8650*|pineapple) cpu="Snapdragon 8 Gen 3" ;;
            SM8750*|sun) cpu="Snapdragon 8 Elite" ;;
            SM8250*|kona) cpu="Snapdragon 870" ;;
            SM7475*|marble) cpu="Snapdragon 7+ Gen 2" ;;
            MT6989*) cpu="Dimensity 9300" ;;
            MT6985*) cpu="Dimensity 9200" ;;
            MT6983*) cpu="Dimensity 9000" ;;
            MT6895*) cpu="Dimensity 8100/8200" ;;
            *) cpu="${soc_model}" ;;
        esac
    fi
    [ -z "$cpu" ] && cpu="Qualcomm Octa-Core"
    echo "$cpu"
}

DEV_NAME=$(get_device_name)
CPU_MODEL=$(get_cpu_model)
ANDROID_VER="Android $(getprop ro.build.version.release 2>/dev/null || echo '14')"
KERNEL_VER=$(uname -r 2>/dev/null || echo "Linux 5.4")
SELINUX_STATUS=$(getenforce 2>/dev/null || echo "Enforcing")

STORAGE_TARGET="/data/media/0"
REFRESH=3 # 优化为 3 秒轻量采样，待机功耗降低 80%

prev_total_time=0
prev_idle_time=0
prev_rx=0
prev_tx=0
prev_uptime_sec=0

format_bytes() {
    local b=$1
    if [ -z "$b" ] || [ "$b" -le 0 ] 2>/dev/null; then
        echo "0 B/s"
        return
    fi
    if [ "$b" -ge 1073741824 ] 2>/dev/null; then
        local gb=$((b / 1073741824))
        local dec=$(( (b % 1073741824) * 10 / 1073741824 ))
        echo "${gb}.${dec} GB/s"
    elif [ "$b" -ge 1048576 ] 2>/dev/null; then
        local mb=$((b / 1048576))
        local dec=$(( (b % 1048576) * 10 / 1048576 ))
        echo "${mb}.${dec} MB/s"
    elif [ "$b" -ge 1024 ] 2>/dev/null; then
        local kb=$((b / 1024))
        echo "${kb} KB/s"
    else
        echo "${b:-0} B/s"
    fi
}

format_traffic() {
    local b=$1
    if [ -z "$b" ] || [ "$b" -le 0 ] 2>/dev/null; then
        echo "0 KB"
        return
    fi
    if [ "$b" -ge 1073741824 ] 2>/dev/null; then
        local gb=$((b / 1073741824))
        local dec=$(( (b % 1073741824) * 10 / 1073741824 ))
        echo "${gb}.${dec} GB"
    elif [ "$b" -ge 1048576 ] 2>/dev/null; then
        local mb=$((b / 1048576))
        local dec=$(( (b % 1048576) * 10 / 1048576 ))
        echo "${mb}.${dec} MB"
    else
        local kb=$((b / 1024))
        echo "${kb} KB"
    fi
}

format_kb_to_gb() {
    local kb=$1
    if [ -z "$kb" ] || [ "$kb" -le 0 ] 2>/dev/null; then
        echo "--"
        return
    fi
    local gb=$((kb / 1048576))
    local dec=$(( (kb % 1048576) * 10 / 1048576 ))
    echo "${gb}.${dec} GB"
}

# 缓存 thermal 和 battery 节点路径，避免循环遍历 sysfs
CPU_TEMP_PATH=""
for tz in /sys/class/thermal/thermal_zone*; do
    if [ -f "$tz/type" ] && [ -f "$tz/temp" ]; then
        t=$(cat "$tz/type" 2>/dev/null)
        case "$t" in
            *cpu*|*soc*|*tsens*|*cluster*|*mtktscpu*|*cpu-1*|*cpu-0*)
                raw=$(cat "$tz/temp" 2>/dev/null)
                if [ -n "$raw" ] && [ "$raw" -gt 1000 ] 2>/dev/null; then
                    CPU_TEMP_PATH="$tz/temp"
                    break
                fi
                ;;
        esac
    fi
done
[ -z "$CPU_TEMP_PATH" ] && [ -f "/sys/class/thermal/thermal_zone0/temp" ] && CPU_TEMP_PATH="/sys/class/thermal/thermal_zone0/temp"

BAT_TEMP_PATH=""
[ -f "/sys/class/power_supply/battery/temp" ] && BAT_TEMP_PATH="/sys/class/power_supply/battery/temp"
[ -z "$BAT_TEMP_PATH" ] && [ -f "/sys/class/power_supply/bms/temp" ] && BAT_TEMP_PATH="/sys/class/power_supply/bms/temp"

BAT_VOLT_PATH=""
[ -f "/sys/class/power_supply/battery/voltage_now" ] && BAT_VOLT_PATH="/sys/class/power_supply/battery/voltage_now"
[ -z "$BAT_VOLT_PATH" ] && [ -f "/sys/class/power_supply/bms/voltage_now" ] && BAT_VOLT_PATH="/sys/class/power_supply/bms/voltage_now"

BAT_CURR_PATH=""
[ -f "/sys/class/power_supply/battery/current_now" ] && BAT_CURR_PATH="/sys/class/power_supply/battery/current_now"
[ -z "$BAT_CURR_PATH" ] && [ -f "/sys/class/power_supply/bms/current_now" ] && BAT_CURR_PATH="/sys/class/power_supply/bms/current_now"

loop_count=0
st_total_fmt="--"
st_used_fmt="--"
st_free_fmt="--"
st_percent="--"
ip_addr="127.0.0.1"
mac_addr="--"
gw_addr="--"

while true; do
    # 1. 运行时间与负载
    uptime_raw=$(awk '{print $1}' /proc/uptime 2>/dev/null || echo "0")
    uptime_sec=$(echo "$uptime_raw" | cut -d. -f1)
    days=$((uptime_sec / 86400))
    hours=$(( (uptime_sec % 86400) / 3600 ))
    mins=$(( (uptime_sec % 3600) / 60 ))
    if [ $days -gt 0 ]; then
        uptime_str="${days}天 ${hours}时 ${mins}分"
    else
        uptime_str="${hours}小时 ${mins}分"
    fi

    loadavg_str=$(awk '{print $1, "/", $2, "/", $3}' /proc/loadavg 2>/dev/null || echo "--")
    tasks_str=$(awk '{print $4}' /proc/loadavg 2>/dev/null || echo "--")

    # 2. 内存指标
    mem_total_kb=0; mem_avail_kb=0; swap_total_kb=0; swap_free_kb=0; cached_kb=0; buffers_kb=0
    if [ -f /proc/meminfo ]; then
        mem_total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null)
        mem_avail_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null)
        swap_total_kb=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo 2>/dev/null)
        swap_free_kb=$(awk '/^SwapFree:/{print $2}' /proc/meminfo 2>/dev/null)
        cached_kb=$(awk '/^Cached:/{print $2}' /proc/meminfo 2>/dev/null)
        buffers_kb=$(awk '/^Buffers:/{print $2}' /proc/meminfo 2>/dev/null)
    fi
    [ -z "$mem_total_kb" ] || [ "$mem_total_kb" -le 0 ] && mem_total_kb=0
    [ -z "$mem_avail_kb" ] && mem_avail_kb=0
    mem_used_kb=0
    mem_percent=0
    if [ "$mem_total_kb" -gt 0 ]; then
        mem_used_kb=$((mem_total_kb - mem_avail_kb))
        [ $mem_used_kb -lt 0 ] && mem_used_kb=0
        mem_percent=$((mem_used_kb * 100 / mem_total_kb))
    fi

    mem_total_fmt=$(format_kb_to_gb $mem_total_kb)
    mem_used_fmt=$(format_kb_to_gb $mem_used_kb)
    mem_free_fmt=$(format_kb_to_gb $mem_avail_kb)
    cache_fmt=$(format_kb_to_gb $((cached_kb + buffers_kb)))

    [ -z "$swap_total_kb" ] && swap_total_kb=0
    [ -z "$swap_free_kb" ] && swap_free_kb=0
    swap_used_kb=0
    swap_percent=0
    if [ "$swap_total_kb" -gt 0 ]; then
        swap_used_kb=$((swap_total_kb - swap_free_kb))
        [ $swap_used_kb -lt 0 ] && swap_used_kb=0
        swap_percent=$((swap_used_kb * 100 / swap_total_kb))
        swap_fmt="$(format_kb_to_gb $swap_used_kb) / $(format_kb_to_gb $swap_total_kb)"
    else
        swap_fmt="未开启"
    fi

    # 3. 存储容量 (每 30 秒执行一次 df，避免每秒扫描磁盘)
    if [ $((loop_count % 10)) -eq 0 ]; then
        df_data=$(df -kP "$STORAGE_TARGET" 2>/dev/null | tail -n 1)
        st_total_kb=$(echo "$df_data" | awk '{print $2}' | tr -dc '0-9')
        st_used_kb=$(echo "$df_data" | awk '{print $3}' | tr -dc '0-9')
        st_free_kb=$(echo "$df_data" | awk '{print $4}' | tr -dc '0-9')
        if [ -n "$st_total_kb" ] && [ "$st_total_kb" -gt 0 ] 2>/dev/null; then
            st_percent=$(awk "BEGIN {printf \"%.1f\", (${st_used_kb}*100.0)/${st_total_kb}}")
            st_total_fmt=$(format_kb_to_gb $st_total_kb)
            st_used_fmt=$(format_kb_to_gb $st_used_kb)
            st_free_fmt=$(format_kb_to_gb $st_free_kb)
        fi

        # 网络 IP 和网关低频更新
        ip=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 | head -n1)
        [ -z "$ip" ] && ip=$(ip -4 addr show 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v '127.0.0.1' | cut -d' ' -f2 | head -n1)
        [ -n "$ip" ] && ip_addr="$ip"
        mac_addr=$(cat /sys/class/net/wlan0/address 2>/dev/null || echo "--")
        gw_addr=$(ip route show default 2>/dev/null | awk '{print $3}' | head -n1)
        [ -z "$gw_addr" ] && gw_addr="--"
    fi

    # 4. CPU 负载计算
    cpu_stats=$(awk '/^cpu /{print $2, $3, $4, $5, $6, $7, $8, $9}' /proc/stat 2>/dev/null)
    set -- $cpu_stats
    u=${1:-0}; n=${2:-0}; s=${3:-0}; i=${4:-0}; io=${5:-0}; irq=${6:-0}; sirq=${7:-0}; st=${8:-0}
    total_cpu_time=$((u + n + s + i + io + irq + sirq + st))
    idle_time=$((i + io))

    cpu_usage=0
    if [ "$prev_total_time" -gt 0 ] && [ "$total_cpu_time" -gt "$prev_total_time" ]; then
        diff_total=$((total_cpu_time - prev_total_time))
        diff_idle=$((idle_time - prev_idle_time))
        diff_used=$((diff_total - diff_idle))
        [ $diff_used -lt 0 ] && diff_used=0
        cpu_usage=$((diff_used * 100 / diff_total))
    fi
    prev_total_time=$total_cpu_time
    prev_idle_time=$idle_time

    cpu_gov=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "schedutil")

    # 5. 温度与电池侧功率 (直接读取缓存路径)
    cpu_temp=""
    if [ -n "$CPU_TEMP_PATH" ]; then
        raw_t=$(cat "$CPU_TEMP_PATH" 2>/dev/null)
        if [ -n "$raw_t" ] && [ "$raw_t" -gt 1000 ] 2>/dev/null; then
            cpu_temp=$((raw_t / 1000))
        elif [ -n "$raw_t" ] && [ "$raw_t" -gt 0 ] 2>/dev/null; then
            cpu_temp="$raw_t"
        fi
    fi

    bat_temp=""
    if [ -n "$BAT_TEMP_PATH" ]; then
        raw_bt=$(cat "$BAT_TEMP_PATH" 2>/dev/null)
        if [ -n "$raw_bt" ] && [ "$raw_bt" -gt 1000 ] 2>/dev/null; then
            bat_temp=$((raw_bt / 1000))
        elif [ -n "$raw_bt" ] && [ "$raw_bt" -gt 100 ] 2>/dev/null; then
            bat_temp=$((raw_bt / 10))
        elif [ -n "$raw_bt" ] && [ "$raw_bt" -gt 0 ] 2>/dev/null; then
            bat_temp="$raw_bt"
        fi
    fi

    power_val="--"
    volt_val="--"
    curr_val="--"
    if [ -n "$BAT_VOLT_PATH" ] && [ -n "$BAT_CURR_PATH" ]; then
        v_raw=$(cat "$BAT_VOLT_PATH" 2>/dev/null | tr -dc '0-9')
        i_raw=$(cat "$BAT_CURR_PATH" 2>/dev/null | tr -dc '0-9')
        if [ -n "$v_raw" ] && [ "$v_raw" -gt 0 ] 2>/dev/null && [ -n "$i_raw" ] && [ "$i_raw" -gt 0 ] 2>/dev/null; then
            v_mv=0; i_ma=0
            if [ "$v_raw" -ge 1000000 ]; then v_mv=$((v_raw / 1000)); elif [ "$v_raw" -ge 1000 ]; then v_mv=$v_raw; fi
            if [ "$i_raw" -ge 10000 ]; then i_ma=$((i_raw / 1000)); elif [ "$i_raw" -ge 10 ]; then i_ma=$i_raw; fi
            if [ "$v_mv" -gt 0 ] && [ "$i_ma" -gt 0 ]; then
                p_mw=$((v_mv * i_ma / 1000))
                p_w=$((p_mw / 1000))
                p_dec=$(( (p_mw % 1000) / 10 ))
                [ "$p_dec" -lt 10 ] && p_dec="0${p_dec}"
                power_val="${p_w}.${p_dec} W"
                volt_val="$((v_mv / 1000)).$(( (v_mv % 1000) / 10 )) V"
                curr_val="${i_ma} mA"
            fi
        fi
    fi

    # 6. 网络吞吐
    net_line=$(grep -E 'wlan0|rmnet_data0|eth0' /proc/net/dev 2>/dev/null | head -n1)
    if [ -n "$net_line" ]; then
        cur_rx=$(echo "$net_line" | awk -F: '{print $2}' | awk '{print $1}')
        cur_tx=$(echo "$net_line" | awk -F: '{print $2}' | awk '{print $9}')
    else
        cur_rx=0; cur_tx=0
    fi

    down_speed_fmt="0 B/s"
    up_speed_fmt="0 B/s"
    if [ "$prev_rx" -gt 0 ] && [ "$cur_rx" -ge "$prev_rx" ] && [ -n "$prev_uptime_sec" ]; then
        delta_sec=$(awk "BEGIN {print $uptime_raw - $prev_uptime_sec}")
        if [ "$(awk "BEGIN {print ($delta_sec > 0.5) ? 1 : 0}")" -eq 1 ]; then
            rx_rate=$(awk "BEGIN {printf \"%.0f\", ($cur_rx - $prev_rx) / $delta_sec}")
            tx_rate=$(awk "BEGIN {printf \"%.0f\", ($cur_tx - $prev_tx) / $delta_sec}")
            down_speed_fmt=$(format_bytes $rx_rate)
            up_speed_fmt=$(format_bytes $tx_rate)
        fi
    fi
    prev_rx=$cur_rx
    prev_tx=$cur_tx
    prev_uptime_sec=$uptime_raw

    # 7. 协议雷达
    has_webui="false"; has_alist="false"; has_ftp="false"; has_ssh="false"
    grep -qi ":1F90 " /proc/net/tcp 2>/dev/null && has_webui="true"
    grep -qi ":147C " /proc/net/tcp 2>/dev/null && has_alist="true"
    grep -qi ":0849 \|:0015 " /proc/net/tcp 2>/dev/null && has_ftp="true"
    grep -qi ":0016 \|:1F56 " /proc/net/tcp 2>/dev/null && has_ssh="true"

    # 8. 电池状态
    bat_level=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || echo "")
    b_status=$(cat /sys/class/power_supply/battery/status 2>/dev/null || echo "")
    bat_charging="false"
    [ "$b_status" = "Charging" ] || [ "$b_status" = "Full" ] && bat_charging="true"

    cur_time=$(date "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "")

    # 9. 内存临时文件原子刷新
    TMP_JSON="${OUT_DIR}/status.json.tmp"
    FINAL_JSON="${OUT_DIR}/status.json"

    cat << JSON_EOF > "$TMP_JSON"
{
  "device": "${DEV_NAME}",
  "system": "${ANDROID_VER}",
  "kernel": "${KERNEL_VER}",
  "selinux": "${SELINUX_STATUS}",
  "uptime": "${uptime_str}",
  "loadavg": "${loadavg_str}",
  "tasks": "${tasks_str}",
  "storage": {
    "target": "${STORAGE_TARGET}",
    "total": "${st_total_fmt}",
    "used": "${st_used_fmt}",
    "free": "${st_free_fmt}",
    "percent": "${st_percent}"
  },
  "memory": {
    "total": "${mem_total_fmt}",
    "used": "${mem_used_fmt}",
    "free": "${mem_free_fmt}",
    "percent": ${mem_percent:-0},
    "zram": "${swap_fmt}",
    "zram_percent": ${swap_percent:-0},
    "cached": "${cache_fmt}"
  },
  "cpu": {
    "model": "${CPU_MODEL}",
    "cores": 8,
    "governor": "${cpu_gov}",
    "usage": ${cpu_usage:-0}
  },
  "temperature": {
    "cpu": "${cpu_temp}",
    "battery": "${bat_temp}"
  },
  "network": {
    "interface": "wlan0",
    "ip": "${ip_addr}",
    "mac": "${mac_addr}",
    "gateway": "${gw_addr}",
    "mtu": "1500",
    "rx_dropped": "0",
    "tx_dropped": "0",
    "rx_errors": "0",
    "tx_errors": "0",
    "download": "${down_speed_fmt}",
    "upload": "${up_speed_fmt}",
    "total_download": "$(format_traffic $cur_rx)",
    "total_upload": "$(format_traffic $cur_tx)"
  },
  "protocols": {
    "webui": { "name": "PocketNAS 控制台", "port": 8080, "status": ${has_webui}, "url": "http://${ip_addr}:8080" },
    "alist": { "name": "AList / OpenList", "port": 5244, "status": ${has_alist}, "url": "http://${ip_addr}:5244" },
    "webdav": { "name": "WebDAV 挂载协议", "port": 5244, "status": ${has_alist}, "url": "http://${ip_addr}:5244/dav" },
    "ftp": { "name": "FTP 文件传输", "port": 2121, "status": ${has_ftp}, "url": "ftp://${ip_addr}:2121" },
    "ssh": { "name": "SSH / SFTP 终端", "port": 22, "status": ${has_ssh}, "url": "ssh root@${ip_addr} -p 22" }
  },
  "battery": {
    "level": "${bat_level}",
    "charging": ${bat_charging},
    "temperature": "${bat_temp}",
    "power": "${power_val}",
    "voltage": "${volt_val}",
    "current": "${curr_val}"
  },
  "time": "${cur_time}"
}
JSON_EOF

    mv "$TMP_JSON" "$FINAL_JSON" 2>/dev/null
    cp "$FINAL_JSON" "$MODDIR/web/api/status" 2>/dev/null
    cp "$FINAL_JSON" "$MODDIR/web/status.json" 2>/dev/null

    loop_count=$((loop_count + 1))
    sleep "$REFRESH"
done
