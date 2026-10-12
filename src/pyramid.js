// pyramid.js —— 玻璃金字塔：菱形网格幕墙 + 玻璃面 + 夜间内透光 + 三座小金字塔
import * as THREE from 'three';
import { C, mergeGeos, paint, meshOf, boxG, rboxG, V3, rnd, clamp, lerp, glassSheenTexture } from './base.js';

export const PY = { half: 17, height: 21.64, mullion: 0.115, frame: 0.26, div: 13 };

// (u,v) → 世界：u ∈ [-1,1] 沿底边，v ∈ [0,1] 由底边到顶点（仿射，故直线仍是直线）
function facePoint(baseCenter, right, apex, halfBase, u, v) {
  const k = 1 - v;
  return V3(
    k * (baseCenter.x + right.x * u * halfBase) + v * apex.x,
    k * (baseCenter.y + right.y * u * halfBase) + v * apex.y,
    k * (baseCenter.z + right.z * u * halfBase) + v * apex.z
  );
}

function beam(a, b, thick, color) {
  const len = a.distanceTo(b);
  if (len < 1e-4) return null;
  const g = new THREE.BoxGeometry(thick, thick, len);
  g.translate(0, 0, len / 2);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return paint(g, color);
}

// 一整个金字塔（主塔与小塔共用；小塔为纯玻璃体）
export function makePyramid({ half, height, div, glassMat, steelMat, inner = false }) {
  const g = new THREE.Group();
  const apex = V3(0, height, 0);
  const sides = [
    { n: V3(0, 0, 1), bc: V3(0, 0, half), right: V3(1, 0, 0) },
    { n: V3(0, 0, -1), bc: V3(0, 0, -half), right: V3(-1, 0, 0) },
    { n: V3(1, 0, 0), bc: V3(half, 0, 0), right: V3(0, 0, -1) },
    { n: V3(-1, 0, 0), bc: V3(-half, 0, 0), right: V3(0, 0, 1) },
  ];

  const steelParts = [];
  const glassParts = [];
  const steel = new THREE.Color(C.metal).offsetHSL(0, 0, 0.04);
  const mThick = Math.max(0.10, PY.mullion * (half / PY.half) * 1.0);
  const fThick = Math.max(0.20, PY.frame * (half / PY.half));

  for (const s of sides) {
    // 玻璃三角面
    const p0 = facePoint(s.bc, s.right, apex, half, -1, 0);
    const p1 = facePoint(s.bc, s.right, apex, half, 1, 0);
    const p2 = facePoint(s.bc, s.right, apex, half, 0, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
    ]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    geo.computeVertexNormals();
    glassParts.push(geo);

    // 菱形网格：a+b=c 与 a-b=c 两族（a=u, b=2v-1），步长 2/div
    const n = div, step = 2 / n;
    for (let k = 0; k <= 2 * n; k++) {
      const c = -2 + k * step;
      // 族 A: u = c + 2v - 1（递增），|u|<=1 → v ∈ [-c/2, 1-c/2]
      {
        const v0 = Math.max(0, -c / 2), v1 = Math.min(1, 1 - c / 2);
        if (v1 - v0 > 1e-3 && v1 > 0 && v0 < 1) {
          const bm = beam(facePoint(s.bc, s.right, apex, half, c + 2 * v0 - 1, v0), facePoint(s.bc, s.right, apex, half, c + 2 * v1 - 1, v1), mThick, steel);
          if (bm) steelParts.push(bm);
        }
      }
      // 族 B: u = c - 2v + 1（递减），|u|<=1 → v ∈ [c/2, (c+2)/2]
      {
        const v0 = Math.max(0, c / 2), v1 = Math.min(1, (c + 2) / 2);
        if (v1 - v0 > 1e-3 && v1 > 0 && v0 < 1) {
          const bm = beam(facePoint(s.bc, s.right, apex, half, c - 2 * v0 + 1, v0), facePoint(s.bc, s.right, apex, half, c - 2 * v1 + 1, v1), mThick, steel);
          if (bm) steelParts.push(bm);
        }
      }
    }
    // 边框：底边 + 两条斜边
    const corners = [facePoint(s.bc, s.right, apex, half, -1, 0), facePoint(s.bc, s.right, apex, half, 1, 0)];
    for (const c of corners) {
      const bm = beam(c, apex, fThick, steel);
      if (bm) steelParts.push(bm);
    }
    const bb = beam(corners[0], corners[1], fThick * 1.15, steel);
    if (bb) steelParts.push(bb);
  }

  // 玻璃
  const glassGeo = mergeGeos(glassParts);
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.castShadow = true;      // 玻璃也要投影，否则金字塔在地面上没有分量
  glass.receiveShadow = false;
  glass.renderOrder = 6;
  glass.name = 'pyramid-glass';
  g.add(glass);

  // 钢架
  const steelMesh = new THREE.Mesh(mergeGeos(steelParts), steelMat);
  steelMesh.castShadow = true;
  steelMesh.receiveShadow = true;
  steelMesh.name = 'pyramid-steel';
  g.add(steelMesh);

  if (inner) {
    // 内部：一圈门厅矮墙 + 楼板。原来是一个完整四棱锥内胆，从外面透过玻璃看像塔里还飘着一个
    // 小金字塔，边缘在玻璃上投出斜四边形（用户报的小金字塔浮空）。
    const innerMat = new THREE.MeshStandardMaterial({ color: 0x6f6656, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide });
    // wIn 必须小于塔底 half(17)：原来取 1.16×half=19.7m，门厅墙直接从玻璃里戳出来，
    // 绕着塔底形成一圈棕色框（用户报的灰框真凶）
    const wallH = 2.8, wIn = half * 0.84;
    for (const [ox, oz, w, d] of [[0, -wIn, wIn * 2, 0.4], [0, wIn, wIn * 2, 0.4], [-wIn, 0, 0.4, wIn * 2], [wIn, 0, 0.4, wIn * 2]]) {
      g.add(new THREE.Mesh(boxG(w, wallH, d, ox, wallH / 2 + 0.55, oz), innerMat));
    }
    // 内部楼板 + 暖光台面
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(half * 0.9, 0.5, half * 0.9),   // 25.5m→15.3m：原来几乎铺满塔底，夜里糊成一块发光板
      new THREE.MeshStandardMaterial({ color: 0x8d8570, roughness: 0.9, emissive: new THREE.Color(0xffbf72), emissiveIntensity: 0.06 })
    );
    deck.position.y = 1.5;
    g.add(deck);
    g.userData.deck = deck;
  }
  g.userData.glass = glass;
  return g;
}

export function buildPyramid(scene) {
  const group = new THREE.Group();

  const sheen = glassSheenTexture();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9cc4d8, metalness: 0.0, roughness: 0.06,
    map: sheen, transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    envMapIntensity: 2.2, clearcoat: 0.5, clearcoatRoughness: 0.06,
    emissive: new THREE.Color(0xff9a4a), emissiveIntensity: 0,
    depthWrite: false, premultipliedAlpha: false,
  });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xbfc9cf, metalness: 0.55, roughness: 0.28, envMapIntensity: 1.5 });

  const main = makePyramid({ half: PY.half, height: PY.height, div: PY.div, glassMat, steelMat, inner: true });
  group.add(main);

  // 基座石缘（贴地一圈，让金字塔"落在水里"而不悬空）
  const curb = [];
  const cw = 1.30, ch = 0.42;   // 加宽到外沿 18.18，盖住水池内孔(18.0)
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.92, metalness: 0 });
  for (const [x, z, w, d] of [[0, PY.half + cw / 2 - 0.12, PY.half * 2 + cw * 2, cw], [0, -(PY.half + cw / 2 - 0.12), PY.half * 2 + cw * 2, cw],
  [PY.half + cw / 2 - 0.12, 0, cw, PY.half * 2 + cw * 2], [-(PY.half + cw / 2 - 0.12), 0, cw, PY.half * 2 + cw * 2]]) {
    // 顶面必须离开铺装平面(y=0)：原来顶面正好 0.00 与广场共面 → 整圈 z-fighting 闪烁
    curb.push(rboxG(w, ch, d, x, 0.06 - ch / 2, z, 0.10, 2));
  }
  const curbMesh = new THREE.Mesh(mergeGeos(curb), stoneMat);
  curbMesh.castShadow = true; curbMesh.receiveShadow = true;
  group.add(curbMesh);

  // 夜间内透光：塔内暖光（真实金字塔夜里从内部打亮）
  const innerLight = new THREE.PointLight(0xffc887, 0, 0, 2);
  innerLight.position.set(0, 8.5, 0);
  group.add(innerLight);
  const innerLight2 = new THREE.PointLight(0xffb066, 0, 0, 2);
  innerLight2.position.set(0, 3.0, 0);
  group.add(innerLight2);

  // 三座小金字塔（分别为北/南/东三翼入口采光）
  const smalls = [];
  // 对准三翼入口：北/南放在中段亭阁前 10m，东侧放东翼前 10m。
  // （原来 ±46 直接嵌在南北翼墙体里；±38 又会撞上伸到 ±38 的中段亭阁）
  // 三座塔要同时避开：水池外缘(|x| 或 |z| > 30.6)、南北翼墙(z=±44)、中段亭阁(伸到 z=±38 且 x∈[-1,21])
  // 现实里三座小金字塔分别在黎塞留(北)/德农(南)/叙利(东)三馆入口前，且远小于主塔
  const smallDefs = [[0, -34.5], [0, 34.5], [34.5, 0]];
  for (const [x, z] of smallDefs) {
    const p = makePyramid({ half: 2.4, height: 3.06, div: 5, glassMat, steelMat: steelMat.clone(), inner: false });
    p.position.set(x, 0, z);
    const rim = new THREE.Mesh(rboxG(5.6, 0.36, 5.6, x, 0.16, z, 0.10, 2), stoneMat);   // 与小塔一起缩小   // 底面沉入地面，避免与铺装共面
    rim.castShadow = true; rim.receiveShadow = true;
    smalls.push(p);
    group.add(rim, p);
  }

  // 入口（西面底部的门洞 + 雨篷）
  const ent = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.85, metalness: 0.15 });
  ent.add(new THREE.Mesh(boxG(0.6, 4.2, 7.0, -PY.half + 0.15, 2.1, 0), dark));
  // 玻璃门 + 门框 + 内部暖光（夜里能看到"里面亮着"）
  const doorGlass = new THREE.MeshPhysicalMaterial({ color: 0xbcd8e6, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 2.0 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b7884, metalness: 0.45, roughness: 0.45 });
  const inner = new THREE.MeshStandardMaterial({ color: 0xffdca8, emissive: new THREE.Color(0xffc178), emissiveIntensity: 0.5 });
  for (const dz of [-1.75, 1.75]) {
    ent.add(new THREE.Mesh(boxG(0.3, 3.7, 3.0, -PY.half - 0.03, 1.85, dz), doorGlass));
    for (const oz of [-1.55, 0, 1.55]) ent.add(new THREE.Mesh(boxG(0.4, 3.9, 0.16, -PY.half - 0.06, 1.95, dz + oz), doorMat));
    ent.add(new THREE.Mesh(boxG(0.42, 0.22, 3.3, -PY.half - 0.06, 3.85, dz), doorMat));
    ent.add(new THREE.Mesh(boxG(0.42, 0.22, 3.3, -PY.half - 0.06, 0.1, dz), doorMat));
  }
  ent.add(new THREE.Mesh(boxG(0.5, 3.4, 6.4, -PY.half + 0.75, 2.0, 0), inner));
  // 台阶
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 });
  ent.add(new THREE.Mesh(boxG(2.2, 0.16, 9.4, -PY.half - 0.9, 0.08, 0), stepMat));
  // 雨篷 + 支撑杆
  const canopy = new THREE.Mesh(boxG(4.0, 0.26, 9.6, -PY.half - 1.5, 4.25, 0), steelMat);
  canopy.castShadow = true;
  ent.add(canopy);
  const struts = [];
  for (const dz of [-4.2, 4.2]) for (const dx of [-3.0]) struts.push(boxG(0.18, 4.25, 0.18, -PY.half + dx, 2.12, dz));
  const strutMesh = new THREE.Mesh(mergeGeos(struts.map((g) => paint(g, 0xbfc9cf))), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.3 }));
  strutMesh.castShadow = true;
  ent.add(strutMesh);
  group.add(ent);

  // 排队护栏（卡通小细节：真实入口前的蛇形队列）
  const barrier = [];
  const bpMat = new THREE.MeshStandardMaterial({ color: 0x8d99a6, metalness: 0.5, roughness: 0.45 });
  for (let i = 0; i < 7; i++) {
    const px = -PY.half - 4.5 - (i % 2) * 0.0;
    const pz = -6.6 + i * 2.2;
    barrier.push(boxG(0.12, 1.05, 0.12, px, 0.53, pz));
    barrier.push(boxG(0.10, 0.10, 1.9, px, 1.0, pz + 1.0));
  }
  const bMesh = new THREE.Mesh(mergeGeos(barrier), bpMat);
  bMesh.castShadow = true;
  group.add(bMesh);

  return {
    group,
    main,
    update(st) {
      glassMat.emissiveIntensity = st.nightF * 0.22 + st.goldenF * 0.08;   // 曾把塔内透光糊成白团 [222,201,175]
      glassMat.opacity = lerp(0.92, 1.0, st.nightF);
      steelMat.color.setHex(0xbfc9cf).multiplyScalar(lerp(1.0, 0.5, st.nightF));
      innerLight.intensity = st.nightF * 110;
      innerLight2.intensity = st.nightF * 60;
      if (main.userData.deck) {
        main.userData.deck.material.emissiveIntensity = st.nightF * 0.22 + st.dayF * 0.03;
      }
    },
    tick() {},
    glassMat, steelMat,
  };
}
