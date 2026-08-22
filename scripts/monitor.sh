#!/system/bin/sh
# Xiaomi NAS Monitor - Universal Auto-Detecting Data Collector
# Works on ALL Android Devices & Chips (Snapdragon / Dimensity / Tensor / Exynos / Kirin)

if [ -d "/data/adb/modules/xiaomi_nas_monitor" ]; then
    MODDIR="/data/adb/modules/xiaomi_nas_monitor"
else
    MODDIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
fi
[ -z "$MODDIR" ] || [ "$MODDIR" = "/" ] && MODDIR="/data/adb/modules/xiaomi_nas_monitor"
[ -d "$MODDIR" ] || MODDIR="$(pwd)"

OUT_DIR="/data/local/tmp/nas"
[ -w "/data/local/tmp" ] || OUT_DIR="$MODDIR/data"
mkdir -p "$OUT_DIR" 2>/dev/null
mkdir -p "$MODDIR/web/api" 2>/dev/null

CONFIG_FILE="$MODDIR/config/config.json"
STORAGE_TARGET="/data/media/0"
REFRESH=4

# ================= 动态自动识别设备名称与型号 =================
get_device_name() {
    local name=""
    # 1. 优先读取系统市场营销名 (MIUI/HyperOS, ColorOS, OriginOS, Flyme 等均支持)
    name=$(getprop ro.product.marketname 2>/dev/null)
    [ -z "$name" ] && name=$(getprop ro.vendor.marketname 2>/dev/null)
    
    # 2. 回退到 品牌 + 型号 (AOSP, Pixel, 三星等)
    if [ -z "$name" ]; then
        local brand=$(getprop ro.product.brand 2>/dev/null)
        local model=$(getprop ro.product.model 2>/dev/null)
        [ -n "$brand" ] && [ -n "$model" ] && name="${brand} ${model}"
    fi

    # 3. 再次回退到基础型号
    [ -z "$name" ] && name=$(getprop ro.product.model 2>/dev/null)
    [ -z "$name" ] && name="Android Device"

    # 如果用户在 config.json 明确指定且不为默认值，则尊重配置
    if [ -f "$CONFIG_FILE" ]; then
        local conf_name=$(grep -o '"device_name"[^:]*:[^,]*' "$CONFIG_FILE" | cut -d'"' -f4)
        [ -n "$conf_name" ] && [ "$conf_name" != "Xiaomi 11 Ultra" ] && name="$conf_name"
    fi
    echo "$name"
}

# ================= 动态自动识别处理器 (高通全系/天玑全系/Tensor/Exynos/麒麟) =================
get_cpu_model() {
    local cpu=""
    # 1. Android 11+ 标准 SoC 属性
    local soc_man=$(getprop ro.soc.manufacturer 2>/dev/null)
    local soc_model=$(getprop ro.soc.model 2>/dev/null)
    
    if [ -n "$soc_model" ]; then
        case "$soc_model" in
            SM8350*|lahaina) cpu="Qualcomm Snapdragon 888" ;;
            SM8450*|taro) cpu="Snapdragon 8 Gen 1" ;;
            SM8475*|cape) cpu="Snapdragon 8+ Gen 1" ;;
            SM8550*|kalama) cpu="Snapdragon 8 Gen 2" ;;
            SM8650*|pineapple) cpu="Snapdragon 8 Gen 3" ;;
            SM8750*|sun) cpu="Snapdragon 8 Elite (Gen 4)" ;;
            SM8250*|kona) cpu="Snapdragon 865 / 870" ;;
            SM7475*|marble) cpu="Snapdragon 7+ Gen 2" ;;
            MT6989*) cpu="MediaTek Dimensity 9300" ;;
            MT6985*) cpu="MediaTek Dimensity 9200" ;;
            MT6983*) cpu="MediaTek Dimensity 9000" ;;
            MT6895*) cpu="MediaTek Dimensity 8100/8200" ;;
            *) cpu="${soc_man} ${soc_model}" ;;
        esac
    fi

    # 2. 从 /proc/cpuinfo Hardware 行提取
    if [ -z "$cpu" ] && [ -f /proc/cpuinfo ]; then
        local hw=$(grep -m1 '^Hardware' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^[ \t]*//')
        [ -n "$hw" ] && cpu="$hw"
    fi

    # 3. 从芯片平台代号提取
    if [ -z "$cpu" ]; then
        local plat=$(getprop ro.board.platform 2>/dev/null)
        [ -n "$plat" ] && cpu="Platform: ${plat}"
    fi

    [ -z "$cpu" ] && cpu="Multi-Core Processor"
    echo "$cpu"
}

DEV_NAME=$(get_device_name)
CPU_MODEL_NAME=$(get_cpu_model)
ANDROID_VER="Android $(getprop ro.build.version.release 2>/dev/null || echo '14')"

if [ -f "$CONFIG_FILE" ]; then
    REFRESH_CONF=$(grep -o '"refresh_seconds"[^:]*:[^,]*' "$CONFIG_FILE" | tr -dc '0-9')
    [ -n "$REFRESH_CONF" ] && [ "$REFRESH_CONF" -gt 1 ] && REFRESH="$REFRESH_CONF"
fi

prev_total_time=0
prev_idle_time=0
prev_rx=0
prev_tx=0

get_ip() {
    local ip=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 | head -n1)
    if [ -z "$ip" ]; then
        ip=$(ip -4 addr show 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v '127.0.0.1' | cut -d' ' -f2 | head -n1)
    fi
    [ -z "$ip" ] && ip="127.0.0.1"
    echo "$ip"
}

get_cpu_temp() {
    local temp_raw=""
    for tz in /sys/class/thermal/thermal_zone*; do
        if [ -f "$tz/type" ]; then
            local type=$(cat "$tz/type" 2>/dev/null)
            case "$type" in
                *cpu*|*soc*|*tsens*|*cluster*|*mtktscpu*)
                    if [ -f "$tz/temp" ]; then
                        temp_raw=$(cat "$tz/temp" 2>/dev/null)
                        [ -n "$temp_raw" ] && [ "$temp_raw" -gt 1000 ] && break
                    fi
                    ;;
            esac
        fi
    done
    if [ -z "$temp_raw" ] || [ "$temp_raw" -le 0 ]; then
        [ -f /sys/class/thermal/thermal_zone0/temp ] && temp_raw=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
    fi
    if [ -n "$temp_raw" ]; then
        if [ "$temp_raw" -gt 1000 ]; then
            echo $((temp_raw / 1000))
        else
            echo "$temp_raw"
        fi
    else
        echo "40"
    fi
}

get_bat_temp() {
    local b_temp=""
    if [ -f /sys/class/power_supply/battery/temp ]; then
        b_temp=$(cat /sys/class/power_supply/battery/temp 2>/dev/null)
    elif [ -f /sys/class/power_supply/bms/temp ]; then
        b_temp=$(cat /sys/class/power_supply/bms/temp 2>/dev/null)
    fi
    if [ -n "$b_temp" ]; then
        if [ "$b_temp" -gt 1000 ]; then
            echo $((b_temp / 1000))
        elif [ "$b_temp" -gt 100 ]; then
            echo $((b_temp / 10))
        else
            echo "$b_temp"
        fi
    else
        echo "32"
    fi
}

get_power_info() {
    local v_uV=0
    local i_uA=0
    
    if [ -f /sys/class/power_supply/battery/voltage_now ]; then
        v_uV=$(cat /sys/class/power_supply/battery/voltage_now 2>/dev/null)
    fi
    if [ -f /sys/class/power_supply/battery/current_now ]; then
        i_uA=$(cat /sys/class/power_supply/battery/current_now 2>/dev/null)
    elif [ -f /sys/class/power_supply/bms/current_now ]; then
        i_uA=$(cat /sys/class/power_supply/bms/current_now 2>/dev/null)
    fi

    i_uA=$(echo "$i_uA" | tr -dc '0-9')
    v_uV=$(echo "$v_uV" | tr -dc '0-9')

    [ -z "$v_uV" ] && v_uV=4000000
    [ -z "$i_uA" ] && i_uA=450000

    if [ "$v_uV" -lt 100000 ]; then
        v_uV=$((v_uV * 1000))
    fi
    if [ "$i_uA" -lt 10000 ]; then
        i_uA=$((i_uA * 1000))
    fi

    local v_val=$((v_uV / 1000000))
    local v_dec=$(( (v_uV % 1000000) / 10000 ))
    local v_str="${v_val}.${v_dec} V"

    local i_ma=$((i_uA / 1000))
    local i_str="${i_ma} mA"

    local v_mv=$((v_uV / 1000))
    local p_mw=$((v_mv * i_ma / 1000))
    local p_w=$((p_mw / 1000))
    local p_dec=$(( (p_mw % 1000) / 10 ))
    local p_str="${p_w}.${p_dec} W"

    echo "$p_str|$v_str|$i_str"
}

format_bytes() {
    local b=$1
    if [ "$b" -ge 1048576 ]; then
        local mb=$((b / 1048576))
        local dec=$(( (b % 1048576) * 10 / 1048576 ))
        echo "${mb}.${dec} MB/s"
    elif [ "$b" -ge 1024 ]; then
        local kb=$((b / 1024))
        echo "${kb} KB/s"
    else
        echo "${b} B/s"
    fi
}

format_kb_to_gb() {
    local kb=$1
    local gb=$((kb / 1048576))
    local dec=$(( (kb % 1048576) * 10 / 1048576 ))
    echo "${gb}.${dec} GB"
}

while true; do
    # 1. 运行时间 Uptime
    uptime_sec=$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)
    days=$((uptime_sec / 86400))
    hours=$(( (uptime_sec % 86400) / 3600 ))
    mins=$(( (uptime_sec % 3600) / 60 ))
    if [ $days -gt 0 ]; then
        uptime_str="${days}天 ${hours}小时 ${mins}分"
    else
        uptime_str="${hours}小时 ${mins}分"
    fi

    # 2. 内存计算 /proc/meminfo
    mem_total_kb=0
    mem_avail_kb=0
    if [ -f /proc/meminfo ]; then
        mem_total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null)
        mem_avail_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null)
        [ -z "$mem_avail_kb" ] && mem_avail_kb=$(awk '/^MemFree:/{print $2}' /proc/meminfo 2>/dev/null)
    fi
    [ -z "$mem_total_kb" ] || [ "$mem_total_kb" -le 0 ] && mem_total_kb=1
    [ -z "$mem_avail_kb" ] && mem_avail_kb=0
    mem_used_kb=$((mem_total_kb - mem_avail_kb))
    [ $mem_used_kb -lt 0 ] && mem_used_kb=0
    mem_percent=$((mem_used_kb * 100 / mem_total_kb))
    mem_total_fmt=$(format_kb_to_gb $mem_total_kb)
    mem_used_fmt=$(format_kb_to_gb $mem_used_kb)
    mem_free_fmt=$(format_kb_to_gb $mem_avail_kb)

    # 3. 存储空间 df
    st_target="$STORAGE_TARGET"
    [ -d "$st_target" ] || st_target="/data"
    [ -d "$st_target" ] || st_target="/"
    df_data=$(df -k "$st_target" 2>/dev/null | tail -n 1)
    st_total_kb=$(echo "$df_data" | awk '{print $(NF-4)}')
    st_used_kb=$(echo "$df_data" | awk '{print $(NF-3)}')
    st_free_kb=$(echo "$df_data" | awk '{print $(NF-2)}')
    [ -z "$st_total_kb" ] || [ "$st_total_kb" -le 0 ] && st_total_kb=1
    [ -z "$st_used_kb" ] && st_used_kb=0
    [ -z "$st_free_kb" ] && st_free_kb=0
    st_percent=$((st_used_kb * 100 / st_total_kb))
    st_total_fmt=$(format_kb_to_gb $st_total_kb)
    st_used_fmt=$(format_kb_to_gb $st_used_kb)
    st_free_fmt=$(format_kb_to_gb $st_free_kb)

    # 4. CPU 占用率计算
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

    # 5. 温度
    cpu_temp=$(get_cpu_temp)
    bat_temp=$(get_bat_temp)

    # 6. 网络流量与速率计算
    net_line=$(grep -E 'wlan0|rmnet_data0|eth0' /proc/net/dev 2>/dev/null | head -n1)
    if [ -n "$net_line" ]; then
        cur_rx=$(echo "$net_line" | awk -F: '{print $2}' | awk '{print $1}')
        cur_tx=$(echo "$net_line" | awk -F: '{print $2}' | awk '{print $9}')
    else
        cur_rx=0
        cur_tx=0
    fi

    down_speed_fmt="0 B/s"
    up_speed_fmt="0 B/s"
    if [ "$prev_rx" -gt 0 ] && [ "$cur_rx" -ge "$prev_rx" ]; then
        rx_diff=$(( (cur_rx - prev_rx) / REFRESH ))
        tx_diff=$(( (cur_tx - prev_tx) / REFRESH ))
        down_speed_fmt=$(format_bytes $rx_diff)
        up_speed_fmt=$(format_bytes $tx_diff)
    fi
    prev_rx=$cur_rx
    prev_tx=$cur_tx

    ip_addr=$(get_ip)

    # 7. 电池状态与功耗计算
    bat_level=100
    bat_charging="false"
    if [ -f /sys/class/power_supply/battery/capacity ]; then
        bat_level=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null)
    fi
    if [ -f /sys/class/power_supply/battery/status ]; then
        b_status=$(cat /sys/class/power_supply/battery/status 2>/dev/null)
        case "$b_status" in
            Charging|Full) bat_charging="true" ;;
            *) bat_charging="false" ;;
        esac
    fi

    p_info=$(get_power_info)
    power_val=$(echo "$p_info" | cut -d'|' -f1)
    volt_val=$(echo "$p_info" | cut -d'|' -f2)
    curr_val=$(echo "$p_info" | cut -d'|' -f3)

    # 8. 服务连通性 (AList 5244 端口)
    alist_status="false"
    if grep -q "147C" /proc/net/tcp 2>/dev/null || grep -q "147C" /proc/net/tcp6 2>/dev/null; then
        alist_status="true"
    fi

    cur_time=$(date "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "2026-08-22 12:00:00")

    # 9. 输出原子 JSON 文件
    TMP_JSON="${OUT_DIR}/status.json.tmp"
    FINAL_JSON="${OUT_DIR}/status.json"

    cat << JSON_EOF > "$TMP_JSON"
{
  "device": "${DEV_NAME}",
  "system": "${ANDROID_VER}",
  "uptime": "${uptime_str}",
  "storage": {
    "total": "${st_total_fmt}",
    "used": "${st_used_fmt}",
    "free": "${st_free_fmt}",
    "percent": ${st_percent}
  },
  "memory": {
    "total": "${mem_total_fmt}",
    "used": "${mem_used_fmt}",
    "free": "${mem_free_fmt}",
    "percent": ${mem_percent}
  },
  "cpu": {
    "model": "${CPU_MODEL_NAME}",
    "usage": ${cpu_usage}
  },
  "temperature": {
    "cpu": ${cpu_temp},
    "battery": ${bat_temp}
  },
  "network": {
    "interface": "wlan0",
    "ip": "${ip_addr}",
    "download": "${down_speed_fmt}",
    "upload": "${up_speed_fmt}"
  },
  "battery": {
    "level": ${bat_level},
    "charging": ${bat_charging},
    "temperature": ${bat_temp},
    "power": "${power_val}",
    "voltage": "${volt_val}",
    "current": "${curr_val}"
  },
  "services": {
    "alist": ${alist_status},
    "alist_url": "http://${ip_addr}:5244",
    "webdav": ${alist_status}
  },
  "time": "${cur_time}"
}
JSON_EOF

    mv "$TMP_JSON" "$FINAL_JSON" 2>/dev/null
    cp "$FINAL_JSON" "$MODDIR/web/api/status" 2>/dev/null
    cp "$FINAL_JSON" "$MODDIR/web/status.json" 2>/dev/null

    sleep "$REFRESH"
done
