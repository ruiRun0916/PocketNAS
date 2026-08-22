#!/system/bin/sh
ui_print "************************************"
ui_print "   口袋 NAS · PocketNAS Pro v1.8.0   "
ui_print "       存储百分比与功耗修复版       "
ui_print "          Author: ruiRun0916        "
ui_print "************************************"
ui_print "- 正在安装 PocketNAS Pro v1.8.0..."

# 设置可执行权限
set_perm_recursive $MODPATH 0 0 0755 0644
set_perm $MODPATH/service.sh 0 0 0755
set_perm $MODPATH/action.sh 0 0 0755
set_perm_recursive $MODPATH/scripts 0 0 0755 0755
set_perm_recursive $MODPATH/server 0 0 0755 0755

ui_print "- 模块安装完成！"
ui_print "- 支持在 KernelSU / Magisk / APatch 模块列表中直接点击「执行」进入 Web 控制台！"
ui_print "- 或在浏览器访问: http://[手机局域网IP]:8080"
