#!/data/data/com.termux/files/usr/bin/sh
# 启动"方块世界"本地服务器
# 用法: sh start.sh [端口]   默认 8123
PORT="${1:-8123}"
cd "$(dirname "$0")" || exit 1
echo "================ 方块世界 ================"
echo " 手机浏览器打开: http://127.0.0.1:$PORT/"
ip -4 addr show wlan0 2>/dev/null | awk '/inet /{print " 局域网(电视/别的设备): http://"$2}' | sed 's#/.*#/'"$PORT"'/#'
echo " 停止: 在这个终端按 Ctrl+C"
echo "=========================================="
exec python3 -m http.server "$PORT" --bind 0.0.0.0
