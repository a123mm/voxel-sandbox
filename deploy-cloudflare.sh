#!/data/data/com.termux/files/usr/bin/sh
# 用 Cloudflare Pages 部署当前目录(纯静态,直接上传,不需要 Git)
#
# 用法:
#   export CLOUDFLARE_API_TOKEN=你的Token        # 需要 Workers/Pages:Edit 权限
#   export CLOUDFLARE_ACCOUNT_ID=你的AccountID
#   sh deploy-cloudflare.sh
#
# 或者第一次先在浏览器里 wrangler login,之后直接跑本脚本。
set -e
PROJECT="${PROJECT:-voxel-sandbox}"
cd "$(dirname "$0")"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "==> 安装 wrangler(只需一次)"
  npm i -g wrangler
fi

echo "==> 检查登录状态"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if ! wrangler whoami >/dev/null 2>&1; then
    echo "还没登录:先跑  wrangler login  (会打开浏览器)"
    echo "或者  export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=..."
    exit 1
  fi
fi

echo "==> 创建项目(已存在会报错,忽略)"
wrangler pages project create "$PROJECT" --production-branch=main 2>/dev/null || true

echo "==> 上传并部署"
wrangler pages deploy . \
  --project-name="$PROJECT" \
  --branch=main \
  --commit-dirty=true \
  --commit-message="deploy $(date '+%Y-%m-%d %H:%M')"

echo
echo "完成。地址一般是: https://${PROJECT}.pages.dev/"
