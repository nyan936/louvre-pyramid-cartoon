// base.js —— 工具、调色板、程序化纹理、几何助手、昼夜状态模型
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

// 固定种子：rebuild 后画面可复现
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = mulberry32(20261012);
export const rnd = (a = 0, b = 1) => a + (b - a) * rng();
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ---------------- 卡通调色板 ----------------
export const C = {
  stone: 0xe6dcc4, stoneLight: 0xf4efe2, stoneMid: 0xd8cdb4, stoneDark: 0xc4b596,
  sand: 0xded0b0,
  roof: 0x8a9aab, roofDark: 0x6a7d92, roofLight: 0xa0b0c0,
  metal: 0xcfd9de, metalDark: 0x93a3ad,
  glassTint: 0xbfe6f4,
  waterBody: 0x237fa6,
  waterDeep: 0x1d6f93,
  hedge: 0x63a94e, hedgeDark: 0x4a8a3c,
  grass: 0x74b855, grassDark: 0x5c9a44,
  trunk: 0x8a6244, trunkDark: 0x6d4c35,
  leafA: 0x79bf5c, leafB: 0x62ad4d, leafC: 0x8fca6a,
  bronze: 0x6f8f7e, // 铜绿雕像
  gold: 0xe8bb63,
  night: 0x0d1a33,
  lampWarm: 0xffcf8a,
  skin: 0xf6cda6, skin2: 0xe0ac83, skin3: 0xc98d63,
  cloth: [0xe8604f, 0x4a86d8, 0xf2c14e, 0x8f5fc0, 0x3fb08a, 0xf2f0e8, 0xe97cae, 0x4d5b78, 0xefa24c, 0x63c3d8],
  hair: [0x3a2a22, 0x5a3d2a, 0x8a6a4a, 0x2b2b33, 0xc9a06a, 0x6b4a3a],
  pigeon: [0x8a93a6, 0x6f7889, 0xa9b1c0],
};

// ---------------- 程序化纹理 ----------------
function canvas2d(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// 广场铺装：暖石底 + 石板缝 + 以金字塔为中心的放射扇形与同心环（实景铺装就是放射状）
export function pavingTexture() {
  return canvas2d(1024, 1024, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = hex(C.stoneMid); g.fillRect(0, 0, w, h);
    // 石板底色抖动
    const S = 32;
    for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) {
      const v = rnd(-0.05, 0.05);
      const c = new THREE.Color(C.stoneMid).offsetHSL(0, 0, v * 0.5);
      g.fillStyle = '#' + c.getHexString();
      g.fillRect(x, y, S, S);
    }
    // 石板缝
    g.strokeStyle = 'rgba(150,132,104,0.35)'; g.lineWidth = 1.5;
    for (let y = 0; y <= h; y += S) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += S) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // 放射扇形（每 6°）+ 同心环
    g.save(); g.translate(cx, cy);
    for (let a = 0; a < 360; a += 6) {
      const rad = a * Math.PI / 180;
      const wd = (a % 30 === 0) ? 3 : 1.6;
      g.strokeStyle = (a % 30 === 0) ? 'rgba(146,126,96,0.5)' : 'rgba(160,142,112,0.28)';
      g.lineWidth = wd;
      g.beginPath(); g.moveTo(Math.cos(rad) * 26, Math.sin(rad) * 26);
      g.lineTo(Math.cos(rad) * 512, Math.sin(rad) * 512); g.stroke();
    }
    for (const r of [70, 116, 170, 250, 340, 430]) {
      g.strokeStyle = 'rgba(150,132,104,0.34)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    }
    // 深浅石带（卡通感的色块节奏）
    for (const [r0, r1, col] of [[70, 78, 'rgba(196,174,136,0.55)'], [170, 178, 'rgba(196,174,136,0.5)'], [340, 348, 'rgba(196,174,136,0.45)']]) {
      g.strokeStyle = col; g.lineWidth = r1 - r0;
      g.beginPath(); g.arc(0, 0, (r0 + r1) / 2, 0, TAU); g.stroke();
    }
    g.restore();
    // 广场边缘往外的哑光收缩 + 金字塔底部的柔和接地阴影
    const rg = g.createRadialGradient(cx, cy, 40, cx, cy, 512);
    rg.addColorStop(0, 'rgba(120,104,80,0.16)'); rg.addColorStop(0.30, 'rgba(120,104,80,0)');
    rg.addColorStop(0.86, 'rgba(110,96,74,0)'); rg.addColorStop(1, 'rgba(110,96,74,0.20)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // 细颗粒
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rndInt(120, 220)},${rndInt(110, 200)},${rndInt(90, 170)},${rnd(0.02, 0.07)})`;
      g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(1, 3));
    }
  });
}

// 宫殿石墙：横向砌缝 + 竖向石块 + 轻微污渍
export function stoneTexture() {
  return canvas2d(512, 512, (g, w, h) => {
    g.fillStyle = hex(C.stone); g.fillRect(0, 0, w, h);
    const rows = 16, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 34;
      for (let x = -40; x < w; x += 68) {
        const c = new THREE.Color(C.stone).offsetHSL(rnd(-0.01, 0.01), rnd(-0.03, 0.03), rnd(-0.035, 0.035));
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x + off + 1, r * rh + 1, 66, rh - 2);
      }
    }
    g.strokeStyle = 'rgba(150,130,100,0.20)'; g.lineWidth = 2;
    for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * rh); g.lineTo(w, r * rh); g.stroke(); }
    // 雨渍
    for (let i = 0; i < 40; i++) {
      const x = rnd(0, w), y = rnd(0, h * 0.6), len = rnd(20, 90);
      const grd = g.createLinearGradient(x, y, x, y + len);
      grd.addColorStop(0, 'rgba(120,104,80,0.10)'); grd.addColorStop(1, 'rgba(120,104,80,0)');
      g.fillStyle = grd; g.fillRect(x, y, rnd(3, 11), len);
    }
  });
}

// 板岩屋顶：横向瓦片层
export function roofTexture() {
  return canvas2d(512, 512, (g, w, h) => {
    g.fillStyle = hex(C.roof); g.fillRect(0, 0, w, h);
    const rows = 22, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const c = new THREE.Color(C.roof).offsetHSL(rnd(-0.012, 0.012), rnd(-0.05, 0.05), rnd(-0.13, 0.11));
      g.fillStyle = '#' + c.getHexString();
      g.fillRect(0, r * rh, w, rh - 1.5);
      for (let x = 0; x < w; x += 26) {
        g.fillStyle = `rgba(255,255,255,${rnd(0.02, 0.12)})`;
        g.fillRect(x + (r % 2) * 13, r * rh, 24, rh - 2);
      }
      g.fillStyle = 'rgba(30,38,50,0.26)';   // 瓦垄暗缝：避免屋面读成纯色平板
      g.fillRect(0, r * rh + rh - 2.5, w, 2.5);
    }
  });
}

// 玻璃幕墙高光：斜向柔光带（让玻璃一眼读成"玻璃"而不是灰板）
export function glassSheenTexture() {
  const t = canvas2d(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(214,238,252,0.34)'; g.fillRect(0, 0, w, h);
    const band = (x0, y0, x1, y1, wid, a) => {
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(w / 2, h / 2); g.rotate(-0.62); g.translate(-w / 2, -h / 2);
      g.fillStyle = grd; g.fillRect(-w * 0.2, h * 0.5 - wid / 2, w * 1.4, wid);
      g.restore();
    };
    band(0, 0, 0, 0, 200, 0.55);
    band(0, 0, 0, 0, 78, 0.42);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 四坡顶（hip roof）：底面对齐楼体、带底面 —— 远景楼房用它，避免锥体与长方形楼体对不齐
export function hipRoofG(b, t, y0, y1) {
  const [bx0, bz0, bx1, bz1] = b, [tx0, tz0, tx1, tz1] = t;
  const v = [
    [bx0, y0, bz0], [bx1, y0, bz0], [bx1, y0, bz1], [bx0, y0, bz1],
    [tx0, y1, tz0], [tx1, y1, tz0], [tx1, y1, tz1], [tx0, y1, tz1],
  ];
  const pos = [], uv = [];
  for (const [bi, bj, tj, ti] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
    for (const i of [bi, ti, tj, bi, tj, bj]) pos.push(...v[i]);
    uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
  }
  for (const i of [4, 6, 5, 4, 7, 6]) pos.push(...v[i]);        // 顶面 +y（原来 -y → 楼房俯视镂空）
  uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  for (const i of [0, 1, 2, 0, 2, 3]) pos.push(...v[i]);        // 底面 -y
  uv.push(0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.computeVertexNormals();
  return g;
}

// 水波法线图：用整数频率的正弦叠加，天然可平铺、无接缝（R/G 存二维梯度）
export function waterRippleTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const comps = [];
  for (let k = 0; k < 6; k++) {
    comps.push({ fx: Math.round(rnd(1, 5)), fy: Math.round(rnd(1, 5)), ph: rnd(0, TAU), amp: 1 / (k + 1.6) });
  }
  const comps2 = [];
  for (let k = 0; k < 6; k++) {
    comps2.push({ fx: Math.round(rnd(1, 5)), fy: Math.round(rnd(1, 5)), ph: rnd(0, TAU), amp: 1 / (k + 1.6) });
  }
  const evalC = (cs, u, v) => { let s2 = 0; for (const c of cs) s2 += Math.sin(TAU * (c.fx * u + c.fy * v) + c.ph) * c.amp; return s2; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const a = Math.max(-1, Math.min(1, evalC(comps, u, v) * 1.15));
      const b = Math.max(-1, Math.min(1, evalC(comps2, u, v) * 1.15));
      const i = (y * size + x) * 4;
      img.data[i] = 128 + a * 110;
      img.data[i + 1] = 128 + b * 110;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;      // 数据贴图，不做 sRGB 转换
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 门口射灯的光锥：顶点亮、开口端透明
export function lightConeTexture() {
  const t = canvas2d(32, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0.0, 'rgba(255,214,150,0)');
    grd.addColorStop(0.30, 'rgba(255,206,140,0.05)');
    grd.addColorStop(0.68, 'rgba(255,210,150,0.14)');
    grd.addColorStop(0.92, 'rgba(255,226,180,0.30)');
    grd.addColorStop(1.0, 'rgba(255,226,180,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 路灯地面光斑：径向渐变（原来是实心圆盘，边界硬得像贴纸）
export function lightPoolTexture() {
  const t = canvas2d(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.0, 'rgba(255,206,140,0.95)');
    grd.addColorStop(0.30, 'rgba(255,196,124,0.46)');
    grd.addColorStop(0.62, 'rgba(255,186,112,0.16)');
    grd.addColorStop(1.0, 'rgba(255,180,110,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 远景城市楼房的窗格（程序化，一次贴图让"白盒子"读成"房子"）
export function cityFacadeTexture() {
  return canvas2d(128, 128, (g, w, h) => {
    g.fillStyle = '#e7dcc4'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const x = 8 + c * 24, y = 10 + r * 28;
        g.fillStyle = `rgba(58,78,100,${rnd(0.5, 0.9)})`;
        g.fillRect(x + rnd(-0.6, 0.6), y, 13, 17);
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(x, y, 13, 4);
      }
    }
    g.fillStyle = 'rgba(120,104,80,0.18)';
    for (let r = 1; r < 4; r++) g.fillRect(0, r * 28 + 22, w, 3);
  });
}

// 窗户玻璃：竖向天光渐变（上亮下深），让窗读成"反光的玻璃"而不是黑块
export function windowSheenTexture() {
  const t = canvas2d(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(206,228,246,1)');
    grd.addColorStop(0.50, 'rgba(160,192,218,1)');
    grd.addColorStop(1, 'rgba(104,136,166,1)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(-w, h * 0.66); g.lineTo(w * 0.5, -h); g.lineTo(w * 0.78, -h); g.lineTo(-w * 0.72, h * 0.66); g.closePath(); g.fill();
    g.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 按世界/局部位置重算 uv（ExtrudeGeometry 的 uv 是形状坐标，直接用会把贴图拉成一条）
export function uvFromBounds(g, x0, y0, w, h) {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - x0) / w;
    uv[i * 2 + 1] = (pos.getY(i) - y0) / h;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 草坪 / 树篱
export function grassTexture(base = C.grass) {
  return canvas2d(256, 256, (g, w, h) => {
    g.fillStyle = hex(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const c = new THREE.Color(base).offsetHSL(rnd(-0.03, 0.03), rnd(-0.1, 0.1), rnd(-0.13, 0.13));
      g.strokeStyle = '#' + c.getHexString(); g.lineWidth = rnd(1, 2.2);
      const x = rnd(0, w), y = rnd(0, h), a = rnd(-0.5, 0.5);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 5, y - rnd(3, 8)); g.stroke();
    }
  });
}

// 水面下的池底瓷砖（水是半透的，池底给一点图案才不空）
export function poolFloorTexture() {
  return canvas2d(256, 256, (g, w, h) => {
    g.fillStyle = '#bfe9f2'; g.fillRect(0, 0, w, h);
    const S = 32;
    for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) {
      const odd = ((x / S) + (y / S)) % 2 === 0;
      g.fillStyle = odd ? '#a9dcea' : '#c9eef5';
      g.fillRect(x, y, S - 1, S - 1);
    }
  });
}

// ---------------- 几何助手 ----------------
// 注意：box 系一律在工厂里 translate 到位（历史上忘 translate 导致全场景构件静默堆在原点的坑）
export function boxG(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
export function rboxG(w, h, d, x = 0, y = 0, z = 0, r = 0.25, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.49));
  g.translate(x, y, z);
  return g;
}
export function cylG(rt, rb, h, seg, x = 0, y = 0, z = 0, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y, z);
  return g;
}
export function sphG(r, x = 0, y = 0, z = 0, seg = 12) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));
  g.translate(x, y, z);
  return g;
}
export function coneG(r, h, seg, x = 0, y = 0, z = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  g.translate(x, y, z);
  return g;
}
// 绕枢轴旋转（用于倾斜的屋面/树枝）
export function rotG(g, rx = 0, ry = 0, rz = 0) { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); return g; }
export function scaleG(g, x, y, z) { g.scale(x, y, z); return g; }

// 先绕自身原点旋转、再平移到目标位置（顺序不能反：几何已 translate 过再 rotate 会被甩到别处）
export function atG(g, pos = [0, 0, 0], rot = [0, 0, 0]) {
  if (rot[2]) g.rotateZ(rot[2]);
  if (rot[1]) g.rotateY(rot[1]);
  if (rot[0]) g.rotateX(rot[0]);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}
// 悬挂件：把几何沿 -y 偏移到"从枢轴往下长"，配合 atG 的旋转做四肢
export function hangG(g, len) { g.translate(0, -len / 2, 0); return g; }

// 统一为非索引、属性对齐后合并（ExtrudeGeometry 等非索引几何与 Box 混用会静默失败）
export function mergeGeos(list) {
  const clean = [];
  for (const raw of list) {
    if (!raw) continue;
    const g = raw.index ? raw.toNonIndexed() : raw;
    const keep = new THREE.BufferGeometry();
    keep.setAttribute('position', g.getAttribute('position'));
    const n = g.getAttribute('position').count;
    keep.setAttribute('normal', g.getAttribute('normal') || new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    keep.setAttribute('uv', g.getAttribute('uv') || new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (g.getAttribute('color')) keep.setAttribute('color', g.getAttribute('color'));
    clean.push(keep);
  }
  if (!clean.length) return null;
  const anyColor = clean.some((g) => g.getAttribute('color'));
  if (anyColor) for (const g of clean) {
    if (!g.getAttribute('color')) {
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
  }
  return mergeGeometries(clean, false);
}

// 给几何刷顶点色（配合 vertexColors 材质，一次 draw call 出多色构件）
export function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function meshOf(geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.name) m.name = opts.name;
  return m;
}
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- 昼夜状态 ----------------
export function dayState(hour) {
  const t = (hour - 6) / 12;                 // 6:00 日出 → 18:00 日落
  const azim = t * Math.PI;                  // 东(+x) → 南(+z) → 西(-x)
  const elev = Math.sin(t * Math.PI) * 1.30; // 弧度，正午约 74°
  const se = Math.sin(elev);
  const sunDir = V3(Math.cos(azim) * Math.cos(elev), se, Math.sin(azim) * Math.cos(elev)).normalize();
  const dayF = smoothstep(-0.05, 0.20, se);
  const nightF = 1 - smoothstep(-0.13, 0.03, se);
  const goldenF = Math.exp(-Math.pow((se - 0.11) / 0.105, 2)) * smoothstep(-0.05, 0.02, se);
  const st = { hour, t, elev, se, sunDir, dayF, nightF, goldenF };
  st.moonDir = sunDir.clone().multiplyScalar(-1);
  st.lampF = clamp(nightF + goldenF * 0.5, 0, 1);  // 灯光随夜色渐亮，不做开关
  st.exposure = lerp(0.80, 1.0, dayF);
  // 天空配色：夜 → 昼 再叠黄金时刻
  const night = { top: new THREE.Color(0x0a1730), hor: new THREE.Color(0x1b3055) };
  const day = { top: new THREE.Color(0x2f7fd0), hor: new THREE.Color(0xc2ddf5) };
  const gold = { top: new THREE.Color(0x4c60ad), hor: new THREE.Color(0xff9f52) };
  st.skyTop = night.top.clone().lerp(day.top, dayF).lerp(gold.top, goldenF * 0.85);
  st.skyHor = night.hor.clone().lerp(day.hor, dayF).lerp(gold.hor, goldenF * 0.92);
  st.sunColor = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xffb255), goldenF * 0.9);
  st.fogColor = st.skyHor.clone().multiplyScalar(0.60);
  st.cloudTint = st.skyHor.clone().lerp(new THREE.Color(0xffffff), 0.62).multiplyScalar(lerp(0.34, 1.0, dayF));
  return st;
}
