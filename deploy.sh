#!/usr/bin/env bash
# 把 dist/ 发布到 gh-pages 分支，GitHub Pages 会自动重新构建。
# 用法：./deploy.sh
#   DEPLOY_PUSH_URL=git@github.com:user/repo.git ./deploy.sh   # 指定推送地址
#
# 为什么不用 GitHub Actions：本仓库所属账号目前被 GitHub 以账单问题锁定，
# 所有 workflow 都会在启动前直接失败（"The job was not started because your
# account is locked due to a billing issue."）。分支部署不消耗 Actions 额度，
# 不受影响。
set -euo pipefail

cd "$(dirname "$0")"

URL="https://wxh646121331.github.io/journey-to-the-west/"

[ -f dist/index.html ] || { echo "找不到 dist/index.html" >&2; exit 1; }

tmp="$(mktemp -d)"
idxdir="$(mktemp -d)"
trap 'rm -rf "$tmp" "$idxdir"' EXIT
cp -R dist/. "$tmp"/
touch "$tmp/.nojekyll"        # 关掉 Jekyll，避免 Pages 侧额外构建

# 索引文件必须放在发布目录之外，否则会被 git add 收进 gh-pages（.index.lock）
export GIT_INDEX_FILE="$idxdir/index"
git --work-tree="$tmp" add -A .
tree="$(git write-tree)"
commit="$(git commit-tree "$tree" -m "deploy: publish dist as static site (from $(git rev-parse --short HEAD))")"

# 优先用 DEPLOY_PUSH_URL；否则用 origin 的推送地址，HTTPS 不通时回退到 SSH
push_url="${DEPLOY_PUSH_URL:-$(git remote get-url --push origin)}"
ssh_url=""
case "$push_url" in
  https://github.com/*) ssh_url="git@github.com:${push_url#https://github.com/}" ;;
esac

# gh-pages 是纯产物分支，历史没有意义，直接覆盖
if ! git push --force "$push_url" "$commit:refs/heads/gh-pages"; then
  [ -n "$ssh_url" ] || exit 1
  echo "HTTPS 推送失败，改用 SSH：$ssh_url" >&2
  git push --force "$ssh_url" "$commit:refs/heads/gh-pages"
fi
echo "已推送 gh-pages，等 GitHub Pages 构建完成后访问：$URL（手机版：${URL}mobile/）"
