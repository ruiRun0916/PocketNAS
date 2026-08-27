#!/system/bin/sh
ui_print "************************************"
ui_print "    口袋 NAS · PocketNAS Pro v3.3.0    "
ui_print " 多维存储深度分析 & 极低功耗 NAS 升级 "
ui_print "          Author: ruiRun0916        "
ui_print "************************************"
ui_print "- 正在安装 PocketNAS Pro v3.3.0..."

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
ui_print "- 已上线仿小米系统风格多维存储空间深度分类分析（图片/音频/视频/安装包/文档/压缩包）！"
ui_print "- 24/7 原生安全 FTP (端口: 2121) 与 WebDAV (端口: 5244/dav) 已就绪！"
ui_print "- 支持在 KernelSU / Magisk / APatch 模块列表中直接点击「执行」复制 WebDAV 链接并打开控制台！"
ui_print "- 或在浏览器访问: http://[手机局域网IP]:8080"
