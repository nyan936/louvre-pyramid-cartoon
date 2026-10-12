// sky.js —— 渐变穹顶、日月、星空、卡通云、飞鸟、远景巴黎
import * as THREE from 'three';
import { C, TAU, rnd, rndInt, rng, mergeGeos, paint, boxG, rboxG, sphG, cylG, coneG, atG, meshOf, V3, clamp, lerp, smoothstep, cityFacadeTexture, hipRoofG } from './base.js';

const SKY_VERT = /* glsl */`
varying vec3 vWorld;
void main(){
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 自写渐变穹顶（不用物理 Sky：HDR 值被 ACES 一压就整片纯白）
const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHor, uHaze, uSunColor, uSunDir;
uniform float uGlow, uNight;
varying vec3 vWorld;
void main(){
  vec3 d = normalize(vWorld);
  float h = clamp(d.y, 0.0, 1.0);
  float t = pow(h, 0.58);
  vec3 c = mix(uHor, uTop, t);
  float az = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
  c = mix(c, uHaze, pow(az, 2.4) * uGlow * (1.0 - t) * 0.85);
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunColor * pow(sd, 1400.0) * 7.0;         // 日面
  c += uSunColor * pow(sd, 22.0) * 0.16 * uGlow;  // 大光晕
  c = mix(c, vec3(0.010, 0.018, 0.042), uNight * (1.0 - h) * 0.55);
  gl_FragColor = vec4(c, 1.0);
}`;

export function buildSky() {
  const group = new THREE.Group();
  const uniforms = {
    uTop: { value: new THREE.Color(0x3d86cc) },
    uHor: { value: new THREE.Color(0xd8ecfa) },
    uHaze: { value: new THREE.Color(0xffd9a0) },
    uSunColor: { value: new THREE.Color(0xfff2d8) },
    uSunDir: { value: V3(0, 1, 0) },
    uGlow: { value: 1 },
    uNight: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4200, 40, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false })
  );
  dome.frustumCulled = false;
  group.add(dome);

  // ---- 星空 ----
  const N = 900;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // 真随机均匀球面：z 均匀取样 + 方位角随机（无网格感）
    const y = 0.015 + 0.985 * Math.pow(rnd(0, 1), 0.75) * (rng() > 0.42 ? 1 : -1);
    const yy = Math.max(0.015, Math.abs(y));
    const a = rnd(0, TAU);
    const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
    pos[i * 3] = Math.cos(a) * rad * 3950; pos[i * 3 + 1] = yy * 3950; pos[i * 3 + 2] = Math.sin(a) * rad * 3950;
    const warm = rnd(0.86, 1.0);
    const b = rnd(0.72, 1.0);
    col[i * 3] = warm * b; col[i * 3 + 1] = warm * b * rnd(0.93, 1.0); col[i * 3 + 2] = b;
    sz[i] = Math.pow(rnd(0, 1), 2.2) * 13 + 3.2;   // 大小幂律：少数亮星 + 大量暗星
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('asize', new THREE.BufferAttribute(sz, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `attribute float asize; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=asize; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float m=pow(smoothstep(0.5,0.04,r),1.8); gl_FragColor=vec4(vC, m*uOpacity); }`,
    transparent: true, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  group.add(stars);

  // ---- 流星（随机间隔划过）----
  const meteorTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 16;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 256, 0);
    grd.addColorStop(0.0, 'rgba(180,210,255,0)');
    grd.addColorStop(0.62, 'rgba(200,225,255,0.35)');
    grd.addColorStop(0.93, 'rgba(255,255,255,0.95)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 16);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const meteors = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.SpriteMaterial({ map: meteorTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, rotation: rnd(-1.25, -0.45) });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(320, 20, 1);
    sp.visible = false;
    sp.frustumCulled = false;
    group.add(sp);
    meteors.push({ sp, mat, life: 0, dur: 1.1, wait: rnd(1.5, 12), dir: new THREE.Vector3(), start: new THREE.Vector3() });
  }
  function respawnMeteor(m) {
    const a = rnd(0, TAU);
    const el = rnd(0.28, 1.1);
    m.start.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(3750);
    // 切向速度：让流星横着划过
    const t1 = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    m.dir.copy(t1).multiplyScalar(rnd(-1500, 1500)).add(new THREE.Vector3(0, rnd(-260, 260), 0));
    m.sp.position.copy(m.start);
    m.sp.visible = true;
    m.life = 0;
    m.wait = rnd(2.5, 16);
  }
  for (const m of meteors) m.wait = rnd(0.4, 9);   // 首次出现时间错开

  // ---- 月亮 ----
  const moon = new THREE.Group();
  const moonTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#f2f6ff'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 14; i++) {
      const r = rnd(3, 11), x = rnd(0, 128), y = rnd(6, 58);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(196,208,228,0.85)'); grd.addColorStop(1, 'rgba(196,208,228,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  moon.add(new THREE.Mesh(new THREE.SphereGeometry(46, 26, 18), new THREE.MeshBasicMaterial({ map: moonTex, color: 0xffffff, fog: false })));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(104, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.14, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  moon.add(halo);
  moon.frustumCulled = false;
  group.add(moon);
  const moonMat = moon.children[0].material, haloMat = halo.material;

  // ---- 卡通云：球簇合并，flatshading 的块状感 ----
  const clouds = [];
  // 卡通云：MeshBasicMaterial + 顶点色（上白下淡蓝）—— 一旦交给光照就会变成灰石块
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false, transparent: true, opacity: 1 });
  for (let i = 0; i < 15; i++) {
    const parts = [];
    const puffs = rndInt(5, 9);
    const baseR = rnd(16, 30), spread = rnd(1.4, 2.3);
    for (let p = 0; p < puffs; p++) {
      const r = baseR * rnd(0.55, 1.0);
      const px = rnd(-spread, spread) * baseR * 0.75;
      const py = Math.abs(rnd(-0.16, 0.5)) * baseR * 0.75;
      const pz = rnd(-0.55, 0.55) * baseR * 0.75;
      const s = new THREE.SphereGeometry(r, 7, 5);
      s.scale(1.18, rnd(0.62, 0.86), 1.0);
      s.translate(px, py, pz);
      parts.push(s);
    }
    const geo = mergeGeos(parts);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const posAttr = geo.getAttribute('position');
    const cTop = new THREE.Color(0xffffff), cBot = new THREE.Color(0xc3d4e6);
    const cAttr = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const t = clamp((posAttr.getY(i) - bb.min.y) / Math.max(0.001, bb.max.y - bb.min.y), 0, 1);
      const c = cBot.clone().lerp(cTop, Math.pow(t, 0.75));
      cAttr[i * 3] = c.r; cAttr[i * 3 + 1] = c.g; cAttr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cAttr, 3));
    const m = new THREE.Mesh(geo, cloudMat.clone());   // 每朵云独立材质（原来共用一个，per-cloud 色偏白设）
    const a = (i / 15) * TAU + rnd(-0.2, 0.2);
    const rad = rnd(300, 900);
    m.position.set(Math.cos(a) * rad, rnd(170, 300) + rad * 0.05, Math.sin(a) * rad);
    m.rotation.y = rnd(0, TAU);
    const sc = rnd(0.62, 1.25);
    m.scale.setScalar(sc);
    m.castShadow = false; m.receiveShadow = false;
    m.userData = { rad, a, speed: rnd(0.9, 2.2) / (rad * 0.02), spin: rnd(-0.01, 0.01), haze: clamp((rad - 260) / 900, 0, 0.75) };
    clouds.push(m);
    group.add(m);
  }

  // ---- 飞鸟 ----
  const birds = [];
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x4a4f5e, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 5), birdMat);
    body.scale.set(1.7, 0.75, 0.8);
    b.add(body);
    const wingGeo = new THREE.BoxGeometry(0.9, 0.05, 0.34);
    wingGeo.translate(0.45, 0, 0);
    const wl = new THREE.Mesh(wingGeo, birdMat);
    const wr = new THREE.Mesh(wingGeo, birdMat);
    wr.scale.x = -1;
    b.add(wl, wr);
    b.userData = { wl, wr, phase: rnd(0, TAU), a: rnd(0, TAU), rad: rnd(70, 150), y: rnd(28, 62), spin: rnd(0.16, 0.30) * (rng() > 0.5 ? 1 : -1), flap: rnd(7, 11) };
    b.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    birds.push(b);
    group.add(b);
  }

  return {
    group,
    update(st) {
      uniforms.uTop.value.copy(st.skyTop);
      uniforms.uHor.value.copy(st.skyHor);
      uniforms.uHaze.value.copy(st.skyHor).lerp(st.sunColor, 0.55);
      uniforms.uSunColor.value.copy(st.sunColor).multiplyScalar(lerp(0.25, 1.0, st.dayF));
      uniforms.uSunDir.value.copy(st.sunDir);
      uniforms.uGlow.value = clamp(st.goldenF * 1.1 + st.dayF * 0.55, 0, 1.35);
      uniforms.uNight.value = st.nightF;
      starMat.uniforms.uOpacity.value = smoothstep(0.15, 0.75, st.nightF);
      for (const m of meteors) if (st.nightF < 0.35) { m.sp.visible = false; m.mat.opacity = 0; }
      moon.position.copy(st.moonDir).multiplyScalar(3600);
      moon.visible = st.nightF > 0.06;
      moonMat.color.setHex(0xeef4ff).multiplyScalar(lerp(0.45, 0.86, st.nightF));
      haloMat.opacity = 0.10 * st.nightF;
      for (const m of clouds) {
        m.material.color.copy(st.cloudTint).lerp(st.fogColor, m.userData.haze).multiplyScalar(lerp(0.34, 1.0, st.dayF) + st.goldenF * 0.5);
        m.material.opacity = lerp(0.07, 1.0, st.dayF) + st.goldenF * 0.4;   // 夜里几乎隐去，别读成天上污渍
      }
      for (const b of birds) b.visible = st.dayF > 0.25 || st.goldenF > 0.3;
    },
    // 流星：可见度跟随夜色，随机间隔出现
    tickMeteor(dt, st) {
      if (st.nightF < 0.35) return;
      for (const m of meteors) {
        if (!m.sp.visible) { m.wait -= dt; if (m.wait <= 0) respawnMeteor(m); continue; }
        m.life += dt;
        const k = m.life / m.dur;
        m.sp.position.copy(m.start).addScaledVector(m.dir, m.life);
        m.mat.opacity = Math.sin(Math.min(1, k) * Math.PI) * st.nightF * 0.95;
        if (k >= 1) { m.sp.visible = false; m.mat.opacity = 0; m.wait = rnd(2.5, 16); }
      }
    },
    tick(t, dt, st) {
      for (const m of clouds) {
        const u = m.userData;
        u.a += (u.speed * 0.0016) * dt * 60;
        m.position.set(Math.cos(u.a) * u.rad, m.position.y, Math.sin(u.a) * u.rad);
        m.rotation.y += u.spin * dt;
      }
      for (const b of birds) {
        const u = b.userData;
        u.a += u.spin * dt;
        const x = Math.cos(u.a) * u.rad, z = Math.sin(u.a) * u.rad * 0.8;
        b.position.set(x, u.y + Math.sin(t * 0.7 + u.phase) * 1.6, z);
        b.rotation.y = -u.a + Math.PI / 2;
        b.rotation.z = Math.sin(t * 0.5 + u.phase) * 0.16;
        const f = Math.sin(t * u.flap + u.phase);
        u.wl.rotation.z = f * 0.7;
        u.wr.rotation.z = -f * 0.7;
      }
    },
  };
}

// 远景：巴黎屋顶线 + 树带 + 埃菲尔铁塔（雾外，手工做空气透视）
export function buildHorizon() {
  const group = new THREE.Group();
  group.position.y = -1.55;   // 外圈地面盘在 y=-1.60：远景必须一起下沉，否则楼房/树/铁塔整片浮空 1.6m

  // --- 屋顶环 ---
  const parts = [], roofParts = [];
  const placed = [];
  let placedCount = 0;
  for (let i = 0; i < 96; i++) {
    // 采样多次保证与已有楼房留间距：原来纯随机，相邻楼互相穿插，
    // 看起来就是屋顶缺一半、两栋楼贴着长在一起（用户报的图5/图6）
    let x = 0, z = 0, w = 0, d = 0, h = 0, y = 0, ok = false;
    for (let t = 0; t < 16 && !ok; t++) {
      const a = (i / 96) * TAU + rnd(-0.04, 0.04);
      const rad = rnd(210, 520);
      w = rnd(14, 34); d = rnd(14, 30); h = rnd(12, 30);
      x = Math.cos(a) * rad; z = Math.sin(a) * rad;
      ok = placed.every((q) => Math.hypot(q.x - x, q.z - z) > (Math.max(q.w, q.d) + Math.max(w, d)) * 0.62 + 6);
    }
    if (!ok) continue;
    placed.push({ x, z, w, d });
    placedCount++;
    y = rnd(-1, 3);
    parts.push(paint(boxG(w, h, d, x, y + h / 2, z), new THREE.Color(C.stone).offsetHSL(0, rnd(-0.02, 0.02), rnd(-0.05, 0.04))));
    // 四坡屋顶
    // 四坡顶：底面按楼体外扩 0.9m 做檐口、顶面内收，严格对齐楼体（原来用 4 段锥体，长方形楼体必然对不齐）
    const rw = w + 1.8, rd = d + 1.8, rh = rnd(4.5, 8.0);
    const roof = hipRoofG(
      [x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2],
      [x - rw * (0.14 + rnd(0, 0.06)), z - rd * 0.16, x + rw * (0.14 + rnd(0, 0.06)), z + rd * 0.16],
      y + h - 0.25, y + h - 0.25 + rh
    );
    roofParts.push(paint(roof, new THREE.Color(C.roof).offsetHSL(0, 0, rnd(-0.06, 0.05))));
    // 烟囱
    if (rng() > 0.5) { const hc = rnd(3, 6); roofParts.push(paint(boxG(1.8, hc, 1.8, x + rnd(-2, 2), y + h - 0.25 + rh + hc / 2 - 0.35, z + rnd(-2, 2)), 0xb9a288)); }   // 坐在屋顶上，原来悬空 1.5~6.5m
  }
  const cityTex = cityFacadeTexture();
  const cityMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: cityTex, roughness: 0.95, metalness: 0, flatShading: false, fog: false });
  const city = new THREE.Mesh(mergeGeos(parts), cityMat);
  city.castShadow = false; city.receiveShadow = false;
  group.add(city);
  console.info('[sky] 远景楼房落位:', placedCount, '/ 96（间距不足的跳过）');
  const cityRoofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: false, fog: false });
  const cityRoofs = new THREE.Mesh(mergeGeos(roofParts), cityRoofMat);
  cityRoofs.castShadow = false; cityRoofs.receiveShadow = false;
  group.add(cityRoofs);

  // --- 树带：把屋顶线和地面接起来 ---
  const tparts = [];
  for (let i = 0; i < 210; i++) {
    const a = rnd(0, TAU), rad = rnd(140, 330);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const s = rnd(3.4, 7.4);
    const blobs = rndInt(2, 4);
    for (let b = 0; b < blobs; b++) {
      const g = sphG(s * rnd(0.7, 1.05), 0, 0, 0, 7);
      g.scale(1, 0.92, 1);
      g.translate(x + rnd(-s * 0.5, s * 0.5), s * rnd(0.8, 1.3) + b * s * 0.35, z + rnd(-s * 0.5, s * 0.5));
      tparts.push(paint(g, new THREE.Color(C.leafB).offsetHSL(rnd(-0.03, 0.02), rnd(-0.08, 0.08), rnd(-0.08, 0.07))));
    }
    tparts.push(paint(cylG(0.22 * s, 0.3 * s, s * 1.0, 5, x, s * 0.5, z), C.trunkDark));
  }
  const trees = new THREE.Mesh(mergeGeos(tparts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, fog: false }));
  trees.castShadow = false; trees.receiveShadow = false;
  group.add(trees);

  // --- 埃菲尔铁塔（卡通简化：四条腿 + 平台 + 塔尖） ---
  const tp = [];
  const irColor = new THREE.Color(0x8a7a68);
  const H = 128;
  const legs = (y0, y1, r0, r1, inset0, inset1) => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const seg = rndInt(3, 4);
      for (let i = 0; i < seg; i++) {
        const t0 = i / seg, t1 = (i + 1) / seg;
        const rr = lerp(r0, r1, (t0 + t1) / 2);
        const yy = lerp(y0, y1, (t0 + t1) / 2);
        const ii = lerp(inset0, inset1, (t0 + t1) / 2);
        const g = atG(boxG(rr * 2, (y1 - y0) / seg, rr * 2, 0, 0, 0), [sx * ii, yy, sz * ii], [0, 0, sx * lerp(0.10, 0.02, (t0 + t1) / 2)]);
        tp.push(paint(g, irColor));
      }
    }
  };
  legs(0, 20, 2.6, 2.2, 15, 10);
  legs(20, 46, 2.2, 1.7, 10, 6.4);
  legs(46, 78, 1.7, 1.2, 6.4, 3.8);
  tp.push(paint(boxG(34, 1.6, 34, 0, 20, 0), irColor));
  tp.push(paint(boxG(22, 1.4, 22, 0, 46, 0), irColor));
  tp.push(paint(boxG(13, 1.2, 13, 0, 78, 0), irColor));
  tp.push(paint(boxG(5.6, 14, 5.6, 0, 85.5, 0), irColor));
  tp.push(paint(coneG(2.4, 12, 6, 0, 98.5, 0), irColor));
  const towerGeo = mergeGeos(tp);
  const towerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, emissive: new THREE.Color(0xffb257), emissiveIntensity: 0, fog: false });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  const TDIR = V3(-0.60, 0, 0.80).normalize();
  tower.position.copy(TDIR).multiplyScalar(930);
  tower.scale.setScalar(1.0);
  tower.castShadow = false; tower.receiveShadow = false;
  tower.rotateY(-0.5);
  group.add(tower);

  return {
    group,
    update(st) {
      // 空气透视：远处整体往雾色里退（不能用场景雾，会连近景一起洗白）
      const hz = clamp(lerp(0.52, 0.66, st.dayF), 0, 1);
      const target = st.skyHor.clone().lerp(st.fogColor, 0.35);
      cityMat.color.copy(new THREE.Color(0xffffff)).lerp(target, hz * 0.55);
      cityRoofMat.color.copy(new THREE.Color(0xffffff)).lerp(target, hz * 0.62);
      trees.material.color.copy(new THREE.Color(0xffffff)).lerp(target, hz * 0.68);
      towerMat.color.copy(new THREE.Color(0xffffff)).lerp(target, 0.62);
      // 夜里铁塔亮灯（真实里也是整点亮灯）
      towerMat.emissiveIntensity = st.nightF * 1.5;
      towerMat.emissive.copy(new THREE.Color(0xffb257)).lerp(new THREE.Color(0xffe0a8), st.nightF);
      for (const m of [city, trees, tower]) { m.visible = true; }
    },
    tick() {},
    tower,
    city,
  };
}
