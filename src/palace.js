// palace.js —— 卢浮宫三翼（黎塞留/德农/叙利）+ 孟莎屋顶、老虎窗、烟囱、亭阁与钟阁
import * as THREE from 'three';
import { C, TAU, rnd, rng, rndInt, pick, mergeGeos, paint, boxG, rboxG, sphG, cylG, coneG, atG, hangG, meshOf, V3, clamp, lerp, stoneTexture, roofTexture, windowSheenTexture, uvFromBounds } from './base.js';

const DEPTH = 26;
const WALL_H = 22;      // 檐口高度
const ROOF_H = 7.6;

// 四棱台（孟莎屋顶/四坡顶体块）：面朝向按外法线排，否则屋面会一片死黑
function prismG(b, t, y0, y1) {
  const [bx0, bz0, bx1, bz1] = b;
  const [tx0, tz0, tx1, tz1] = t;
  const v = [
    [bx0, y0, bz0], [bx1, y0, bz0], [bx1, y0, bz1], [bx0, y0, bz1],
    [tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1],
  ];
  // 侧面：[底i, 底j, 顶j, 顶i] → 三角形 (bi, ti, tj) 与 (bi, tj, bj)
  const sides = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [], uv = [];
  for (const [bi, bj, tj, ti] of sides) {
    for (const idx of [bi, ti, tj, bi, tj, bj]) pos.push(...v[idx]);
    uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
  }
  for (const idx of [4, 6, 5, 4, 7, 6]) pos.push(...v[idx]);   // 顶面：绕序必须给 +y 法线（原来给成 -y，俯视看屋顶是镂空的）
  uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  for (const idx of [0, 1, 2, 0, 2, 3]) pos.push(...v[idx]);   // 底面：绕序必须给 -y 法线（原来给成 +y，仰视能看穿屋顶内部）
  uv.push(0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  return g;
}

// 拱形（窗洞/门洞）外形
function archPath(w, h) {
  const r = w / 2;
  const s = new THREE.Path();
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}
function archShape(w, h) {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}
function frameShape(w, h, t) {
  const s = new THREE.Shape();
  const W = w / 2 + t, r = W, H = h + t;
  s.moveTo(-W, -t);
  s.lineTo(-W, H - r);
  s.absarc(0, H - r, r, Math.PI, 0, true);
  s.lineTo(W, -t);
  s.closePath();
  s.holes.push(archPath(w, h));   // 洞必须是 Path 对象，不能是点数组
  return s;
}

// 一翼的主体（本地坐标：x ∈ [0,L]，立面在 z=0 朝 +z，体块往 -z 延伸）
function buildWingLocal({ L, bay = 8.2 }) {
  const stone = [], glass = [], roof = [], pots = [], litSpots = [];
  const zB = -DEPTH;
  const stoneCol = new THREE.Color(C.stone);
  const glassCol = new THREE.Color(0xe4eef6);

  // 台基（粗石）
  stone.push(paint(boxG(L + 1.6, 1.4, DEPTH + 1.4, L / 2, 0.7, zB / 2 - 0.1), new THREE.Color(C.stoneDark)));
  // 主体墙
  stone.push(paint(boxG(L, WALL_H - 1.4, DEPTH, L / 2, 1.4 + (WALL_H - 1.4) / 2, zB / 2), stoneCol.clone().offsetHSL(0, 0, -0.02)));

  const nBays = Math.max(4, Math.round(L / bay));
  const bw = L / nBays;
  const baysX = [];
  for (let i = 0; i < nBays; i++) baysX.push(bw * (i + 0.5));

  // 底层拱窗 + 上层两排方窗 + 壁柱
  // 注意：墙体是 z∈[-DEPTH,0] 的实心盒，窗必须做在墙面之前（z>0），否则整排窗被墙吞掉
  for (let i = 0; i < nBays; i++) {
    const cx = baysX[i];
    // 底层拱窗：暗龛 → 玻璃 → 石拱框
    const dark = new THREE.ExtrudeGeometry(archShape(3.5, 5.8), { depth: 0.07, bevelEnabled: false, curveSegments: 10 });
    dark.translate(cx, 1.9, 0.005);
    stone.push(paint(dark, new THREE.Color(0x3a4048)));
    const gl = new THREE.ExtrudeGeometry(archShape(3.1, 5.4), { depth: 0.11, bevelEnabled: false, curveSegments: 10 });
    gl.translate(cx, 1.9, 0.07);
    uvFromBounds(gl, cx - 1.55, 1.9, 3.1, 5.4);
    glass.push(paint(gl, glassCol));
    // 竖向中棂
    stone.push(paint(boxG(0.16, 5.0, 0.34, cx, 4.4, 0.2), stoneCol.clone().offsetHSL(0, 0, 0.06)));
    const fr = new THREE.ExtrudeGeometry(frameShape(3.1, 5.4, 0.55), { depth: 0.44, bevelEnabled: false, curveSegments: 10 });
    fr.translate(cx, 1.9, -0.02);
    stone.push(paint(fr, stoneCol.clone().offsetHSL(0, 0, 0.05)));
    litSpots.push([cx, 4.5, 0.12, 2.7, 4.5]);

    for (const [wy, hh, ww] of [[11.2, 4.0, 2.7], [16.4, 3.2, 2.5]]) {
      const fw = ww + 0.8;
      stone.push(paint(boxG(ww + 0.36, hh + 0.36, 0.09, cx, wy, 0.045), new THREE.Color(0x3a4048)));
      const gg = new THREE.ExtrudeGeometry(new THREE.Shape([
        new THREE.Vector2(-ww / 2, wy - hh / 2), new THREE.Vector2(ww / 2, wy - hh / 2),
        new THREE.Vector2(ww / 2, wy + hh / 2), new THREE.Vector2(-ww / 2, wy + hh / 2)]), { depth: 0.1, bevelEnabled: false });
      gg.translate(cx, 0, 0.09);
      uvFromBounds(gg, cx - ww / 2, wy - hh / 2, ww, hh);
      glass.push(paint(gg, glassCol.clone().offsetHSL(0, 0.02, rnd(-0.03, 0.03))));
      // 玻璃分格：一竖一横（十字棂）
      stone.push(paint(boxG(0.13, hh, 0.30, cx, wy, 0.21), stoneCol.clone().offsetHSL(0, 0, 0.07)));
      stone.push(paint(boxG(ww, 0.13, 0.30, cx, wy + hh * 0.06, 0.21), stoneCol.clone().offsetHSL(0, 0, 0.07)));
      litSpots.push([cx, wy, 0.15, ww * 0.9, hh * 0.9]);
      // 石框四条 + 窗台，整体前凸出墙面
      stone.push(paint(boxG(fw, 0.44, 0.54, cx, wy + hh / 2 + 0.22, 0.18), stoneCol.clone().offsetHSL(0, 0, 0.06)));
      stone.push(paint(boxG(fw + 0.55, 0.30, 0.80, cx, wy - hh / 2 - 0.34, 0.22), stoneCol.clone().offsetHSL(0, 0, 0.03)));
      stone.push(paint(boxG(0.46, hh + 0.9, 0.46, cx - ww / 2 - 0.22, wy, 0.16), stoneCol.clone().offsetHSL(0, 0, 0.06)));
      stone.push(paint(boxG(0.46, hh + 0.9, 0.46, cx + ww / 2 + 0.22, wy, 0.16), stoneCol.clone().offsetHSL(0, 0, 0.06)));
    }
    // 壁柱（前凸，别埋在墙里）
    if (i > 0) {
      const px = bw * i;
      stone.push(paint(boxG(1.0, WALL_H - 9.4, 0.72, px, 9.4 + (WALL_H - 9.4) / 2, 0.12), stoneCol.clone().offsetHSL(0, 0, 0.02)));
      stone.push(paint(boxG(1.5, 0.52, 0.98, px, 9.3, 0.2), stoneCol.clone().offsetHSL(0, 0, 0.07)));
      stone.push(paint(boxG(1.5, 0.44, 0.98, px, 20.3, 0.2), stoneCol.clone().offsetHSL(0, 0, 0.07)));
    }
  }
  // 层线
  for (const [y, h2, prot] of [[8.6, 0.5, 0.55], [14.3, 0.36, 0.42], [WALL_H - 1.2, 0.55, 0.6]]) {
    stone.push(paint(boxG(L + 0.6, h2, prot * 2, L / 2, y, -prot / 2), stoneCol.clone().offsetHSL(0, 0, 0.06)));
  }
  // 檐口 + 女儿墙
  stone.push(paint(boxG(L + 2.4, 1.0, 2.6, L / 2, WALL_H + 0.5, -0.5), stoneCol.clone().offsetHSL(0, 0, 0.08)));
  stone.push(paint(boxG(L + 1.2, 0.9, 1.0, L / 2, WALL_H + 1.4, -0.4), stoneCol.clone().offsetHSL(0, 0, 0.02)));

  // 孟莎屋顶：真正的两段坡（陡下坡 ≈41° + 缓上坡 ≈18° + 顶部脊面）
  // 之前是一层棱台、平顶深 22m（占进深 27m 的 81%），俯视就是一大块灰平板 —— 看起来像"屋顶没了"
  const yEave = WALL_H + 0.9, yBreak = WALL_H + 4.4, yRidge = WALL_H + ROOF_H;
  const bp = [2.0, zB + 2.8, L - 2.0, -3.4];              // 断檐：后侧也收 3.4m，保证背坡可见
  const tp = [3.0, zB + 5.0, L - 3.0, -13.2];             // 顶部脊面（进深 7.8m）
  roof.push(paint(prismG([0, zB - 0.6, L, 0.6], bp, yEave, yBreak), new THREE.Color(C.roof)));
  roof.push(paint(prismG(bp, tp, yBreak, yRidge), new THREE.Color(C.roof).offsetHSL(0, 0, 0.035)));   // 上下坡同材质只微差，避免出现浅色平板带
  // 断檐线（金属压条）与脊线：让屋面读成分段的金属屋面，而不是一整块平板
  const seam = new THREE.Color(0x3d4d61);
  roof.push(paint(boxG(L - 3.6, 0.22, 0.36, L / 2, yBreak + 0.05, -3.4), seam));
  roof.push(paint(boxG(L - 5.6, 0.24, 0.4, L / 2, yRidge + 0.06, -13.2), seam));
  roof.push(paint(boxG(L - 5.6, 0.24, 0.4, L / 2, yRidge + 0.06, zB + 5.0), seam));
  // 老虎窗（沿前坡）
  for (let i = 0; i < nBays; i++) {
    const cx = baysX[i];
    const dy = WALL_H + 2.4, dz = -0.75;
    roof.push(paint(boxG(2.3, 2.1, 2.0, cx, dy, dz + 0.4), new THREE.Color(C.roofLight)));
    roof.push(paint(boxG(1.1, 1.35, 0.3, cx, dy - 0.2, dz + 1.36), new THREE.Color(0x3f4a57)));
    roof.push(paint(prismG([cx - 1.35, dz - 0.7, cx + 1.35, dz + 1.5], [cx - 0.9, dz - 0.3, cx + 0.9, dz + 1.1], dy + 1.05, dy + 1.75), new THREE.Color(C.roofDark)));
  }
  // 烟囱（屋脊后侧一排 + 陶土烟囱帽）
  // 屋脊装饰（小尖饰，一排）—— 必须坐在脊面上：yRidge 就是脊面高度
  // 原来写成 WALL_H+ROOF_H+0.65/+1.35（比脊面高 0.65/1.35），整排悬空 0.37~0.77m，沿屋脊看就是一条浮空的横条
  const nCre = Math.max(4, Math.round(L / 5.5));
  for (let i = 0; i < nCre; i++) {
    const cx = L * (i + 0.5) / nCre;
    const cz = -17.1;   // 顶部脊面中间（脊面 z ∈ [-21.0, -13.2]）
    roof.push(paint(boxG(0.5, 0.55, 0.5, cx, yRidge + 0.18 + 0.275, cz), new THREE.Color(C.roofLight)));   // 坐在脊面压条上，不与压条穿插
    roof.push(paint(atG(new THREE.ConeGeometry(0.42, 1.15, 4), [cx, yRidge + 0.18 + 0.55 + 0.56, cz], [0, Math.PI / 4, 0]), new THREE.Color(C.roofLight)));
  }

  const nCh = Math.max(3, Math.round(L / 13));
  for (let i = 0; i < nCh; i++) {
    const cx = L * (i + 0.5) / nCh;
    const cz = zB + 6.0;
    const h3 = rnd(2.4, 3.6);
    roof.push(paint(boxG(2.6, h3, 1.6, cx, WALL_H + ROOF_H - 0.6 + h3 / 2, cz), new THREE.Color(C.stoneMid)));
    for (let k = -1; k <= 1; k++) {
      pots.push(paint(cylG(0.28, 0.34, 0.9, 8, cx + k * 0.66, WALL_H + ROOF_H - 0.6 + h3 + 0.45, cz), new THREE.Color(0xb06a4a)));
    }
  }
  return { stone, glass, roof, pots, litSpots, nBays, baysX, bw };
}

export function buildPalace() {
  const group = new THREE.Group();
  const stoneTex = stoneTexture(); stoneTex.repeat.set(8, 2);
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex, roughness: 0.92, metalness: 0 });
  const glassMap = windowSheenTexture();
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: glassMap, roughness: 0.14, metalness: 0.28, envMapIntensity: 2.7, emissive: new THREE.Color(0x8fb4cc), emissiveIntensity: 0.12 });
  const roofTex = roofTexture(); roofTex.repeat.set(14, 4);
  // 板岩：粗糙度降下来 + 环境反射提上去 —— 黄昏屋顶靠反射亮天发光，而不是靠整体倍率
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: roofTex, roughness: 0.74, metalness: 0.05, envMapIntensity: 0.7 });
  const potMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

  const stoneParts = [], glassParts = [], roofParts = [], potParts = [], litAll = [];

  // --- 三翼 ---
  const wings = [
    { name: 'richelieu', L: 152, pos: [-86, 0, -44], rot: 0 },
    { name: 'denon', L: 152, pos: [66, 0, 44], rot: Math.PI },
    { name: 'sully', L: 136, pos: [66, 0, -68], rot: -Math.PI / 2 },
  ];
  for (const w of wings) {
    const b = buildWingLocal({ L: w.L, bay: 8.2 });
    const m = new THREE.Matrix4().makeRotationY(w.rot);
    m.setPosition(w.pos[0], w.pos[1], w.pos[2]);
    for (const arr of [b.stone, b.glass, b.roof, b.pots]) for (const g of arr) g.applyMatrix4(m);
    stoneParts.push(...b.stone); glassParts.push(...b.glass); roofParts.push(...b.roof); potParts.push(...b.pots);
    for (const [x, y, z, sw, sh] of b.litSpots) litAll.push([new THREE.Matrix4().makeRotationY(w.rot).setPosition(w.pos[0], w.pos[1], w.pos[2]).multiply(new THREE.Matrix4().makeTranslation(x, y, z)), sw, sh]);
  }

  // --- 亭阁（世界坐标）---
  const pav = (x, z, w, d, h, roofH, dome, clock, ry = 0) => {
    const loc = [];
    loc.push(paint(boxG(w + 1.4, 1.5, d + 1.4, 0, 0.75, 0), new THREE.Color(C.stoneDark)));
    loc.push(paint(boxG(w, h - 1.5, d, 0, 1.5 + (h - 1.5) / 2, 0), new THREE.Color(C.stone)));
    for (const [yy, hh] of [[7.8, 0.5], [h * 0.62, 0.42]]) loc.push(paint(boxG(w + 0.9, hh, d + 0.9, 0, yy, 0), new THREE.Color(C.stoneMid)));
    loc.push(paint(boxG(w + 2.2, 1.15, d + 2.2, 0, h + 0.55, 0), new THREE.Color(C.stoneLight)));
    // 圆窗（牛眼窗）：石环 + 深色玻璃盘
    const wy2 = h * 0.70;   // 原来 0.78 与钟面(0.86)只差 2.2m，会撞在一起
    for (const [ox, oz, isX] of [[0, d / 2 + 0.1, 0], [0, -d / 2 - 0.1, 0], [w / 2 + 0.1, 0, 1], [-w / 2 - 0.1, 0, 1]]) {
      loc.push(paint(atG(new THREE.TorusGeometry(1.05, 0.26, 7, 16), [ox, wy2, oz], [0, isX ? Math.PI / 2 : 0, 0]), new THREE.Color(C.stoneLight)));
      loc.push(paint(atG(new THREE.CylinderGeometry(1.0, 1.0, 0.28, 14), [ox, wy2, oz], isX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]), new THREE.Color(0x4a6a80)));
    }
    // 亭阁开窗：每面两排 × 三扇（暗龛 + 玻璃 + 石框）
    for (const [ox, oz, isX] of [[0, d / 2, 0], [0, -d / 2, 0], [w / 2, 0, 1], [-w / 2, 0, 1]]) {
      for (let k = -1; k <= 1; k++) {
        for (const wy of [h * 0.36, h * 0.54]) {
          const px = isX ? ox : k * w * 0.24;
          const pz = isX ? k * d * 0.24 : oz;
          const ww2 = 2.3, hh2 = 3.1;
          const nx = isX ? Math.sign(ox) : 0, nz = isX ? 0 : Math.sign(oz);
          // 暗龛必须比玻璃"薄"，否则 1.1m 厚的暗盒会把玻璃整块盖住（曾把亭阁窗做成深色板）
          loc.push(paint(boxG(isX ? 0.12 : ww2 + 0.5, hh2 + 0.5, isX ? ww2 + 0.5 : 0.12, px + nx * 0.05, wy, pz + nz * 0.05), new THREE.Color(0x3a4048)));
          loc.push(paint(boxG(isX ? 0.34 : ww2, hh2, isX ? ww2 : 0.34, px + nx * 0.2, wy, pz + nz * 0.2), new THREE.Color(0xe4eef6)));
          loc.push(paint(boxG(isX ? 0.30 : ww2 + 0.9, 0.42, isX ? ww2 + 0.9 : 0.30, px + nx * 0.28, wy + hh2 / 2 + 0.2, pz + nz * 0.28), new THREE.Color(C.stoneLight)));
          loc.push(paint(boxG(isX ? 0.36 : ww2 + 1.1, 0.3, isX ? ww2 + 1.1 : 0.36, px + nx * 0.3, wy - hh2 / 2 - 0.32, pz + nz * 0.3), new THREE.Color(C.stoneLight)));
          loc.push(paint(boxG(isX ? 0.28 : 0.14, hh2, isX ? 0.14 : 0.28, px + nx * 0.34, wy, pz + nz * 0.34), new THREE.Color(C.stoneLight)));
        }
      }
    }
    const g = new THREE.Group();
    const sm = new THREE.Mesh(mergeGeos(loc), stoneMat);
    sm.castShadow = true; sm.receiveShadow = true;
    g.add(sm);
    // 陡峭的四坡顶 / 穹顶
    const rf = [];
    if (dome) {
      rf.push(paint(atG(new THREE.SphereGeometry(w * 0.40, 22, 14, 0, TAU, 0, Math.PI * 0.5), [0, h + 2.6, 0]), new THREE.Color(C.roof)));
      rf.push(paint(cylG(w * 0.43, w * 0.47, 2.6, 18, 0, h + 1.3, 0), new THREE.Color(C.roofDark)));
      rf.push(paint(cylG(w * 0.46, w * 0.46, 0.5, 18, 0, h + 2.75, 0), new THREE.Color(C.stoneLight)));
      rf.push(paint(sphG(0.62, 0, h + 2.6 + w * 0.40, 0, 10), new THREE.Color(C.gold)));
      rf.push(paint(atG(cylG(0.07, 0.07, 2.2, 6, 0, 0, 0), [0, h + 2.6 + w * 0.40 + 1.1, 0]), new THREE.Color(0xb9a888)));
    } else {
      rf.push(paint(prismG([-w / 2 - 0.7, -d / 2 - 0.7, w / 2 + 0.7, d / 2 + 0.7], [-w * 0.14, -d * 0.14, w * 0.14, d * 0.14], h + 1.1, h + 1.1 + roofH), new THREE.Color(C.roof)));
      rf.push(paint(boxG(w * 0.3, 1.5, d * 0.3, 0, h + roofH + 1.0, 0), new THREE.Color(C.roofDark)));
      for (const ox of [-w * 0.28, w * 0.28]) {
        rf.push(paint(boxG(2.0, 1.9, 1.8, ox, h + 3.0, d / 2 - 1.2), new THREE.Color(C.roofLight)));
        rf.push(paint(boxG(0.95, 1.2, 0.3, ox, h + 2.85, d / 2 - 0.25), new THREE.Color(0x3f4a57)));
      }
    }
    const rm = new THREE.Mesh(mergeGeos(rf), roofMat);
    rm.castShadow = true; rm.receiveShadow = true;
    g.add(rm);
    if (clock) {
      const cf = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.35, 20), new THREE.MeshStandardMaterial({ color: 0xf7f1e2, roughness: 0.6, emissive: new THREE.Color(0xffe9bd), emissiveIntensity: 0 }));
      cf.rotation.z = Math.PI / 2;
      cf.position.set(-d / 2 - 0.2, h * 0.885, 0);
      const hands = new THREE.Mesh(mergeGeos([
        boxG(0.16, 1.15, 0.2, 0, 0.5, 0),
        boxG(0.9, 0.15, 0.2, 0.4, 0, 0),
      ]), new THREE.MeshStandardMaterial({ color: 0x2f3338 }));
      hands.rotation.z = Math.PI / 2;
      hands.position.set(-d / 2 - 0.4, h * 0.885, 0);
      g.add(cf, hands);
      g.userData.clock = cf.material;
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.name = 'pavilion-' + x + '-' + z;
    group.add(g);
    return g;
  };

  // 西端两座亭阁（弗洛拉/马尔桑，夹住通往杜乐丽的开口）+ 两翼中段亭阁 + 东侧钟阁
  const clockPav = pav(-86, -44 - DEPTH / 2 + 6, 24, 26, 27, 9.5, false, true, 0);
  pav(-86, 44 + DEPTH / 2 - 6, 24, 26, 27, 9.5, true, false, 0);
  pav(10, -44 - DEPTH / 2 + 6, 22, 26, 25.5, 8.8, true, false, 0);
  pav(10, 44 + DEPTH / 2 - 6, 22, 26, 25.5, 8.8, false, false, 0);

  // --- 东翼后面的方形宫（叙利馆背后的方形庭院体块，给天际线层次）---
  const back = [], backRoof = [];
  back.push(paint(boxG(54, 20, 120, 122, 10, 0), new THREE.Color(C.stoneMid)));
  // 屋顶必须走板岩材质：原来并入 stoneMat，俯视看就是一块浅灰平顶（用户报的房子没有屋顶）
  // 原来顶面收到 46x110，等于一个大平顶（用户报的屋里多了一块平台）；现在收成一条脊
  backRoof.push(paint(prismG([96, -58, 148, 58], [120, -22, 124, 22], 20, 28), new THREE.Color(C.roofDark)));
  for (let i = 0; i < 7; i++) {
    // 烟囱坐在屋顶顶面(y=28)上：原来放在 y=29 而屋面在 27，整排悬空 2m（用户报的这里少了一个面）
    backRoof.push(paint(boxG(3.0, 3.4, 2.0, 122, 28 + 1.55, -18 + i * 6), new THREE.Color(C.stoneMid)));
  }
  const backMesh = new THREE.Mesh(mergeGeos(back), stoneMat);
  backMesh.castShadow = true; backMesh.receiveShadow = true;
  const backRoofMesh = new THREE.Mesh(mergeGeos(backRoof), roofMat);
  backRoofMesh.castShadow = true; backRoofMesh.receiveShadow = true;
  group.add(backMesh, backRoofMesh);

  // --- 合并落地 ---
  const stoneMesh = new THREE.Mesh(mergeGeos(stoneParts), stoneMat);
  stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
  const glassMesh = new THREE.Mesh(mergeGeos(glassParts), glassMat);
  glassMesh.castShadow = false; glassMesh.receiveShadow = true;
  const roofMesh = new THREE.Mesh(mergeGeos(roofParts), roofMat);
  roofMesh.castShadow = true; roofMesh.receiveShadow = true;
  const potMesh = new THREE.Mesh(mergeGeos(potParts), potMat);
  potMesh.castShadow = true;
  group.add(stoneMesh, glassMesh, roofMesh, potMesh);

  // --- 夜间亮窗（instanceColor 随机暖色，白天整体透明隐藏）---
  const litMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const litGeo = new THREE.PlaneGeometry(1, 1);
  const chosen = litAll.filter(() => rng() < 0.30);
  const litMesh = new THREE.InstancedMesh(litGeo, litMat, chosen.length);
  const mm = new THREE.Matrix4(), col = new THREE.Color();
  const warm = [0xf0b96f, 0xe8a552, 0xf6d39a, 0xefbe6a, 0xffd9a0];
  const cool = [0xcfe2f2, 0xbfd8ea, 0xe6eef6];
  // 每扇窗自己的亮度/相位/速度/是否冷光 → 灯不整齐划一，还会慢呼吸与偶发明灭
  const litInfo = [];
  chosen.forEach(([mat, sw, sh], i) => {
    mm.copy(mat).multiply(new THREE.Matrix4().makeScale(sw, sh, 1));
    litMesh.setMatrixAt(i, mm);
    const isCool = rng() < 0.16;
    const info = {
      hex: pick(isCool ? cool : warm),
      base: rnd(0.55, 1.0),
      phase: rnd(0, TAU),
      speed: rnd(0.25, 1.1),
      toggle: 0,
      off: false,
    };
    litInfo.push(info);
    col.setHex(info.hex).multiplyScalar(info.base);
    litMesh.setColorAt(i, col);
  });
  litMesh.instanceMatrix.needsUpdate = true;
  if (litMesh.instanceColor) litMesh.instanceColor.needsUpdate = true;
  litMesh.castShadow = false; litMesh.receiveShadow = false;
  group.add(litMesh);
  const _lc = new THREE.Color();
  function tickLights(t, dt, st) {
    if (!litMesh.count || st.lampF < 0.02) return;
    for (let i = 0; i < litInfo.length; i++) {
      const L = litInfo[i];
      let lvl = L.base * (0.80 + 0.20 * Math.sin(t * L.speed + L.phase));
      if (L.toggle > 0) { L.toggle -= dt; lvl *= L.off ? 0.22 : 1.0; }
      else if (rng() < 0.02) { L.toggle = 0.5 + rng() * 2.0; L.off = rng() < 0.5; }
      _lc.setHex(L.hex).multiplyScalar(lvl * st.lampF);
      litMesh.setColorAt(i, _lc);
    }
    litMesh.instanceColor.needsUpdate = true;
  }

  const clockMat = clockPav.userData.clock;

  return {
    group,
    update(st) {
      litMat.opacity = st.lampF * 0.84;
      if (clockMat) clockMat.emissiveIntensity = st.lampF * 0.9;
      const kStone = lerp(0.30, 1.0, st.dayF) + st.lampF * 0.16;
      const kRoof = lerp(0.56, 1.0, st.dayF) + st.goldenF * 0.16 + st.lampF * 0.14;   // 屋顶曾整片死黑 [24,18,19]
      for (const m of [stoneMat, potMat]) m.color.setHex(0xffffff).multiplyScalar(kStone);
      roofMat.color.setHex(0xffffff).multiplyScalar(kRoof);
      glassMat.color.setHex(0xffffff).multiplyScalar(lerp(0.42, 1.0, st.dayF));
      glassMat.emissiveIntensity = 0.05 + st.dayF * 0.03 + st.lampF * 0.06;   // 背光窗不再是纯黑洞，但也别发白
    },
    tick(t, dt, st) { tickLights(t, dt, st); },
  };
}
