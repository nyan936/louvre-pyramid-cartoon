#!/usr/bin/env bash
# 防回归：把这轮实际踩过的坑固化成可自动检查的断言（每条都对应一次真实事故）
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
num() { grep -oP "$2" "$1" | head -1 | grep -oP '[-0-9.]+$'; }

echo "[1] 交付物：单文件、零外部请求"
HTML="${1:-dist/louvre.html}"
if [ -f "$HTML" ]; then
  ok "存在 $HTML ($(du -h "$HTML" | cut -f1))"
  if grep -qE '(src|href)="https?://|@import|url\(https?://' "$HTML"; then
    bad "含外部引用（必须是单文件零请求）"
  else ok "无任何 http(s) 外部引用"; fi
  if grep -qE '<script[^>]+src=' "$HTML"; then bad "存在外链 script"; else ok "无外链 script"; fi
else bad "缺少 $HTML"; fi

echo "[2] 远景地面必须低于池底（曾把整个水池洞口盖住）"
OUT=$(num src/world.js 'outer\.position\.y = [-0-9.]+')
BASIN=$(num src/water.js 'export const BASIN_Y = [-0-9.]+')
if [ -n "$OUT" ] && [ -n "$BASIN" ]; then
  awk -v a="$OUT" -v b="$BASIN" 'BEGIN{exit !(a<b)}' \
    && ok "outer.y=$OUT < BASIN_Y=$BASIN" || bad "outer.y=$OUT 不低于池底 $BASIN（会盖住水面）"
else bad "读不到 outer.y / BASIN_Y"; fi

echo "[3] 水面材质必须 DoubleSide（曾因绕序朝下被整块剔除）"
grep -q 'reflector.material.side = THREE.DoubleSide' src/water.js \
  && ok "水面 DoubleSide" || bad "水面未设 DoubleSide"

echo "[4] 亭阁开窗必须写在 mergeGeos(loc) 之前（曾写在之后 → 完全没生效）"
WL=$(grep -n '亭阁开窗' src/palace.js | head -1 | cut -d: -f1)
MG=$(grep -n 'mergeGeos(loc)' src/palace.js | head -1 | cut -d: -f1)
if [ -n "$WL" ] && [ -n "$MG" ]; then
  [ "$WL" -lt "$MG" ] && ok "开窗($WL) < 合并($MG)" || bad "开窗($WL) 在合并($MG) 之后"
else bad "找不到亭阁开窗/合并语句"; fi

echo "[5] 立面窗户必须做在墙面之前（墙是 z∈[-DEPTH,0] 实心盒）"
grep -q 'dark.translate(cx, 1.9, 0.005)' src/palace.js && grep -q 'gl.translate(cx, 1.9, 0.07)' src/palace.js \
  && ok "底层拱窗 z>0" || bad "拱窗仍可能在墙体内部"

echo "[6] Shape.holes 必须是 Path 对象（传点数组会直接白屏）"
if grep -q 'holes.push(.*getPoints' src/*.js; then bad "有 holes.push(点数组)"; else ok "无 holes.push(点数组)"; fi
grep -q 's.holes.push(archPath' src/palace.js && ok "拱形洞用 Path" || bad "拱形洞不是 Path"

echo "[7] 铜马骑像必须抬到基座顶面（曾整座像被埋进 5.37m 基座）"
grep -q 'bronzeMesh.position.y = 5.37' src/props.js && ok "骑像 y=5.37" || bad "骑像未抬高"

echo "[8] 相机俯仰限制不能把中轴机位顶起来（曾把 y=4.6 顶成 y=17）"
if grep -q 'maxPolarAngle = Math.PI - ' src/main.js; then
  ok "maxPolarAngle = Math.PI-0.02（允许抬头看星空，地面由 y>=1.1 兜底）"
else
  MAXP=$(num src/main.js 'maxPolarAngle = [-0-9.]+' || true)
  awk -v a="${MAXP:-0}" 'BEGIN{exit !(a>=1.62)}' && ok "maxPolarAngle=$MAXP" || bad "maxPolarAngle=${MAXP:-未读到} 太小"
fi

echo "[9] 人物的 rotation.y 必须按"正面=+z"给（曾整批侧身走路）"
grep -q 'u.dir > 0 ? Math.PI / 2 : -Math.PI / 2' src/props.js \
  && ok "中轴行人朝向正确" || bad "行人朝向仍是 ±x 语义"

echo "[10] 着色器 uniform 不得在别处重复声明"
node - <<'NODE'
const fs=require('fs');
const decl=(src,start,end)=>{const s=fs.readFileSync(src,'utf8');const a=s.indexOf(start);const b=s.indexOf(end,a);return new Set([...s.slice(a,b).matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map(m=>m[1]));};
const sky=decl('src/sky.js','const SKY_FRAG','`;');
const wat=decl('src/water.js','const WATER_FRAG','`;');
const dup=[...sky].filter(n=>wat.has(n));
if(dup.length){console.error('  ✗ SKY_FRAG 与 WATER_FRAG 重复声明:',dup.join(', '));process.exit(1);}
console.log('  \u2713 两个 shader 无同名 uniform');
NODE
[ $? -eq 0 ] || fail=1

echo "[11] 贴地构件不得与铺装共面（曾整圈 z-fighting 闪烁）"
if grep -q 'ch / 2 - 0.42' src/pyramid.js; then bad "石缘顶面仍与铺装共面（ch/2-0.42 → 顶面 y=0）"; else ok "石缘顶面已离开铺装平面"; fi
grep -q '0.06 - ch / 2' src/pyramid.js && ok "石缘顶面 = +0.06" || bad "石缘未按 +0.06 抬高"

echo "[12] 地面必须有 polygonOffset 兜底（任何贴地构件都不再抢深度）"
grep -q 'paveMat.polygonOffset = true' src/world.js && ok "铺装 polygonOffset 已开" || bad "铺装缺 polygonOffset"

echo "[13] 孟莎屋顶必须是两段坡（旧版单棱台平顶进深 22m → 俯视像平顶盖）"
grep -q 'yBreak' src/palace.js && ok "断檐线（两段坡）存在" || bad "屋顶仍是一层棱台"
node - <<'NODE'
const fs=require('fs'); const s=fs.readFileSync('src/palace.js','utf8');
const num=(re)=>{const m=s.match(re); return m?parseFloat(m[1]):null;};
const bpBack=num(/bp = \[2\.0, zB \+ ([0-9.]+)/), tpBack=num(/tp = \[3\.0, zB \+ ([0-9.]+)/);
const tpZ1=num(/tp = \[[^\]]*?, (-?[0-9.]+)\];/);
const okBack = bpBack>=2.5 && tpBack>=2.5;
const depth = tpZ1!==null ? Math.abs(tpZ1 - (-26 + tpBack)) : 99;
if(!okBack){console.error('  \u2717 背坡收进不足（bp '+(bpBack*1000|0)/1000+'m / tp '+(tpBack*1000|0)/1000+'m，需 >=2.5m），背面看会像没屋顶');process.exit(1);}
if(depth>12){console.error('  \u2717 顶部脊面进深 '+depth.toFixed(1)+'m 过大（>12m 俯视像平顶）');process.exit(1);}
console.log('  \u2713 背坡收进 bp='+bpBack+'m / tp='+tpBack+'m，脊面进深 '+depth.toFixed(1)+'m');
NODE
[ $? -eq 0 ] || fail=1

echo
if [ "$fail" -eq 0 ]; then echo "全部通过 ✓"; else echo "有检查未通过 ✗"; exit 1; fi
