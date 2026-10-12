// props.js —— 路易十四骑马像、卡鲁塞勒凯旋门、路灯、长椅、售货亭、游客、鸽群、旗帜
import * as THREE from 'three';
import { C, TAU, rnd, rng, rndInt, pick, mergeGeos, paint, boxG, rboxG, sphG, cylG, coneG, rotG, atG, hangG, meshOf, V3, clamp, lerp, smoothstep, lightPoolTexture, lightConeTexture } from './base.js';
import { PARTERRES } from './world.js';

const matCache = new Map();
function clothMat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0 }));
  return matCache.get(hex);
}
const SKIN_MATS = [clothMat(C.skin), clothMat(C.skin2), clothMat(C.skin3)];
const HAIR_MATS = C.hair.map(clothMat);
const verdigris = () => new THREE.MeshStandardMaterial({ color: C.bronze, roughness: 0.55, metalness: 0.35, flatShading: false });
const stoneMat = () => new THREE.MeshStandardMaterial({ color: C.stoneLight, roughness: 0.9, metalness: 0 });

// ---------------- 马（雕像与四马战车共用），朝 +x ----------------
function horseGeo(s = 1) {
  const p = [];
  p.push(atG(rboxG(2.30 * s, 0.96 * s, 0.88 * s, 0, 0, 0, 0.24 * s, 3), [0, 1.50 * s, 0]));
  // 脖子 / 头 / 口鼻 / 耳：先绕自身原点转，再挪到位
  p.push(atG(rboxG(0.60 * s, 1.15 * s, 0.54 * s, 0, 0, 0, 0.2 * s, 2), [0.94 * s, 2.22 * s, 0], [0, 0, -0.50]));
  p.push(atG(rboxG(1.02 * s, 0.34 * s, 0.32 * s, 0, 0, 0, 0.13 * s, 2), [1.58 * s, 2.70 * s, 0], [0, 0, 0.24]));
  p.push(atG(rboxG(0.78 * s, 0.40 * s, 0.40 * s, 0, 0, 0, 0.14 * s, 2), [1.74 * s, 2.48 * s, 0]));
  p.push(atG(boxG(0.14 * s, 0.3 * s, 0.1 * s), [1.44 * s, 2.9 * s, 0.11 * s]));
  p.push(atG(boxG(0.14 * s, 0.3 * s, 0.1 * s), [1.44 * s, 2.9 * s, -0.11 * s]));
  // 腿：从髋/肩枢轴往下长
  const legs = [[0.72, 0.42, false], [0.72, -0.42, false], [-0.76, 0.40, true], [-0.76, -0.40, false]];
  for (const [lx, lz, up] of legs) {
    const hipY = (up ? 1.88 : 1.56) * s;
    const thigh = hangG(rboxG(0.28 * s, 1.5 * s, 0.26 * s, 0, 0, 0, 0.09 * s, 1), 1.5 * s);
    p.push(atG(thigh, [lx * s, hipY, lz * s], [0, 0, up ? 0.95 : 0]));
    const shin = hangG(rboxG(0.20 * s, 0.86 * s, 0.18 * s, 0, 0, 0, 0.07 * s, 1), 0.86 * s);
    p.push(atG(shin, [lx * s + (up ? 0.68 : 0) * s, (up ? 1.12 : 0.76) * s, lz * s], [0, 0, up ? 0.35 : 0]));
    p.push(atG(rboxG(0.26 * s, 0.16 * s, 0.24 * s, 0, 0, 0, 0.06 * s, 1), [lx * s + (up ? 0.86 : 0) * s, (up ? 0.72 : 0.1) * s, lz * s]));
  }
  p.push(atG(rboxG(0.66 * s, 0.22 * s, 0.20 * s, 0, 0, 0, 0.1 * s, 2), [-1.16 * s, 1.58 * s, 0], [0, 0, -0.55]));
  return mergeGeos(p);
}

// ---------------- 路易十四骑马像（金字塔视觉中轴线的起点）----------------
function buildStatue() {
  const g = new THREE.Group();
  const stone = [];
  // 三级台阶 + 基座 + 线脚
  stone.push(boxG(8.4, 0.42, 6.2, 0, 0.21, 0));
  stone.push(boxG(7.6, 0.42, 5.4, 0, 0.63, 0));
  stone.push(boxG(6.6, 0.4, 4.6, 0, 1.03, 0));
  stone.push(boxG(5.4, 3.4, 3.4, 0, 2.93, 0));
  stone.push(boxG(6.0, 0.4, 4.0, 0, 4.83, 0));
  stone.push(boxG(5.6, 0.34, 3.6, 0, 5.2, 0));
  stone.push(boxG(6.3, 0.45, 4.3, 0, 5.5, 0));       // 顶盖线脚
  stone.push(boxG(5.9, 0.34, 3.9, 0, 1.4, 0));       // 底脚线脚
  stone.push(boxG(1.5, 1.5, 2.6, 1.9, 3.6, 0));      // 铭牌
  // 铭牌
  stone.push(boxG(0.16, 1.1, 2.4, 1.74, 3.4, 0));
  const stoneMesh = new THREE.Mesh(mergeGeos(stone.map((s) => paint(s, 0xefe2c6))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
  g.add(stoneMesh);

  // 马 + 骑手（铜绿）
  const bronze = [];
  const horse = horseGeo(1.28);
  bronze.push(horse);
  // 骑手：腿 + 躯干 + 头 + 帽 + 举起的手臂（骑在马背上）
  const RS = 1.42;
  bronze.push(atG(hangG(rboxG(0.38, 1.05, 0.34, 0, 0, 0, 0.1, 1), 1.05), [0.05, 3.12, 0.46], [0, 0, -0.32]));
  bronze.push(atG(hangG(rboxG(0.38, 1.05, 0.34, 0, 0, 0, 0.1, 1), 1.05), [0.05, 3.12, -0.46], [0, 0, -0.32]));
  bronze.push(rboxG(0.78, 1.08, 0.66, 0.02, 3.74, 0, 0.22, 2));
  bronze.push(rboxG(0.92, 0.3, 0.78, 0.02, 4.27, 0, 0.12, 2));
  bronze.push(sphG(0.31, 0.05, 4.64, 0, 12));
  bronze.push(cylG(0.45, 0.49, 0.14, 14, 0.05, 4.83, 0));      // 帽檐
  bronze.push(cylG(0.32, 0.36, 0.54, 14, 0.05, 5.06, 0));       // 帽冠
  bronze.push(rboxG(0.26, 0.26, 0.26, 0.05, 5.34, 0, 0.06, 1));
  bronze.push(atG(hangG(rboxG(0.24, 0.98, 0.24, 0, 0, 0, 0.08, 1), 0.98), [0.06, 4.24, 0.44], [0, 0, -1.75]));
  bronze.push(atG(hangG(rboxG(0.24, 0.92, 0.24, 0, 0, 0, 0.08, 1), 0.92), [0.02, 4.20, -0.46], [0, 0, -0.7]));
  bronze.push(atG(cylG(0.05, 0.05, 1.6, 8, 0, 0, 0), [0.94, 4.78, 0.44], [0, 0, 0.72]));     // 权杖
  void RS;
  const bronzeMesh = new THREE.Mesh(mergeGeos(bronze), verdigris());
  bronzeMesh.castShadow = true; bronzeMesh.receiveShadow = true;
  bronzeMesh.position.y = 5.37;   // 骑像站在基座顶面上（否则整个人被埋进基座里）
  g.add(bronzeMesh);

  g.position.set(-39, 0, 0);
  g.rotation.y = -Math.PI / 2; // 面向东方（朝着金字塔与杜乐丽中轴线）
  g.name = 'statue-louis14';
  return { group: g, mats: [bronzeMesh.material, stoneMesh.material] };
}

// ---------------- 卡鲁塞勒凯旋门（3 拱 + 四马战车）----------------
function buildArc() {
  const g = new THREE.Group();
  const W = 24, H = 15.4, D = 6.4;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.closePath();
  const archHole = (cx, w, h) => {
    const r = w / 2, p = new THREE.Path();
    p.moveTo(cx - r, 0);
    p.lineTo(cx - r, h - r);
    p.absarc(cx, h - r, r, Math.PI, 0, true);
    p.lineTo(cx + r, 0);
    p.closePath();
    return p;
  };
  shape.holes.push(archHole(0, 7.2, 11.4));
  shape.holes.push(archHole(-8.2, 3.4, 6.4));
  shape.holes.push(archHole(8.2, 3.4, 6.4));
  const body = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelSize: 0.16, bevelThickness: 0.16, bevelSegments: 1, curveSegments: 16 });
  body.translate(0, 0, -D / 2);
  const trimParts = [body];
  // 檐口 + 阁楼层
  trimParts.push(boxG(W + 1.5, 0.9, D + 1.4, 0, H + 0.45, 0));
  trimParts.push(boxG(W - 1.2, 3.2, D - 0.4, 0, H + 2.5, 0));
  trimParts.push(boxG(W + 0.6, 0.7, D + 0.6, 0, H + 4.4, 0));
  // 八根科林斯柱（简化：柱身 + 柱头 + 柱础）
  for (const side of [-1, 1]) {
    for (const cx of [-10.2, -5.6, 5.6, 10.2]) {
      const cz = side * (D / 2 + 0.42);
      trimParts.push(cylG(0.52, 0.6, H - 2.4, 12, cx, (H - 2.4) / 2 + 0.6, cz));
      trimParts.push(boxG(1.5, 0.5, 1.5, cx, H - 2.05, cz));
      trimParts.push(boxG(1.6, 0.42, 1.6, cx, 0.4, cz));
      trimParts.push(rboxG(1.7, 0.6, 1.7, cx, H - 1.35, cz, 0.12, 2));
    }
  }
  const stoneMesh = new THREE.Mesh(mergeGeos(trimParts.map((s) => paint(s, C.stoneMid))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: false }));
  stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
  g.add(stoneMesh);

  // 四马战车（铜绿）
  const bronze = [];
  for (let i = 0; i < 4; i++) {
    const hg = horseGeo(0.62);
    hg.translate(0.4, 0, (i - 1.5) * 0.86);
    bronze.push(hg);
  }
  bronze.push(rboxG(1.5, 1.05, 2.3, -1.5, 1.25, 0, 0.18, 2));      // 战车
  bronze.push(atG(cylG(0.6, 0.6, 0.24, 14, 0, 0, 0), [-1.5, 0.62, 1.1], [Math.PI / 2, 0, 0]));
  bronze.push(atG(cylG(0.6, 0.6, 0.24, 14, 0, 0, 0), [-1.5, 0.62, -1.1], [Math.PI / 2, 0, 0]));
  bronze.push(rboxG(0.42, 1.25, 0.36, -1.5, 2.35, 0, 0.12, 1));    // 立像
  bronze.push(sphG(0.24, -1.5, 3.15, 0, 12));
  bronze.push(hangG(rboxG(0.16, 0.85, 0.16, 0, 0, 0, 0.06, 1), 0.85).translate(-0.95, 2.5, 0.2));
  const bronzeMesh = new THREE.Mesh(mergeGeos(bronze), verdigris());
  bronzeMesh.position.y = H + 4.75;
  bronzeMesh.castShadow = true;
  g.add(bronzeMesh);

  g.position.set(-124, 0, 0);
  g.rotation.y = Math.PI / 2; // 拱门面朝中轴线
  g.name = 'arc-carrousel';
  return { group: g };
}

// ---------------- 路灯（含夜间地面光斑）----------------
function buildLamps() {
  const g = new THREE.Group();
  const post = [], globes = [];
  const positions = [];
  const SMALL_PYR = [[0, -34.5], [0, 34.5], [34.5, 0]];             // 三座小金字塔台座（5.6m 见方，与 pyramid.js 保持一致）
  const inParterre = (x, z) =>
    PARTERRES.some((q) => Math.abs(x - q.x) < q.w / 2 + 0.8 && Math.abs(z - q.z) < q.d / 2 + 0.8) ||
    SMALL_PYR.some(([px, pz]) => Math.abs(x - px) < 3.6 && Math.abs(z - pz) < 3.6);
  for (let x = -66; x <= 54; x += 20) { positions.push([x, -40.5]); positions.push([x, 40.5]); }
  positions.push([-58, 0], [-30, 14.5], [-30, -14.5], [40, 0]);
  // 灯杆不能站在花坛里（否则光斑被绿化盖住——用户报的问题）
  for (let i = positions.length - 1; i >= 0; i--) if (inParterre(positions[i][0], positions[i][1])) positions.splice(i, 1);
  const GROUND_Y = 0;
  for (const [x, z] of positions) {
    post.push(cylG(0.34, 0.46, 0.5, 10, x, 0.25, z));
    post.push(cylG(0.17, 0.26, 4.0, 10, x, 2.3, z));
    post.push(cylG(0.3, 0.18, 0.5, 10, x, 4.5, z));
    // 双灯臂
    for (const s of [-1, 1]) {
      const arm = rboxG(0.5, 0.14, 0.14, x + s * 0.35, 4.6, z, 0.05, 1);
      post.push(arm);
      post.push(cylG(0.08, 0.08, 0.34, 8, x + s * 0.72, 4.45, z));
      globes.push(sphG(0.3, x + s * 0.72, 4.2, z, 12));
    }
    post.push(sphG(0.14, x, 5.0, z, 8));
  }
  const postMesh = new THREE.Mesh(mergeGeos(post.map((p) => paint(p, 0x39434d))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));
  postMesh.castShadow = true; postMesh.receiveShadow = true;
  g.add(postMesh);
  const globeMat = new THREE.MeshStandardMaterial({ color: 0xfff0d4, roughness: 0.25, metalness: 0, emissive: new THREE.Color(C.lampWarm), emissiveIntensity: 0.0, transparent: true, opacity: 0.92 });
  const globeMesh = new THREE.Mesh(mergeGeos(globes), globeMat);
  globeMesh.castShadow = false;
  g.add(globeMesh);

  // 地面光斑：径向渐变贴图 + 收小半径（原来是 4.6m 实心圆盘，边界硬、还容易被绿化盖住）
  const poolTex = lightPoolTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const poolGeo = new THREE.PlaneGeometry(5.0, 5.0);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = [];
  for (const [x, z] of positions) {
    const d = new THREE.Mesh(poolGeo, poolMat);
    d.position.set(x, 0.06, z);
    pools.push(d);
    g.add(d);
  }
  // 近金字塔的四盏给真实点光（其余用自发光球，省点光源）
  const lights = [];
  for (const [x, z] of [[-30, 14.5], [-30, -14.5], [40, 0], [-58, 0]]) {
    const l = new THREE.PointLight(0xffc178, 0, 0, 2);
    l.position.set(x, 4.4, z);
    g.add(l);
    lights.push(l);
  }
  return {
    group: g,
    update(st) {
      globeMat.emissiveIntensity = st.lampF * 1.9;
      globeMat.opacity = lerp(0.95, 1.0, st.lampF);
      poolMat.opacity = st.lampF * 0.30;
      for (const l of lights) l.intensity = st.lampF * 260;
      void GROUND_Y;
    },
  };
}

// ---------------- 长椅 / 垃圾桶 / 售货亭 / 旗帜 ----------------
function buildFurniture() {
  const g = new THREE.Group();
  const wood = [], metal = [];
  const benchAt = (x, z, ry) => {
    const parts = [];
    parts.push(boxG(2.4, 0.14, 0.62, 0, 0.5, 0));
    parts.push(boxG(2.4, 0.5, 0.12, 0, 0.86, -0.26));
    for (const sx of [-1, 1]) parts.push(boxG(0.12, 0.5, 0.6, sx * 1.1, 0.25, 0));
    for (const p of parts) { p.rotateY(ry); p.translate(x, 0, z); wood.push(p); }
  };
  for (const [x, z, ry] of [[-46, -26, 0], [-46, 26, 0], [-58, -18, 0.5], [-58, 18, -0.5], [22, -38, Math.PI], [22, 38, Math.PI]]) benchAt(x, z, ry);
  // 垃圾桶
  for (const [x, z] of [[-40, 8], [-40, -8], [26, 30], [26, -30]]) {
    metal.push(cylG(0.42, 0.36, 1.0, 12, x, 0.5, z));
    metal.push(cylG(0.48, 0.48, 0.12, 12, x, 1.05, z));
  }
  const woodMesh = new THREE.Mesh(mergeGeos(wood.map((p) => paint(p, 0x9a6b45))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  g.add(woodMesh);
  const metalMesh = new THREE.Mesh(mergeGeos(metal.map((p) => paint(p, 0x44525b))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }));
  metalMesh.castShadow = true;
  g.add(metalMesh);

  // 售货亭（条纹雨篷 + 招牌）
  const kiosk = new THREE.Group();
  const kparts = [];
  kparts.push(boxG(4.2, 2.8, 3.2, 0, 1.4, 0));
  kparts.push(boxG(4.6, 0.24, 3.6, 0, 2.92, 0));
  kparts.push(boxG(0.2, 1.2, 1.4, 2.06, 1.5, 0));
  const kMesh = new THREE.Mesh(mergeGeos(kparts.map((p) => paint(p, 0xf3e7cf))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  kMesh.castShadow = true; kMesh.receiveShadow = true;
  kiosk.add(kMesh);
  const stripes = [];
  for (let i = 0; i < 7; i++) {
    const s = i % 2 === 0 ? 0xe8604f : 0xfaf3e4;
    stripes.push(paint(boxG(0.66, 0.16, 3.9, -2.1 + i * 0.7, 3.05, 0), s));
    stripes.push(paint(boxG(0.66, 0.5, 0.16, -2.1 + i * 0.7, 2.85, 1.95), s));
  }
  const stripeMesh = new THREE.Mesh(mergeGeos(stripes), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  stripeMesh.castShadow = true;
  kiosk.add(stripeMesh);
  kiosk.position.set(-33, 0, -17);
  kiosk.rotation.y = 0.5;
  g.add(kiosk);

  // 旗帜（顶点波动）
  const flags = [];
  for (const [x, z, ry] of [[-62, -43, 0.0], [-62, 43, 0.0]]) {
    const pole = new THREE.Mesh(cylG(0.09, 0.12, 11, 8, x, 5.5, z), clothMat(0xb9c2c8));
    pole.castShadow = true;
    g.add(pole);
    const fg = new THREE.PlaneGeometry(2.6, 1.7, 10, 6);
    fg.translate(1.3, 0, 0);
    const fm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const f = new THREE.Mesh(fg, fm);
    f.position.set(x + 0.06, 9.7, z);
    f.rotation.y = ry;
    f.castShadow = false;
    g.add(f);
    flags.push({ mesh: f, base: fg.attributes.position.array.slice(), phase: rnd(0, TAU) });
  }
  return {
    group: g,
    tick(t) {
      for (const fl of flags) {
        const pos = fl.mesh.geometry.attributes.position;
        const base = fl.base;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1];
          const w = clamp(bx / 2.6, 0, 1);
          pos.setZ(i, Math.sin(bx * 2.4 - t * 3.4 + fl.phase) * 0.28 * w + Math.sin(by * 2.0 + t * 1.7) * 0.09 * w);
        }
        pos.needsUpdate = true;
      }
    },
    update(st) {
      for (const c of g.children) if (c.material && c.material.vertexColors) c.material.color.setHex(0xffffff).multiplyScalar(lerp(0.42, 1.0, st.dayF));
      woodMesh.material.color.setHex(0xffffff).multiplyScalar(lerp(0.42, 1.0, st.dayF));
      metalMesh.material.color.setHex(0xffffff).multiplyScalar(lerp(0.42, 1.0, st.dayF));
    },
  };
}

// ---------------- 游客（卡通小人）----------------
function makePerson(i) {
  const p = new THREE.Group();
  const shirt = clothMat(pick(C.cloth));
  const pants = clothMat(pick([0x3d4a63, 0x2f3a4d, 0x5b4636, 0x6d6f7c, 0x8a4b52]));
  const skin = pick(SKIN_MATS);
  const hair = pick(HAIR_MATS);
  const s = rnd(0.92, 1.08);

  const legGeo = new THREE.CapsuleGeometry(0.115, 0.52, 3, 8);
  legGeo.translate(0, -0.26, 0);
  const legs = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, pants);
    leg.position.set(sx * 0.135, 0.66, 0);
    leg.castShadow = true;
    p.add(leg); legs.push(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.34, 3, 10), shirt);
  torso.position.y = 1.02;
  torso.castShadow = true;
  p.add(torso);
  // 手臂
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.4, 3, 8);
  armGeo.translate(0, -0.2, 0);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, shirt);
    arm.position.set(sx * 0.3, 1.16, 0);
    arm.castShadow = true;
    p.add(arm); arms.push(arm);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 10), skin);
  head.position.y = 1.52;
  head.castShadow = true;
  p.add(head);
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.245, 14, 10, 0, TAU, 0, Math.PI * 0.62), hair);
  hairMesh.position.y = 1.545;
  hairMesh.rotation.x = -0.18;
  p.add(hairMesh);
  // 眼睛（卡通的灵魂）
  const eyeGeo = new THREE.SphereGeometry(0.032, 7, 5);
  const eyeMat = clothMat(0x2a2620);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(sx * 0.082, 1.55, 0.205);
    p.add(e);
  }
  p.scale.setScalar(s);
  p.traverse((o) => { o.receiveShadow = false; });
  return { group: p, legs, arms, torso, head, s };
}

function buildCrowd() {
  const g = new THREE.Group();
  const people = [];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const pr = makePerson(i);
    let mode;
    if (i < 7) mode = 'axis';
    else if (i < 12) mode = 'ring';
    else if (i < 16) mode = 'queue';
    else if (i < 18) mode = 'photo';
    else mode = 'sit';
    const u = {
      mode,
      speed: rnd(1.0, 1.7) * (mode === 'ring' ? 0.7 : 1),
      phase: rnd(0, TAU),
      dir: rng() > 0.5 ? 1 : -1,
      lane: rnd(-1, 1),
      // axis：沿中轴线往返
      z: rnd(-7, 7), x0: -74, x1: -21,
      // ring：绕金字塔外圈
      r: rnd(35, 43), a: rnd(0, TAU),
    };
    u.t = rnd(0, 1);
    u.qi = i - 12;                                   // 排队槽位 0..3
    u.sitZ = i === 18 ? -26 : 26;                    // 坐姿：两张长椅各一人
    pr.group.rotation.y = u.dir > 0 ? 0 : Math.PI;
    people.push({ pr, u });
    g.add(pr.group);
  }
  const _v = new THREE.Vector3();
  return {
    group: g,
    people,
    tick(t, dt, st) {
      for (const { pr, u } of people) {
        const p = pr.group;
        let walk = true, sp = u.speed;
        if (u.mode === 'axis') {
          u.t += u.dir * dt * u.speed * 0.02;
          if (u.t > 1) { u.t = 1; u.dir = -1; }
          if (u.t < 0) { u.t = 0; u.dir = 1; }
          const x = lerp(u.x0, u.x1, u.t);
          p.position.set(x, 0, u.z + Math.sin(t * 0.4 + u.phase) * 0.2);
          p.rotation.y = u.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else if (u.mode === 'ring') {
          u.a += dt * 0.055 * u.speed * (u.dir > 0 ? 1 : -1);
          p.position.set(Math.cos(u.a) * u.r, 0, Math.sin(u.a) * u.r);
          p.rotation.y = -u.a + (u.dir > 0 ? 0 : Math.PI);   // 正面朝切线方向
        } else if (u.mode === 'queue') {
          const bz = -5.6 + u.qi * 1.5;
          walk = true; sp = 0.35;
          p.position.set(-21.6 + Math.sin(t * 0.7 + u.phase) * 0.12, 0, bz + Math.sin(t * 0.6 + u.phase) * 0.1);
          p.rotation.y = Math.PI / 2 + Math.sin(t * 0.3 + u.phase) * 0.12;   // 面朝入口
        } else if (u.mode === 'photo') {
          walk = false;
          u.a += dt;
          p.position.set(u.x0 + 12 + Math.sin(u.phase) * 2, 0, u.z * 0.6 - 14);
          p.rotation.y = Math.PI / 2;   // 面朝金字塔
          pr.arms.forEach((a, k) => { a.rotation.x = -2.0; a.rotation.z = (k === 0 ? 1 : -1) * 0.35; });
        } else {
          walk = false;
          const benchZ = u.sitZ;                       // 每张长椅只坐一个人
          p.position.set(-46 + Math.sin(u.phase) * 0.4, 0.35, benchZ);
          p.rotation.y = benchZ > 0 ? Math.PI : 0;
          // 坐在长椅上
          p.position.y = 0.35;
          pr.legs.forEach((l) => { l.rotation.x = 1.35; });
          pr.legs[0].position.z = 0.16; pr.legs[1].position.z = 0.16;
        }
        // 走路循环
        const cyc = t * sp * 5.4 + u.phase;
        if (walk) {
          pr.legs[0].rotation.x = Math.sin(cyc) * 0.62;
          pr.legs[1].rotation.x = -Math.sin(cyc) * 0.62;
          pr.arms[0].rotation.x = -Math.sin(cyc) * 0.5;
          pr.arms[1].rotation.x = Math.sin(cyc) * 0.5;
          pr.arms[0].rotation.z = 0.06; pr.arms[1].rotation.z = -0.06;
          p.position.y = Math.abs(Math.sin(cyc)) * 0.05;
          pr.torso.rotation.z = Math.sin(cyc) * 0.05;
        }
        void _v; void st;
      }
    },
  };
}

// ---------------- 鸽群 ----------------
function buildPigeons() {
  const g = new THREE.Group();
  const parts = [];
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd(0, TAU), r = rnd(12, 60);
    spots.push([Math.cos(a) * r * 0.9 - 10, Math.sin(a) * r * 0.6]);
  }
  for (const [x, z] of spots) {
    const s = rnd(0.85, 1.15);
    const body = sphG(0.13 * s, 0, 0, 0, 8);
    body.scale(1.5, 0.95, 0.95);          // 先缩放再平移，否则 x 会被放大 1.5 倍（鸽子整只飞走）
    body.translate(x, 0.11 * s, z);
    parts.push(body);
    parts.push(sphG(0.075 * s, x + 0.16 * s, 0.19 * s, z, 7));
    const tail = atG(coneG(0.08 * s, 0.22 * s, 6, 0, 0, 0), [x - 0.2 * s, 0.12 * s, z], [0, 0, Math.PI / 2]);
    parts.push(tail);
    for (const lx of [-0.05, 0.05]) parts.push(atG(cylG(0.014 * s, 0.014 * s, 0.1 * s, 5, 0, 0, 0), [x + lx * s, 0.05 * s, z]));
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0x99a2b2, roughness: 0.95, flatShading: true });
  const mesh = new THREE.Mesh(mergeGeos(parts), mat);
  mesh.castShadow = true; mesh.receiveShadow = false;
  g.add(mesh);
  return { group: g, update(st) { mat.color.setHex(0x99a2b2).multiplyScalar(lerp(0.38, 1.0, st.dayF)); }, tick() {} };
}

// ---------------- 门口射灯（光锥 + 夜间随机 flicker）----------------
function buildSpots() {
  const g = new THREE.Group();
  const tex = lightConeTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const geo = new THREE.ConeGeometry(1.9, 7.0, 16, 1, true);
  geo.translate(0, 3.5, 0);                  // 顶点在原点（灯位），向上张开
  const spots = [];
  // 金字塔入口两侧 + 三翼亭阁门口 + 钟阁前（位置/角度/相位各自随机）
  const defs = [
    [-19.6, 5.2], [-19.6, -5.2],           // 金字塔西入口
    [-70, 43], [-70, -43],                 // 西端两亭阁
    [10, 41], [10, -41],                   // 中段两亭阁
    [64, 0],                               // 东侧钟阁
    [-118, 5], [-118, -5],                 // 卡鲁塞勒凯旋门两侧
  ];
  for (const [x, z] of defs) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.1, z);
    const tilt = rnd(0.10, 0.34);
    m.rotation.z = rnd(-1, 1) * tilt;
    m.rotation.x = rnd(-1, 1) * tilt;
    m.userData = { phase: rnd(0, TAU), speed: rnd(1.6, 3.4) };
    spots.push(m);
    g.add(m);
  }
  return {
    group: g,
    update(st) { mat.opacity = st.lampF * 0.26; },
    tick(t, st) {
      // 射灯轻微随机闪烁，不是死板的一排光柱
      mat.opacity = st.lampF * (0.22 + 0.08 * Math.sin(t * 2.3));
      for (const m of spots) m.scale.y = 0.92 + 0.08 * Math.sin(t * m.userData.speed + m.userData.phase);
    },
  };
}

export function buildProps() {
  const group = new THREE.Group();
  const statue = buildStatue();
  const arc = buildArc();
  const lamps = buildLamps();
  const furn = buildFurniture();
  const crowd = buildCrowd();
  const pigeons = buildPigeons();
  const spots = buildSpots();
  group.add(statue.group, arc.group, lamps.group, furn.group, crowd.group, pigeons.group, spots.group);
  const hideDuringReflect = [crowd.group, pigeons.group];
  return {
    group,
    hideDuringReflect,
    update(st) { lamps.update(st); furn.update(st); pigeons.update(st); spots.update(st); },
    tick(t, dt, st) { furn.tick(t); crowd.tick(t, dt, st); spots.tick(t, st); },
    crowd, pigeons,
  };
}
