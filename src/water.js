// water.js —— 三块水面共用一个 Reflector + 自写水着色器（菲涅尔/涟漪/碎光）+ 喷泉涟漪
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { C, mergeGeos, boxG, rboxG, sphG, cylG, poolFloorTexture, waterRippleTexture, V3, rnd, rng, rndInt, clamp, lerp, TAU } from './base.js';

export const WATER_Y = -0.45;
export const BASIN_Y = -1.35;

// 三块水面（各为梯形，外缘 45° 收角，正好绕金字塔的北/东/南三面 —— 与实景三块三角形水池同构）
// 顶点顺序：A、B 是贴金字塔底座的边（不放石缘），C、D 是外缘
// 内孔收到 ±18.0，配合金字塔石缘加宽到 1.30（外沿 18.18）→ 水面直抵石缘，不再露出铺装那条灰框
export const POOLS = [
  { name: 'north', v: [[-18.0, -18.0], [18.0, -18.0], [30.6, -30.6], [-30.6, -30.6]] },
  { name: 'south', v: [[-18.0, 18.0], [18.0, 18.0], [30.6, 30.6], [-30.6, 30.6]] },
  { name: 'east', v: [[18.0, -18.0], [18.0, 18.0], [30.6, 30.6], [30.6, -30.6]] },
];

// 自定义 Reflector 着色器：反射 + 水体本色下限 + 菲涅尔 + 涟漪 + 日月碎光
const WATER_VERT = /* glsl */`
uniform mat4 textureMatrix;
varying vec4 vUvR;
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vUvR = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WATER_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D uRippleTex;
uniform vec3 uBody, uDeep, uSky, uSunColor, uSunDir, uWarm;
uniform float uTime, uSparkle, uNight, uRipple, uOpacity;
varying vec4 vUvR;
varying vec3 vWorld;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz;
  float r1 = sin(p.x * 0.55 + uTime * 1.45) * cos(p.y * 0.62 - uTime * 1.10);
  float r2 = sin((p.x + p.y) * 0.31 - uTime * 0.85);
  float r3 = sin((p.x - p.y) * 0.83 + uTime * 2.10);
  // 细节：两层滚动的水波法线图（可平铺正弦叠加），叠加低频 sin 做整体漂移
  vec3 rp1 = texture2D(uRippleTex, p * 0.052 + vec2(uTime * 0.011, uTime * 0.007)).rgb;
  vec3 rp2 = texture2D(uRippleTex, p * 0.019 - vec2(uTime * 0.008, uTime * 0.013)).rgb;
  vec2 texOff = (rp1.rg - 0.5) * 0.85 + (rp2.rg - 0.5) * 0.55;
  vec2 off = (vec2(r1 * 0.0022 + r2 * 0.0014, r3 * 0.0020 + r2 * 0.0011) + texOff * 0.0075) * uRipple;
  vec4 uv4 = vUvR;
  uv4.xy += off * uv4.w;
  vec3 refl = texture2DProj(tDiffuse, uv4).rgb;

  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.6);
  vec3 body = mix(uDeep, uBody, 0.55);
  body = mix(body, uSky * 0.42, 0.04);
  body = mix(body, uWarm, uNight * 0.5);
  // 反射下限抬高：中低视角也要看得到金字塔/宫殿的倒影（曾是无倒影的平板）
  vec3 c = mix(body, refl, mix(0.36, 0.93, pow(fres, 0.72)));   // 下限过高会让俯视整片映天光、水发白

  // 日月碎光
  vec3 N = normalize(vec3(-off.y * 46.0, 1.0, off.x * 46.0));
  vec3 H = normalize(normalize(uSunDir) + V);
  c += uSunColor * pow(max(dot(N, H), 0.0), 200.0) * 1.15 * uSparkle;
  c *= 0.95 + 0.10 * (rp1.r - 0.5);                              // 波纹带出明暗，不是一块平板
  // 接地压暗：金字塔底座附近的水被结构遮光（水面是自定义 shader 收不到阴影贴图，用这个补接触阴影）
  float dPy = length(vWorld.xz);
  c *= mix(0.80, 1.0, smoothstep(19.2, 22.6, dPy));          // 只在紧贴塔底 3m 内轻轻压暗
  float dOut = max(abs(vWorld.x), abs(vWorld.z));
  c *= mix(1.0, 0.94, smoothstep(28.5, 30.4, dOut));         // 外缘只压 6%，避免整条池子发暗
  c = max(c, vec3(0.016, 0.026, 0.046) * uNight);
  gl_FragColor = vec4(c, uOpacity);
}`;

function quadXZ(v, y) {
  // v: [[x,z] x4] → 水平四边形（法线 +y）
  const pos = [];
  const idx = [0, 1, 2, 0, 2, 3];
  for (const [x, z] of v) pos.push(x, y, z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  const n = new Float32Array(12);
  for (let i = 0; i < 4; i++) n[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  return g.index ? g.toNonIndexed() : g;
}

function wallStrip(a, b, yTop, yBot) {
  // 池壁：从 a 到 b 的竖直四边形
  const pos = new Float32Array([
    a[0], yTop, a[1], b[0], yTop, b[1], b[0], yBot, b[1],
    a[0], yTop, a[1], b[0], yBot, b[1], a[0], yBot, a[1],
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0]), 2));
  g.computeVertexNormals();
  return g;
}

export function buildWater() {
  const group = new THREE.Group();
  const hideDuringReflect = [];

  // ---- 水面几何：三块梯形合并，交给一个 Reflector（一次额外渲染，不是三次）----
  const waterGeo = mergeGeos(POOLS.map((p) => quadXZ(p.v, WATER_Y)));
  const shader = {
    name: 'CartoonWater',
    uniforms: {
      color: { value: new THREE.Color(0x88a0b0) },
      tDiffuse: { value: null },
      uRippleTex: { value: null },
      textureMatrix: { value: new THREE.Matrix4() },
      uBody: { value: new THREE.Color(C.waterBody) },
      uDeep: { value: new THREE.Color(C.waterDeep) },
      uSky: { value: new THREE.Color(0xd8ecfa) },
      uSunColor: { value: new THREE.Color(0xfff2d8) },
      uSunDir: { value: V3(0, 1, 0) },
      uWarm: { value: new THREE.Color(0xffcf8a) },
      uTime: { value: 0 },
      uSparkle: { value: 1 },
      uNight: { value: 0 },
      uRipple: { value: 1 },
      uOpacity: { value: 0.90 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  };
  const reflector = new Reflector(waterGeo, {
    shader,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xc8d6e0,
    clipBias: 0.0035,
    multisample: 0,
  });
  reflector.material.uniforms.uRippleTex.value = waterRippleTexture();   // 克隆后的 uniforms 要单独赋值
  reflector.material.transparent = true;
  reflector.material.side = THREE.DoubleSide;   // 绕序不一也不要被背面剔除掉整块水面
  reflector.material.depthWrite = true;
  reflector.receiveShadow = false;
  reflector.castShadow = false;
  reflector.name = 'water';
  group.add(reflector);

  // 反射期间隐藏大量小物件（草/人/鸟/涟漪）——它们在水里几乎看不见，却很吃三角形
  const origBefore = reflector.onBeforeRender;
  reflector.onBeforeRender = function (renderer, scene, camera) {
    const vis = hideDuringReflect.map((o) => o.visible);
    hideDuringReflect.forEach((o) => { o.visible = false; });
    origBefore.call(this, renderer, scene, camera);
    hideDuringReflect.forEach((o, i) => { o.visible = vis[i]; });
  };

  // ---- 池底（瓷砖）+ 池壁 ----
  const floorTex = poolFloorTexture();
  floorTex.repeat.set(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0xffffff, roughness: 0.45, metalness: 0.0, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfe0e4, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const floors = [], walls = [];
  for (const p of POOLS) {
    floors.push(quadXZ(p.v, BASIN_Y));
    for (let i = 0; i < 4; i++) walls.push(wallStrip(p.v[i], p.v[(i + 1) % 4], 0.07, BASIN_Y));   // 顶面离铺装 7cm，别贴着
  }
  const floorMesh = new THREE.Mesh(mergeGeos(floors), floorMat);
  floorMesh.receiveShadow = true; floorMesh.castShadow = false;
  group.add(floorMesh);
  const wallMesh = new THREE.Mesh(mergeGeos(walls), wallMat);
  wallMesh.receiveShadow = true; wallMesh.castShadow = false;
  group.add(wallMesh);

  // ---- 池边石缘（沿外缘三边；贴金字塔那一边由金字塔自己的石基座收口）----
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xefe3c8, roughness: 0.9, metalness: 0 });
  const curbs = [];
  for (const p of POOLS) {
    for (let i = 1; i < 4; i++) {
      const a = p.v[i], b = p.v[(i + 1) % 4];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.9;
      const g = rboxG(1.05, 0.62, len, 0, 0, 0, 0.12, 2);
      g.rotateY(Math.atan2(b[0] - a[0], b[1] - a[1]));
      g.translate(mid[0], 0.16, mid[1]);
      curbs.push(g);
    }
  }
  const curbMesh = new THREE.Mesh(mergeGeos(curbs), curbMat);
  curbMesh.castShadow = true; curbMesh.receiveShadow = true;
  group.add(curbMesh);

  // ---- 喷泉：三池各一注 ----
  const jets = [];
  const fountainNodes = [];
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xeaf7ff, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x8f9aa4, metalness: 0.6, roughness: 0.35 });
  const jetDefs = [[0, -24.6, 0], [0, 24.6, 0], [24.6, 0, 0]];
  const DROPS = 26;
  for (const [x, z] of jetDefs) {
    const nozzle = new THREE.Mesh(cylG(0.34, 0.52, 0.6, 10, x, WATER_Y + 0.25, z), nozzleMat);
    nozzle.castShadow = true;
    group.add(nozzle);
    fountainNodes.push(nozzle);
    const geo = sphG(0.17, 0, 0, 0, 7);
    const im = new THREE.InstancedMesh(geo, dropMat, DROPS);
    im.castShadow = false; im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
    hideDuringReflect.push(im);
    fountainNodes.push(im);
    jets.push({ x, z, im, seeds: Array.from({ length: DROPS }, (_, i) => ({ t0: i / DROPS, sp: rnd(0.85, 1.15), ang: rnd(0, TAU), rad: rnd(0.1, 0.9) })) });
  }

  // ---- 涟漪圆环 ----
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const rings = [];
  for (const [x, z] of jetDefs) {
    for (let k = 0; k < 2; k++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), ringMat.clone());
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, WATER_Y + 0.02, z);
      r.userData = { phase: k * 0.5, x, z };
      rings.push(r);
      group.add(r);
      hideDuringReflect.push(r);
      fountainNodes.push(r);
    }
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

  return {
    group,
    reflector,
    hideDuringReflect,
    fountainNodes,
    update(st) {
      const u = reflector.material.uniforms;
      u.uSky.value.copy(st.skyHor);
      u.uSunColor.value.copy(st.sunColor).multiplyScalar(lerp(0.55, 1.0, st.dayF));
      u.uSunDir.value.copy(st.dayF > 0.02 ? st.sunDir : st.moonDir);
      u.uSparkle.value = lerp(0.25, 1.0, Math.max(st.dayF, st.nightF * 0.7));
      u.uNight.value = st.nightF;
      // 水体本色随天色走：黄昏别留一块白天的蓝
      u.uBody.value.setHex(C.waterBody).lerp(st.skyHor, st.goldenF * 0.55).multiplyScalar(lerp(0.30, 1.05, st.dayF));
      u.uDeep.value.setHex(C.waterDeep).lerp(st.skyHor, st.goldenF * 0.3).multiplyScalar(lerp(0.24, 0.98, st.dayF));
      u.uWarm.value.setHex(0xffcf8a).multiplyScalar(0.55 + st.nightF * 0.6);
      u.uOpacity.value = 0.90;
      floorMat.color.setHex(0xffffff).multiplyScalar(lerp(0.42, 1.15, st.dayF));
      wallMat.color.setHex(0xcfe0e4).multiplyScalar(lerp(0.30, 1.0, st.dayF));
      curbMat.color.setHex(0xefe3c8).multiplyScalar(lerp(0.34, 1.0, st.dayF));
    },
    tick(t, dt, st) {
      const u = reflector.material.uniforms;
      u.uTime.value = t;
      u.uRipple.value = lerp(0.55, 1.25, clamp(st.goldenF + 0.3, 0, 1));
      // 喷泉：抛物线水珠
      for (const j of jets) {
        for (let i = 0; i < DROPS; i++) {
          const s = j.seeds[i];
          const life = ((t * 0.62 * s.sp) + s.t0) % 1;
          const h = Math.sin(life * Math.PI) * 4.6;
          const spread = 0.25 + life * 0.85;
          _p.set(j.x + Math.cos(s.ang) * s.rad * spread, WATER_Y + 0.35 + h, j.z + Math.sin(s.ang) * s.rad * spread);
          _s.setScalar(0.75 + Math.sin(life * Math.PI) * 0.5);
          _q.setFromAxisAngle(V3(0, 1, 0), s.ang);
          _m.compose(_p, _q, _s);
          j.im.setMatrixAt(i, _m);
        }
        j.im.instanceMatrix.needsUpdate = true;
      }
      // 涟漪扩散
      for (const r of rings) {
        const life = ((t * 0.42 + r.userData.phase) % 1);
        const sc = 0.7 + life * 6.4;
        r.scale.set(sc, sc, sc);
        r.material.opacity = (1 - life) * 0.42 * (0.5 + st.dayF * 0.5);
      }
    },
    jets,
  };
}
