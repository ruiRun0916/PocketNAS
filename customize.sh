#!/system/bin/sh
ui_print "************************************"
ui_print "    口袋 NAS · PocketNAS Pro v3.3.2    "
ui_print " 服务管理中心 & 全端帮助教程架构重构 "
ui_print "          Author: ruiRun0916        "
ui_print "************************************"
ui_print "- 正在安装 PocketNAS Pro v3.3.2..."

# 递归设置标准权限
set_perm_recursive $MODPATH 0 0 0755 0644
set_perm $MODPATH/service.sh 0 0 0755
set_perm $MODPATH/action.sh 0 0 0755
set_perm_recursive $MODPATH/scripts 0 0 0755 0755
set_perm_recursive $MODPATH/server 0 0 0755 0755
[ -f "$MODPATH/server/nas_server" ] && set_perm $MODPATH/server/nas_server 0 0 0755

ui_print "- 模块安装完成！"
if [ -f "$MODPATH/server/nas_server" ] && [ -x "$MODPATH/server/nas_server" ]; then
    ui_print "- 已检测到 Go 原生核心 (server/nas_server)，将以极低功耗单进程模式运行！"
fi
ui_print "- 全新 NAS 服务中心已上线：支持内置与自定义服务进程、PID、内存、CPU 实时监控！"
ui_print "- 设备连接页面已完成精简化，新增「❓ 帮助」全端多协议挂载教程与排错指南！"
ui_print "- 24/7 原生安全 FTP (端口: 2121) 与 WebDAV (端口: 5244/dav) 已就绪！"
ui_print "- 支持在 KernelSU / Magisk / APatch 模块列表中直接点击「执行」复制 WebDAV 链接并打开控制台！"
ui_print "- 或在浏览器访问: http://[手机局域网IP]:8080"
