#!/usr/bin/env bash
# 单文件交付：卢浮宫金字塔卡通风场景
# 中间产物用「输出名 + 进程号」命名，避免多人/多任务并行 build 时互相覆盖（已踩过）
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
THREE="${THREE_DIR:-/home/nyan/.hermes/hermes-agent/node_modules/three}"
ESBUILD="${ESBUILD:-/home/nyan/.hermes/hermes-agent/node_modules/.bin/esbuild}"
ENTRY="${1:-src/main.js}"
OUT="${2:-dist/louvre.html}"
cd "$ROOT"; mkdir -p dist
TMP="$(mktemp "dist/.app-$(basename "$OUT" .html)-XXXXXX.js")"
trap 'rm -f "$TMP"' EXIT
"$ESBUILD" "$ENTRY" --bundle --format=iife --minify --legal-comments=none \
  --alias:three="$THREE/build/three.module.js" \
  --alias:three/addons="$THREE/examples/jsm" \
  --outfile="$TMP" 2>&1 | tail -3
node - "$OUT" "$TMP" <<'NODE'
const fs=require('fs'); const out=process.argv[2], tmp=process.argv[3];
let b=fs.readFileSync(tmp,'utf8').replace(/<\/script/gi,'<\\/script');
let s=fs.readFileSync('src/shell.html','utf8');
if(!s.includes('/*__BUNDLE__*/')) throw new Error('shell 缺少 /*__BUNDLE__*/ 占位符');
fs.writeFileSync(out, s.replace('/*__BUNDLE__*/',()=>b));
console.log(`✓ ${out}  (${(fs.statSync(out).size/1024).toFixed(0)} KB, 单文件)`);
NODE
