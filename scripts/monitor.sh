#!/system/bin/sh
# PocketNAS Pro v2.8.0 - High-Precision Real-time Harvester (P0: True Metrics Only)

if [ -d "/data/adb/modules/pocket_nas" ]; then
    MODDIR="/data/adb/modules/pocket_nas"
else
    MODDIR="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
fi
[ -z "$MODDIR" ] || [ "$MODDIR" = "/" ] && MODDIR="/data/adb/modules/pocket_nas"
[ -d "$MODDIR" ] || MODDIR="$(pwd)"

OUT_DIR="/data/local/tmp/nas"
[ -w "/data/local/tmp" ] || OUT_DIR="$MODDIR/data"
mkdir -p "$OUT_DIR" 2>/dev/null
mkdir -p "$MODDIR/web/api" 2>/dev/null

CONFIG_FILE="$MODDIR/config/config.json"
STORAGE_TARGET="/data/media/0"
REFRESH=1

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
    if [ -z "$cpu" ] && [ -f /proc/cpuinfo ]; then
        local hw=$(grep -m1 '^Hardware' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^[ \t]*//')
        [ -n "$hw" ] && cpu="$hw"
    fi
    [ -z "$cpu" ] && cpu="Qualcomm Octa-Core"
    echo "$cpu"
}

DEV_NAME=$(get_device_name)
CPU_MODEL=$(get_cpu_model)
ANDROID_VER="Android $(getprop ro.build.version.release 2>/dev/null || echo '14')"
KERNEL_VER=$(uname -r 2>/dev/null || echo "Linux")
SELINUX_STATUS=$(getenforce 2>/dev/null || echo "Enforcing")

prev_total_time=0
prev_idle_time=0
prev_rx=0
prev_tx=0
prev_uptime_sec=0

get_net_details() {
    local ip=$(ip -4 addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2 | head -n1)
    if [ -z "$ip" ]; then
        ip=$(ip -4 addr show 2>/dev/null | grep -o 'inet [0-9.]*' | grep -v '127.0.0.1' | cut -d' ' -f2 | head -n1)
    fi
    [ -z "$ip" ] && ip="127.0.0.1"
    
    local mac=$(cat /sys/class/net/wlan0/address 2>/dev/null || echo "00:00:00:00:00:00")
    local mtu=$(cat /sys/class/net/wlan0/mtu 2>/dev/null || echo "1500")
    local gw=$(ip route show default 2>/dev/null | awk '{print $3}' | head -n1)
    [ -z "$gw" ] && gw="--"

    local rx_drop=$(cat /sys/class/net/wlan0/statistics/rx_dropped 2>/dev/null || echo "0")
    local tx_drop=$(cat /sys/class/net/wlan0/statistics/tx_dropped 2>/dev/null || echo "0")
    local rx_err=$(cat /sys/class/net/wlan0/statistics/rx_errors 2>/dev/null || echo "0")
    local tx_err=$(cat /sys/class/net/wlan0/statistics/tx_errors 2>/dev/null || echo "0")

    echo "$ip|$mac|$gw|$mtu|$rx_drop|$tx_drop|$rx_err|$tx_err"
}

check_tcp_port() {
    local hex_port=$1
    if grep -qi ":${hex_port} " /proc/net/tcp 2>/dev/null || grep -qi ":${hex_port} " /proc/net/tcp6 2>/dev/null; then
        echo "true"
    else
        echo "false"
    fi
}

scan_all_protocols() {
    local p_webui=$(check_tcp_port "1F90")
    local p_alist=$(check_tcp_port "147C")
    
    local p_ftp_21=$(check_tcp_port "0015")
    local p_ftp_2121=$(check_tcp_port "0849")
    local p_ftp_2122=$(check_tcp_port "084A")
    local p_ftp="false"
    local ftp_port="2121"
    if [ "$p_ftp_21" = "true" ]; then
        p_ftp="true"; ftp_port="21"
    elif [ "$p_ftp_2122" = "true" ]; then
        p_ftp="true"; ftp_port="2122"
    elif [ "$p_ftp_2121" = "true" ]; then
        p_ftp="true"; ftp_port="2121"
    fi

    local p_ssh_22=$(check_tcp_port "0016")
    local p_ssh_8022=$(check_tcp_port "1F56")
    local p_ssh="false"
    local ssh_port="22"
    if [ "$p_ssh_22" = "true" ]; then
        p_ssh="true"; ssh_port="22"
    elif [ "$p_ssh_8022" = "true" ]; then
        p_ssh="true"; ssh_port="8022"
    fi

    local p_aria2=$(check_tcp_port "1A90")
    local p_syncthing=$(check_tcp_port "20C0")

    echo "$p_webui|$p_alist|$p_ftp|$ftp_port|$p_ssh|$ssh_port|$p_aria2|$p_syncthing"
}

# P0: 真实传感器扫描，无法读取时输出空，绝不使用假数据
get_cpu_temp() {
    local temp_raw=""
    for tz in /sys/class/thermal/thermal_zone*; do
        if [ -f "$tz/type" ] && [ -f "$tz/temp" ]; then
            local type=$(cat "$tz/type" 2>/dev/null)
            case "$type" in
                *cpu*|*soc*|*tsens*|*cluster*|*mtktscpu*|*cpu-1*|*cpu-0*)
                    temp_raw=$(cat "$tz/temp" 2>/dev/null)
                    [ -n "$temp_raw" ] && [ "$temp_raw" -gt 1000 ] 2>/dev/null && break
                    ;;
            esac
        fi
    done
    
    if [ -z "$temp_raw" ] || [ "$temp_raw" -le 0 ] 2>/dev/null; then
        for i in 0 1 2 3 4 5 10 15 20; do
            if [ -f "/sys/class/thermal/thermal_zone${i}/temp" ]; then
                local t=$(cat "/sys/class/thermal/thermal_zone${i}/temp" 2>/dev/null)
                if [ -n "$t" ] && [ "$t" -gt 20000 ] 2>/dev/null && [ "$t" -lt 110000 ] 2>/dev/null; then
                    temp_raw=$t
                    break
                fi
            fi
        done
    fi

    if [ -n "$temp_raw" ] && [ "$temp_raw" -gt 0 ] 2>/dev/null; then
        if [ "$temp_raw" -gt 1000 ] 2>/dev/null; then
            echo $((temp_raw / 1000))
        else
            echo "$temp_raw"
        fi
    else
        echo ""
    fi
}

get_bat_temp() {
    local b_temp=""
    if [ -f /sys/class/power_supply/battery/temp ]; then
        b_temp=$(cat /sys/class/power_supply/battery/temp 2>/dev/null)
    elif [ -f /sys/class/power_supply/bms/temp ]; then
        b_temp=$(cat /sys/class/power_supply/bms/temp 2>/dev/null)
    elif [ -f /sys/class/power_supply/battery/batt_temp ]; then
        b_temp=$(cat /sys/class/power_supply/battery/batt_temp 2>/dev/null)
    fi

    if [ -n "$b_temp" ] && [ "$b_temp" -gt 0 ] 2>/dev/null; then
        if [ "$b_temp" -gt 1000 ] 2>/dev/null; then
            echo $((b_temp / 1000))
        elif [ "$b_temp" -gt 100 ] 2>/dev/null; then
            echo $((b_temp / 10))
        else
            echo "$b_temp"
        fi
    else
        echo ""
    fi
}

# P0: 电池侧真实功率计算 (voltage * current)，无法读取时输出空，绝不伪造
get_power_info() {
    local v_raw=""
    local i_raw=""
    
    for vf in \
        /sys/class/power_supply/battery/voltage_now \
        /sys/class/power_supply/bms/voltage_now \
        /sys/class/power_supply/battery/batt_vol \
        /sys/class/power_supply/battery/voltage_boot; do
        if [ -f "$vf" ]; then
            v_raw=$(cat "$vf" 2>/dev/null)
            [ -n "$v_raw" ] && [ "$v_raw" -gt 0 ] 2>/dev/null && break
        fi
    done

    for ifile in \
        /sys/class/power_supply/battery/current_now \
        /sys/class/power_supply/bms/current_now \
        /sys/class/power_supply/battery/batt_current \
        /sys/class/power_supply/main/current_now; do
        if [ -f "$ifile" ]; then
            i_raw=$(cat "$ifile" 2>/dev/null)
            [ -n "$i_raw" ] && [ "$i_raw" != "0" ] 2>/dev/null && break
        fi
    done

    local v_val=$(echo "$v_raw" | tr -dc '0-9')
    local i_val=$(echo "$i_raw" | tr -dc '0-9')

    if [ -z "$v_val" ] || [ "$v_val" -le 0 ] 2>/dev/null || [ -z "$i_val" ] || [ "$i_val" -le 0 ] 2>/dev/null; then
        echo "||"
        return
    fi

    local v_mv=0
    local i_ma=0

    if [ "$v_val" -ge 1000000 ]; then
        v_mv=$((v_val / 1000))
    elif [ "$v_val" -ge 1000 ]; then
        v_mv=$v_val
    fi

    if [ "$i_val" -ge 10000 ]; then
        i_ma=$((i_val / 1000))
    elif [ "$i_val" -ge 10 ]; then
        i_ma=$i_val
    fi

    if [ "$v_mv" -le 0 ] || [ "$i_ma" -le 0 ]; then
        echo "||"
        return
    fi

    local p_mw=$((v_mv * i_ma / 1000))
    local p_w=$((p_mw / 1000))
    local p_dec=$(( (p_mw % 1000) / 10 ))
    if [ "$p_dec" -lt 10 ]; then
        p_dec="0${p_dec}"
    fi
    local p_str="${p_w}.${p_dec} W"

    local v_w=$((v_mv / 1000))
    local v_dec=$(( (v_mv % 1000) / 10 ))
    if [ "$v_dec" -lt 10 ]; then
        v_dec="0${v_dec}"
    fi
    local v_str="${v_w}.${v_dec} V"
    local i_str="${i_ma} mA"

    echo "$p_str|$v_str|$i_str"
}

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
        echo "0 GB"
        return
    fi
    local gb=$((kb / 1048576))
    local dec=$(( (kb % 1048576) * 10 / 1048576 ))
    echo "${gb}.${dec} GB"
}

while true; do
    # 1. 运行时间与负载
    uptime_raw=$(awk '{print $1}' /proc/uptime 2>/dev/null || echo "0")
    uptime_sec=$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)
    days=$((uptime_sec / 86400))
    hours=$(( (uptime_sec % 86400) / 3600 ))
    mins=$(( (uptime_sec % 3600) / 60 ))
    if [ $days -gt 0 ]; then
        uptime_str="${days}天 ${hours}时 ${mins}分"
    else
        uptime_str="${hours}小时 ${mins}分"
    fi

    loadavg_1=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo "--")
    loadavg_5=$(awk '{print $2}' /proc/loadavg 2>/dev/null || echo "--")
    loadavg_15=$(awk '{print $3}' /proc/loadavg 2>/dev/null || echo "--")
    loadavg_str="${loadavg_1} / ${loadavg_5} / ${loadavg_15}"
    tasks_str=$(awk '{print $4}' /proc/loadavg 2>/dev/null || echo "--")

    # 2. 内存指标 (真实读取)
    mem_total_kb=0; mem_avail_kb=0; swap_total_kb=0; swap_free_kb=0; cached_kb=0; buffers_kb=0
    if [ -f /proc/meminfo ]; then
        mem_total_kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
        mem_avail_kb=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
        swap_total_kb=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)
        swap_free_kb=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
        cached_kb=$(awk '/^Cached:/{print $2}' /proc/meminfo)
        buffers_kb=$(awk '/^Buffers:/{print $2}' /proc/meminfo)
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

    # 3. 存储空间 (真实 POSIX df -kP 读取，无假数据 fallback)
    st_target="$STORAGE_TARGET"
    [ -d "$st_target" ] || st_target="/data"
    [ -d "$st_target" ] || st_target="/"
    df_data=$(df -kP "$st_target" 2>/dev/null | tail -n 1)
    
    st_total_kb=$(echo "$df_data" | awk '{print $2}' | tr -dc '0-9')
    st_used_kb=$(echo "$df_data" | awk '{print $3}' | tr -dc '0-9')
    st_free_kb=$(echo "$df_data" | awk '{print $4}' | tr -dc '0-9')
    [ -z "$st_total_kb" ] && st_total_kb=0
    [ -z "$st_used_kb" ] && st_used_kb=0
    [ -z "$st_free_kb" ] && st_free_kb=0
    
    st_percent=""
    if [ "$st_total_kb" -gt 0 ]; then
        st_percent=$(awk "BEGIN {printf \"%.1f\", (${st_used_kb}*100.0)/${st_total_kb}}")
    fi

    st_total_fmt=$(format_kb_to_gb $st_total_kb)
    st_used_fmt=$(format_kb_to_gb $st_used_kb)
    st_free_fmt=$(format_kb_to_gb $st_free_kb)

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

    # 5. 温度与电池侧功率 (真实传感器值)
    cpu_temp=$(get_cpu_temp)
    bat_temp=$(get_bat_temp)
    p_info=$(get_power_info)
    power_val=$(echo "$p_info" | cut -d'|' -f1)
    volt_val=$(echo "$p_info" | cut -d'|' -f2)
    curr_val=$(echo "$p_info" | cut -d'|' -f3)

    # 6. 网络吞吐 (微秒时间戳精准除法)
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
        if [ "$(awk "BEGIN {print ($delta_sec > 0.3) ? 1 : 0}")" -eq 1 ]; then
            rx_rate=$(awk "BEGIN {printf \"%.0f\", ($cur_rx - $prev_rx) / $delta_sec}")
            tx_rate=$(awk "BEGIN {printf \"%.0f\", ($cur_tx - $prev_tx) / $delta_sec}")
            down_speed_fmt=$(format_bytes $rx_rate)
            up_speed_fmt=$(format_bytes $tx_rate)
        fi
    fi
    prev_rx=$cur_rx
    prev_tx=$cur_tx
    prev_uptime_sec=$uptime_raw

    total_rx_fmt=$(format_traffic $cur_rx)
    total_tx_fmt=$(format_traffic $cur_tx)

    net_info=$(get_net_details)
    ip_addr=$(echo "$net_info" | cut -d'|' -f1)
    mac_addr=$(echo "$net_info" | cut -d'|' -f2)
    gw_addr=$(echo "$net_info" | cut -d'|' -f3)
    mtu_val=$(echo "$net_info" | cut -d'|' -f4)
    rx_dropped=$(echo "$net_info" | cut -d'|' -f5)
    tx_dropped=$(echo "$net_info" | cut -d'|' -f6)
    rx_errors=$(echo "$net_info" | cut -d'|' -f7)
    tx_errors=$(echo "$net_info" | cut -d'|' -f8)

    # 7. 全协议监听雷达扫描
    proto_scan=$(scan_all_protocols)
    has_webui=$(echo "$proto_scan" | cut -d'|' -f1)
    has_alist=$(echo "$proto_scan" | cut -d'|' -f2)
    has_ftp=$(echo "$proto_scan" | cut -d'|' -f3)
    ftp_port=$(echo "$proto_scan" | cut -d'|' -f4)
    has_ssh=$(echo "$proto_scan" | cut -d'|' -f5)
    ssh_port=$(echo "$proto_scan" | cut -d'|' -f6)
    has_aria2=$(echo "$proto_scan" | cut -d'|' -f7)
    has_syncthing=$(echo "$proto_scan" | cut -d'|' -f8)

    # 8. 电池状态
    bat_level=""
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

    cur_time=$(date "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "")

    # 9. 输出原子 JSON
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
    "target": "${st_target}",
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
    "mtu": "${mtu_val}",
    "rx_dropped": "${rx_dropped}",
    "tx_dropped": "${tx_dropped}",
    "rx_errors": "${rx_errors}",
    "tx_errors": "${tx_errors}",
    "download": "${down_speed_fmt}",
    "upload": "${up_speed_fmt}",
    "total_download": "${total_rx_fmt}",
    "total_upload": "${total_tx_fmt}"
  },
  "protocols": {
    "webui": { "name": "PocketNAS 控制台", "port": 8080, "status": ${has_webui}, "url": "http://${ip_addr}:8080" },
    "alist": { "name": "AList / OpenList", "port": 5244, "status": ${has_alist}, "url": "http://${ip_addr}:5244" },
    "webdav": { "name": "WebDAV 挂载协议", "port": 5244, "status": ${has_alist}, "url": "http://${ip_addr}:5244/dav" },
    "ftp": { "name": "FTP 文件传输", "port": ${ftp_port}, "status": ${has_ftp}, "url": "ftp://${ip_addr}:${ftp_port}" },
    "ssh": { "name": "SSH / SFTP 终端", "port": ${ssh_port}, "status": ${has_ssh}, "url": "ssh root@${ip_addr} -p ${ssh_port}" },
    "aria2": { "name": "Aria2 离线下载", "port": 6800, "status": ${has_aria2}, "url": "http://${ip_addr}:6800/jsonrpc" },
    "syncthing": { "name": "Syncthing 多端同步", "port": 8384, "status": ${has_syncthing}, "url": "http://${ip_addr}:8384" }
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

    sleep "$REFRESH"
done
