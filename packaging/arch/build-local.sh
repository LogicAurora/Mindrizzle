#!/usr/bin/env bash
# 用法：PKG_OUTPUT_DIR=... PKGVER=... MAKEPKG_EXTRA_ARGS=--nodeps packaging/arch/build-local.sh
set -euo pipefail

command -v makepkg >/dev/null || {
  echo "需要 makepkg（Arch Linux）" >&2
  exit 1
}

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
pkgbuild_src="$repo_root/packaging/arch/PKGBUILD"
out_dir="${PKG_OUTPUT_DIR:-$repo_root/target/arch}"

# Arch 的 pkgver 不允许连字符，预发布号的点号分隔写法由连字符替换而来
pkgver="${PKGVER:-$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$repo_root/package.json")}"
pkgver="${pkgver//-/.}"

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

# 工作区脏文件也算源码：本地打包常带着未提交的改动验证
git -C "$repo_root" ls-files -z -co --exclude-standard |
  tar -C "$repo_root" --null -T - --transform "s,^,Mindrizzle-$pkgver/," -czf "$work_dir/Mindrizzle-$pkgver.tar.gz"
sed "s/^pkgver=.*/pkgver=$pkgver/" "$pkgbuild_src" > "$work_dir/PKGBUILD"
cp "$repo_root/packaging/arch/mindrizzle.install" "$work_dir/"

makepkg_args=(-f --noconfirm --nosign)
if [[ -n "${MAKEPKG_EXTRA_ARGS:-}" ]]; then
  read -r -a extra_args <<< "$MAKEPKG_EXTRA_ARGS"
  makepkg_args+=("${extra_args[@]}")
fi

mkdir -p "$out_dir"
(
  cd "$work_dir"
  # 本机只装了 rustup 时 pacman 认不出 rust 依赖，需 MAKEPKG_EXTRA_ARGS=--nodeps
  CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$repo_root/target}" makepkg "${makepkg_args[@]}"
)

pkg_file=$(ls "$work_dir"/*.pkg.tar.zst | head -n1)
cp "$pkg_file" "$out_dir/"
echo "已生成：$out_dir/$(basename "$pkg_file")"
