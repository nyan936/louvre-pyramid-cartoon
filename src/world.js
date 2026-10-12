// world.js —— 拿破仑庭院铺装（放射状，与实景一致）、水池开洞、草坪花坛、树列、杜乐丽方向延伸
import * as THREE from 'three';
import { C, TAU, rnd, rng, rndInt, pick, mergeGeos, paint, boxG, rboxG, sphG, cylG, coneG, atG, meshOf, V3, lerp, clamp, pavingTexture, grassTexture } from './base.js';
import { POOLS, WATER_Y } from './water.js';

// 一棵卡通树：树干 + 3~4 团树冠（flatShading 的块状感）
function treeParts(x, z, s, leafCol) {
  const trunk = [], leaf = [];
  const th = 3.6 * s;   // 树干加高，让树冠明显坐在树干上
  trunk.push(atG(cylG(0.52 * s, 0.76 * s, th, 7), [x, th / 2, z]));
  trunk.push(atG(cylG(0.22 * s, 0.3 * s, 1.4 * s, 6), [x + 0.3 * s, th + 0.6 * s, z], [0, 0, -0.4]));
  trunk.push(atG(cylG(0.22 * s, 0.3 * s, 1.4 * s, 6), [x - 0.28 * s, th + 0.7 * s, z], [0, 0, 0.42]));
  const n = 3;   // 3 团足够，球多了反而互相散开
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd(-0.3, 0.3);
    const rr = 2.6 * s * rnd(0.95, 1.15);
    // 关键：BufferGeometry.scale() 是绕世界原点缩放。先 scale 再 translate，
    // 否则树冠会被整体平移（x*(sx-1)）—— 之前树冠"飘在树干旁边几米"就是这个原因。
    const blob = sphG(rr, 0, 0, 0, 8);
    blob.scale(1.05, 0.86, 1.05);
    blob.translate(x + Math.cos(a) * 1.2 * s * rnd(0.2, 0.6), th + 0.62 * s + rnd(-0.12, 0.22) * s, z + Math.sin(a) * 1.2 * s * rnd(0.2, 0.6));
    leaf.push(paint(blob, leafCol.clone().offsetHSL(rnd(-0.02, 0.02), rnd(-0.06, 0.06), rnd(-0.08, 0.07))));
  }
  return { trunk, leaf };
}

// 花坛清单（props.js 的路灯也读它，避免灯杆站进花坛、光斑被绿化盖住）
export const PARTERRES = [
  { x: -62, z: -30, w: 22, d: 16 },
  { x: -62, z: 30, w: 22, d: 16 },
  { x: 40, z: -24, w: 12, d: 9 },   // 原来 (30,±38) 16×10 紧贴水池外缘，看着像卡进水里
  { x: 40, z: 24, w: 12, d: 9 },
  { x: -150, z: -52, w: 40, d: 34 },
  { x: -150, z: 52, w: 40, d: 34 },
];

// 树木禁止落进去的区域：宫殿体块 / 水池（含 45 度收角）/ 花坛 / 凯旋门
function blockedForTree(x, z, pad = 1.5) {
  const ring = [[0, 0]];
  for (let k = 0; k < 8; k++) ring.push([Math.cos((k / 8) * TAU) * pad, Math.sin((k / 8) * TAU) * pad]);
  const boxes = [
    [-86, 66, -70, -44], [-86, 66, 44, 70], [66, 92, -70, 70],   // 北/南/东翼
    [-1, 21, -64, -38], [-1, 21, 38, 64],                          // 两翼中段亭阁
    [95, 149, -60, 60],                                            // 方形宫
    [-138, -110, -6, 6],                                           // 卡鲁塞勒凯旋门
    [-3.2, 3.2, -37.7, -31.3], [-3.2, 3.2, 31.3, 37.7], [31.3, 37.7, -3.2, 3.2],   // 三座小金字塔台座（与 pyramid.js 同步）
  ];
  for (const [x0, x1, z0, z1] of boxes) for (const [dx, dz] of ring) { const px = x + dx, pz = z + dz; if (px > x0 && px < x1 && pz > z0 && pz < z1) return '建筑'; }
  for (const p of POOLS) {
    // 梯形点内测试（v 顺序：A、B 贴塔底，C、D 外缘）
    const v = p.v;
    for (const [dx, dz] of ring) {
      const px = x + dx, pz = z + dz;
      let inside = true;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = v[i], [bx, bz] = v[(i + 1) % 4];
        if ((bx - ax) * (pz - az) - (bz - az) * (px - ax) < 0) { inside = false; break; }
      }
      if (inside) return '水池';
    }
  }
  for (const q of PARTERRES) for (const [dx, dz] of ring) { if (Math.abs(x + dx - q.x) < q.w / 2 && Math.abs(z + dz - q.z) < q.d / 2) return '花坛'; }
  return null;
}

export function buildWorld() {
  const group = new THREE.Group();

  // ---------------- 广场铺装（挖出三块水池的洞）----------------
  const paving = pavingTexture();
  paving.repeat.set(1 / 300, 1 / 300);
  paving.offset.set(0.5, 0.5);       // 让放射图案中心正对金字塔
  const paveMat = new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  // 兜底：把地面在深度上推远一点，贴地构件（石缘/树篱/长椅腿…）不会再与地面 z-fighting
  paveMat.polygonOffset = true; paveMat.polygonOffsetFactor = 1.0; paveMat.polygonOffsetUnits = 1.0;

  const shape = new THREE.Shape();
  const X0 = -190, X1 = 130, Z0 = -150, Z1 = 150;
  shape.moveTo(X0, -Z0); shape.lineTo(X1, -Z0); shape.lineTo(X1, -Z1); shape.lineTo(X0, -Z1); shape.closePath();
  for (const p of POOLS) {
    const h = new THREE.Path();
    p.v.forEach(([x, z], i) => { if (i === 0) h.moveTo(x, -z); else h.lineTo(x, -z); });
    h.closePath();
    shape.holes.push(h);
  }
  const paveGeo = new THREE.ShapeGeometry(shape, 1);
  paveGeo.rotateX(-Math.PI / 2);
  const pave = new THREE.Mesh(paveGeo, paveMat);
  pave.receiveShadow = true;
  pave.castShadow = false;
  pave.name = 'plaza';
  group.add(pave);

  // ---------------- 广场之外的城市地面（避免地平线悬空）----------------
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1000, 56), new THREE.MeshStandardMaterial({ color: 0x8c9a72, roughness: 1, metalness: 0 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -1.60;   // 必须低于池底(-1.35)，否则会盖住水池洞口
  outer.receiveShadow = true;
  group.add(outer);
  // 杜乐丽方向：碎石地 + 深色步道
  const gravel = new THREE.Mesh(new THREE.CircleGeometry(320, 40), new THREE.MeshStandardMaterial({ color: 0xd8cbaa, roughness: 1 }));
  gravel.rotation.x = -Math.PI / 2;
  gravel.position.set(-300, -1.70, 0);
  gravel.receiveShadow = true;
  group.add(gravel);

  // ---------------- 草坪花坛 + 树篱 ----------------
  const lawnTex = grassTexture();
  lawnTex.repeat.set(3, 2);
  const lawnMat = new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  // 花坛：东侧两块原来 (26,±36) 尺寸 22×13 会压到水池外缘（水池最大 |z|=30.6）→ 外移并缩小
  const parterres = PARTERRES;
  const lawnParts = [], hedgeParts = [];
  for (const p of parterres) {
    const g = new THREE.PlaneGeometry(p.w, p.d);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0.07, p.z);
    lawnParts.push(g);
    // 树篱边框
    const hw = 1.0, hh = 0.95;
    for (const [ox, oz, w, d] of [
      [0, p.d / 2 + hw / 2, p.w + hw * 2, hw], [0, -p.d / 2 - hw / 2, p.w + hw * 2, hw],
      [p.w / 2 + hw / 2, 0, hw, p.d], [-p.w / 2 - hw / 2, 0, hw, p.d]]) {
      hedgeParts.push(paint(rboxG(w, hh, d, p.x + ox, hh / 2 - 0.04, p.z + oz, 0.22, 2), new THREE.Color(C.hedge).offsetHSL(rnd(-0.02, 0.02), rnd(-0.05, 0.05), rnd(-0.05, 0.05))));
    }
  }
  // 花坛里的花簇（卡通点缀：三色小球成簇）
  const flowerParts = [];
  const flowerCols = [0xe8607a, 0xf2c14e, 0xf7f2e6, 0xd4626f, 0xf29a4b];
  for (const p of parterres) {
    const n = p.w > 30 ? 46 : 28;
    for (let i = 0; i < n; i++) {
      const cx = p.x + rnd(-p.w / 2 + 1.5, p.w / 2 - 1.5);
      const cz = p.z + rnd(-p.d / 2 + 1.5, p.d / 2 - 1.5);
      const col = pick(flowerCols);
      for (let k = 0; k < rndInt(3, 5); k++) {
        flowerParts.push(paint(sphG(rnd(0.16, 0.28), cx + rnd(-0.5, 0.5), rnd(0.22, 0.55), cz + rnd(-0.5, 0.5), 7), col));
      }
    }
  }
  const flowers = new THREE.Mesh(mergeGeos(flowerParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  flowers.castShadow = false; flowers.receiveShadow = false;
  group.add(flowers);

  const lawn = new THREE.Mesh(mergeGeos(lawnParts), lawnMat);
  lawn.receiveShadow = true;
  group.add(lawn);
  const hedgeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: false });
  const hedges = new THREE.Mesh(mergeGeos(hedgeParts), hedgeMat);
  hedges.castShadow = true; hedges.receiveShadow = true;
  group.add(hedges);

  // ---------------- 树列 ----------------
  const trunks = [], leaves = [];
  let skipped = 0;
  const put = (x, z, s) => {
    if (blockedForTree(x, z, 1.2 + 2.9 * s)) { skipped++; return; }   // 按树冠半径留边距，避免树冠穿墙/悬在水上
    const col = pick([new THREE.Color(C.leafA), new THREE.Color(C.leafB), new THREE.Color(C.leafC)]);
    const t = treeParts(x, z, s, col);
    trunks.push(...t.trunk.map((g) => paint(g, new THREE.Color(C.trunk).offsetHSL(0, rnd(-0.05, 0.05), rnd(-0.06, 0.06)))));
    leaves.push(...t.leaf);
  };
  for (let x = -80; x <= -6; x += 13) { put(x + rnd(-1, 1), -36.5 + rnd(-1, 1), rnd(0.95, 1.3)); put(x + rnd(-1, 1), 36.5 + rnd(-1, 1), rnd(0.95, 1.3)); }
  for (const [x, z] of [[-84, -16], [-84, 16], [-74, -26], [-74, 26], [-52, -18], [-52, 18], [46, -22], [46, 22], [56, -30], [56, 30]]) put(x, z, rnd(0.9, 1.25));
  // 杜乐丽：两排大树
  for (let i = 0; i < 22; i++) {
    const x = -130 - (i % 11) * 13, z = (i < 11 ? -1 : 1) * (18 + rnd(-3, 6));
    put(x, z, rnd(1.25, 1.75));
  }
  if (skipped) console.info('[world] 跳过落在建筑/水池/花坛里的树:', skipped);
  const trunkMesh = new THREE.Mesh(mergeGeos(trunks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
  const leafMesh = new THREE.Mesh(mergeGeos(leaves), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }));
  leafMesh.castShadow = true; leafMesh.receiveShadow = true;
  group.add(trunkMesh, leafMesh);

  // 修剪成锥形的小灌木（花坛四角）
  const topiaryParts = [];
  for (const p of parterres) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = p.x + sx * (p.w / 2 + 0.5), z = p.z + sz * (p.d / 2 + 0.5);
      topiaryParts.push(paint(atG(coneG(1.0, 2.3, 9, 0, 0, 0), [x, 1.15, z]), new THREE.Color(C.hedgeDark)));
      topiaryParts.push(paint(cylG(0.34, 0.4, 0.35, 8, x, 0.18, z), new THREE.Color(C.trunkDark)));
    }
  }
  const topiary = new THREE.Mesh(mergeGeos(topiaryParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  topiary.castShadow = true; topiary.receiveShadow = true;
  group.add(topiary);

  // 树篱/树冠在水的倒影里几乎看不见，反射时隐藏，省一半以上三角形
  const hideDuringReflect = [leafMesh, topiary];

  return {
    group,
    hideDuringReflect,
    update(st) {
      const k = lerp(0.26, 1.0, st.dayF) + st.lampF * 0.10;
      paveMat.color.setHex(0xffffff).multiplyScalar(k);
      lawnMat.color.setHex(0xffffff).multiplyScalar(lerp(0.24, 1.0, st.dayF) + st.lampF * 0.12);
      hedgeMat.color.setHex(0xffffff).multiplyScalar(k);
      topiary.material.color.setHex(0xffffff).multiplyScalar(k);
      flowers.material.color.setHex(0xffffff).multiplyScalar(k);
      trunkMesh.material.color.setHex(0xffffff).multiplyScalar(k);
      leafMesh.material.color.setHex(0xffffff).multiplyScalar(k);
      outer.material.color.setHex(0x8c9a72).multiplyScalar(lerp(0.28, 1.0, st.dayF));
      gravel.material.color.setHex(0xd8cbaa).multiplyScalar(lerp(0.28, 1.0, st.dayF));
    },
    tick() {},
  };
}
