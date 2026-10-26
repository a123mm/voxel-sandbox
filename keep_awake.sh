#!/data/data/com.termux/files/usr/bin/sh
# 保持设备唤醒(无 root)。用法: sh keep_awake.sh [cpu|release|adb-on|adb-off|info]
#
#   cpu      申请 Termux 的 CPU 唤醒锁 —— 屏幕仍会熄灭,但进程/网络不会被挂起
#   release  释放 CPU 唤醒锁
#   adb-on   (需先开无线调试)保持屏幕常亮:svc power stayon true
#   adb-off  关闭
#   info     说明
set -u

case "${1:-info}" in
  cpu)
    if command -v termux-wake-lock >/dev/null 2>&1; then
      termux-wake-lock && echo "已申请 CPU 唤醒锁(屏幕仍会熄灭;屏幕常亮请在游戏里开「常亮」)"
    else
      echo "缺少 termux-wake-lock:请安装 Termux:API 应用 + pkg install termux-api"
    fi
    ;;
  release)
    command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock && echo "已释放 CPU 唤醒锁" || echo "缺少 termux-wake-unlock"
    ;;
  adb-on)
    adb devices 2>/dev/null | grep -q 'device$' || { echo "没有可用的 adb 设备(先开无线调试:甲壳虫 → 5555)"; exit 1; }
    adb shell svc power stayon true && echo "已设置:充电时保持屏幕常亮(adb)"
    ;;
  adb-off)
    adb shell svc power stayon false && echo "已取消 adb 常亮"
    ;;
  *)
    cat <<'INFO'
保持唤醒的三种办法(本机无 root):

1) 屏幕常亮(推荐,无需 adb)
   游戏里 → 菜单 → 「常亮:开」
   用的是浏览器的 Screen Wake Lock API。
   注意:必须是安全上下文 —— 在这台手机上用 http://127.0.0.1:8123/ 打开即可;
   用 http://<局域网IP>:8123/ 打开时浏览器不提供该 API。

2) CPU 唤醒锁(屏幕会熄,但服务不掉线)
   sh keep_awake.sh cpu
   sh keep_awake.sh release
   需要 Termux:API 应用 + pkg install termux-api。

3) adb(需先开无线调试,重启后要重开)
   sh keep_awake.sh adb-on     # svc power stayon true(充电时屏幕常亮)
   sh keep_awake.sh adb-off
   也可: adb shell settings put system screen_off_timeout 2147483647

注意:普通 Termux 进程直接改 settings 会被拒(SecurityException,缺 INTERACT_ACROSS_USERS),
所以方案 3 必须走 adb shell。
INFO
    ;;
esac
