#!/data/data/com.termux/files/usr/bin/sh
# 每次改完都跑这个:语法检查 + 三种材质主题的 DOM 测试 + 贴图渲染自检
cd "$(dirname "$0")" || exit 1
echo "===== 1/4 语法检查 ====="
node --check game.js || exit 1
echo "  ✅ game.js 语法 OK"
echo
fail=0
for t in round pack classic; do
  echo "===== DOM 行为测试:主题 $t ====="
  THEME=$t node test.js || fail=1
  echo
done
echo "===== 贴图渲染自检 ====="
if node _preview/render.js >/dev/null 2>&1; then
  echo "  ✅ 圆润贴图可渲染"
else
  echo "  ❌ 渲染失败"; fail=1
fi
echo
if [ -n "$SOAK" ]; then
  echo "===== 长时间运行(4 秒) ====="
  SOAK=1 THEME=round node test.js || fail=1
fi
echo
if [ "$fail" = "0" ]; then echo "🎉 全部通过(3 个主题)"; else echo "❌ 有失败"; fi
exit $fail
