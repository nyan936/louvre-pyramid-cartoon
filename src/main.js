// main.js —— 卢浮宫金字塔 · 卡通三维场景：装配、光照、相机、UI、自检 API
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dayState, clamp, lerp, smoothstep, V3 } from './base.js';
import { buildSky, buildHorizon } from './sky.js';
import { buildWorld } from './world.js';
import { buildPalace } from './palace.js';
import { buildPyramid } from './pyramid.js';
import { buildWater } from './water.js';
import { buildProps } from './props.js';
import { buildPost } from './post.js';

// ---------------- 渲染器 ----------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fb6cf, 150, 900);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.35, 9000);
camera.position.set(-84, 30, 32);   // 与 CAMS.hero 一致，保证首屏就是全景机位

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 8, 0);
controls.minDistance = 8;
controls.maxDistance = 430;
controls.minPolarAngle = 0.10;
controls.maxPolarAngle = Math.PI - 0.02;   // 允许抬头看星空；地面由 y>=1.1 兜底
controls.update();

// ---------------- 光照 ----------------
const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -172; sun.shadow.camera.right = 172;
sun.shadow.camera.top = 172; sun.shadow.camera.bottom = -172;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

const moon = new THREE.DirectionalLight(0xa8c4ff, 0.0);
scene.add(moon, moon.target);

const hemi = new THREE.HemisphereLight(0xdcecfa, 0x93a074, 0.6);
scene.add(hemi);

const amb = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(amb);

const fill = new THREE.DirectionalLight(0xffffff, 0.2);
scene.add(fill, fill.target);

// ---------------- 场景模块 ----------------
const sky = buildSky();
const horizon = buildHorizon();
const world = buildWorld();
const water = buildWater();
const palace = buildPalace();
const pyramid = buildPyramid();
const props = buildProps();
const mods = [sky, horizon, world, palace, pyramid, water, props];
for (const m of mods) scene.add(m.group);

// 反射期间隐藏大量小物件（水里的倒影几乎看不见它们）
water.hideDuringReflect.push(...world.hideDuringReflect, ...props.hideDuringReflect);

const post = buildPost(renderer, scene, camera);

// ---------------- 环境反射贴图（随昼夜重建，节流）----------------
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
let envHour = -99;
let prevEnvRT = null;   // 延迟一轮再释放：立刻 dispose 会让换贴图后的第一帧材质引用已释放纹理而发黑
function refreshEnv(st) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0.0, '#' + st.skyTop.getHexString());
  grd.addColorStop(0.48, '#' + st.skyHor.getHexString());
  grd.addColorStop(0.52, '#' + st.skyHor.clone().multiplyScalar(0.9).getHexString());
  grd.addColorStop(1.0, '#' + new THREE.Color(0x6b6a5c).multiplyScalar(lerp(0.16, 1.0, st.dayF)).getHexString());
  g.fillStyle = grd; g.fillRect(0, 0, 64, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const rt = pmrem.fromEquirectangular(tex);
  if (prevEnvRT) prevEnvRT.dispose();
  prevEnvRT = rt;
  scene.environment = rt.texture;
  scene.environmentIntensity = 0.50;
  tex.dispose();
  envHour = st.hour;
}

// ---------------- 状态与相机预设 ----------------
const state = {
  hour: 15.4,
  exposure: 0.95,
  autoOrbit: true,
  bloom: true,
  shadows: true,
  people: true,
  fountain: true,
  quality: 'high',
  cam: 'hero',
  fps: 0,
};
const CAMS = {
  hero: { label: '全景', pos: [-84, 30, 32], tgt: [0, 8, 0] },
  close: { label: '贴脸', pos: [-34, 9, 25], tgt: [0, 12, 0] },
  entrance: { label: '入口', pos: [-26, 2.0, 5], tgt: [-5, 12, 0] },
  axis: { label: '中轴', pos: [-72, 5.0, 9], tgt: [-4, 11, 0] },
  east: { label: '东侧', pos: [42, 16, -44], tgt: [0, 13, 0] },
  aerial: { label: '鸟瞰', pos: [-88, 86, 118], tgt: [0, 4, 0] },
  sky: { label: '星空', pos: [0, 8, -20], tgt: [-6, 180, 30] },   // 抬头看星与流星
  ridge: { label: '屋脊', pos: [70, 33.5, -61], tgt: [-20, 29.8, -61] },   // 贴屋脊看屋面/烟囱/脊饰是否贴合
};
const camTween = { active: false, t: 0, dur: 1.25, fromPos: V3(), toPos: V3(), fromTgt: V3(), toTgt: V3() };
function setCam(name) {
  const c = CAMS[name];
  if (!c) return;
  state.cam = name;
  camTween.fromPos.copy(camera.position);
  camTween.fromTgt.copy(controls.target);
  camTween.toPos.set(...c.pos);
  camTween.toTgt.set(...c.tgt);
  camTween.t = 0;
  camTween.active = true;
  state.autoOrbit = false;
  syncUI();
}
// 瞬时切机位（无缓动）：自检/自动截图必须用这个，否则会读到缓动中间态
function jumpCam(name) {
  const c = CAMS[name];
  if (!c) return;
  state.cam = name;
  camTween.active = false;
  camera.position.set(...c.pos);
  controls.target.set(...c.tgt);
  state.autoOrbit = false;
  camera.updateMatrixWorld(true);
  syncUI();
}
function setHour(h) {
  state.hour = ((h % 24) + 24) % 24;
  const el = document.getElementById('hour');
  if (el) el.value = String(state.hour);
  syncUI();
  applyDay(dayState(state.hour));   // 立即生效，自检 API 同步读到正确状态
}

let orbitA = Math.atan2(camera.position.z - controls.target.z, camera.position.x - controls.target.x);
let orbitR = 0;

// ---------------- 每帧 ----------------
let time = 0, last = performance.now(), fpsAcc = 0, fpsN = 0;
function updateLights(st) {
  const se = Math.max(0, st.se);
  sun.intensity = (0.40 + 1.95 * Math.pow(se, 0.5)) * st.dayF;
  sun.color.copy(st.sunColor);
  sun.position.copy(st.sunDir).multiplyScalar(300);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = state.shadows && st.dayF > 0.03;
  sun.shadow.intensity = clamp(0.12 + se * 2.4, 0, 1) * 0.92;

  moon.intensity = st.nightF * 0.42;
  moon.position.copy(st.moonDir).multiplyScalar(300);
  moon.target.position.set(0, 0, 0);

  const hemiDay = st.skyHor.clone().lerp(new THREE.Color(0xffffff), 0.34);
  const hemiNight = new THREE.Color(0x4d6fa8);
  hemi.color.copy(hemiDay).lerp(hemiNight, st.nightF);
  hemi.groundColor.setHex(0x9aa87c).lerp(new THREE.Color(0xc9a878), st.goldenF).lerp(new THREE.Color(0x2b3550), st.nightF);
  hemi.intensity = 0.20 + 0.58 * st.dayF + 0.30 * st.goldenF + 0.80 * st.nightF;

  amb.intensity = 0.05 + 0.09 * st.dayF + 0.40 * st.nightF;

  // 相机侧补光：逆光下不糊成黑块
  const dir = camera.position.clone().sub(controls.target).normalize();
  fill.position.copy(controls.target).add(dir.multiplyScalar(120)).add(V3(0, 60, 0));
  fill.target.position.copy(controls.target);
  fill.intensity = (0.10 + 0.18 * st.dayF) * (1 - st.nightF * 0.40);
  fill.color.copy(st.skyHor).lerp(new THREE.Color(0xffffff), 0.5);
}

// 立即把某个时刻的状态应用到场景（供 setHour / 自检 API 同步调用）
let _st = null;
function applyDay(st) {
  _st = st;
  scene.fog.color.copy(st.fogColor);
  updateLights(st);
  for (const m of mods) m.update(st);
  renderer.toneMappingExposure = state.exposure * st.exposure;
  post.update(time, st);
  if (Math.abs(state.hour - envHour) > 0.4) refreshEnv(st);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { state.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }

  const st = dayState(state.hour);

  // 相机：预设过渡 / 自动环绕 / 用户拖拽
  if (camTween.active) {
    camTween.t += dt;
    const k = clamp(camTween.t / camTween.dur, 0, 1);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTgt, camTween.toTgt, e);
    if (k >= 1) camTween.active = false;
  } else if (state.autoOrbit) {
    const tgt = controls.target;
    if (!orbitR) orbitR = camera.position.distanceTo(tgt);
    orbitA += dt * 0.055;
    const h = 16 + Math.sin(time * 0.11) * 7;
    camera.position.set(tgt.x + Math.cos(orbitA) * orbitR, tgt.y + h, tgt.z + Math.sin(orbitA) * orbitR);
    camera.lookAt(tgt);
  }
  controls.enabled = !state.autoOrbit && !camTween.active;
  controls.update();
  if (camera.position.y < 1.1) camera.position.y = 1.1;   // 别钻到地面以下

  for (const m of mods) if (m.tick) m.tick(time, dt, st);
  sky.tickMeteor(dt, st);
  applyDay(st);
  post.composer.render();

  const hud = document.getElementById('hud');
  if (hud && fpsN === 1) hud.textContent = `${state.fps} fps`;
  requestAnimationFrame(frame);
}

// ---------------- UI 联动 ----------------
const TOGGLES = {
  orbit: (v) => { state.autoOrbit = v; if (v) orbitR = 0; },
  bloom: (v) => { state.bloom = v; post.setBloom(v); },
  shadows: (v) => { state.shadows = v; },
  people: (v) => { state.people = v; props.crowd.group.visible = v; },
  fountain: (v) => { state.fountain = v; for (const n of water.fountainNodes) n.visible = v; },
  quality: (v) => {
    state.quality = v ? 'high' : 'low';
    renderer.setPixelRatio(v ? Math.min(devicePixelRatio, 1.75) : 1.0);
    const rt = water.reflector.getRenderTarget();
    rt.setSize(v ? 1024 : 384, v ? 1024 : 384);
    sun.shadow.mapSize.set(v ? 2048 : 1024, v ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  },
};
function syncUI() {
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === state.cam));
  document.querySelectorAll('[data-toggle]').forEach((b) => {
    const k = b.dataset.toggle;
    if (k === 'quality') b.classList.toggle('on', state.quality === 'high');
    else if (k === 'orbit') b.classList.toggle('on', state.autoOrbit);
    else b.classList.toggle('on', !!state[k]);
  });
  document.querySelectorAll('[data-hour]').forEach((b) => b.classList.toggle('on', Math.abs(parseFloat(b.dataset.hour) - state.hour) < 0.06));
  const hl = document.getElementById('hourLabel');
  if (hl) {
    const h = Math.floor(state.hour), m = Math.floor((state.hour - h) * 60);
    hl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const el = document.getElementById('hour');
  if (el && Math.abs(parseFloat(el.value) - state.hour) > 0.001) el.value = String(state.hour);
}
function bindUI() {
  const el = document.getElementById('hour');
  if (el) { el.value = String(state.hour); el.addEventListener('input', () => setHour(parseFloat(el.value))); }
  const ex = document.getElementById('exposure');
  if (ex) {
    ex.value = String(state.exposure);
    ex.addEventListener('input', () => {
      state.exposure = parseFloat(ex.value);
      const lab = document.getElementById('expLabel');
      if (lab) lab.textContent = state.exposure.toFixed(2);
      applyDay(dayState(state.hour));
    });
  }
  document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
  document.querySelectorAll('[data-hour]').forEach((b) => b.addEventListener('click', () => setHour(parseFloat(b.dataset.hour))));
  document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    const cur = k === 'quality' ? state.quality === 'high' : (k === 'orbit' ? state.autoOrbit : state[k]);
    TOGGLES[k](!cur);
    syncUI();
  }));
  controls.addEventListener('start', () => { state.autoOrbit = false; camTween.active = false; syncUI(); });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
  });
}
bindUI();
// URL 参数：?hour=17.75&cam=aerial&ui=0&orbit=1 —— 便于分享指定状态 / 自动截图取证
{
  const q = new URLSearchParams(location.search);
  if (q.has('hour')) { const h = parseFloat(q.get('hour')); if (Number.isFinite(h)) setHour(h); }
  if (q.has('cam') && CAMS[q.get('cam')]) { jumpCam(q.get('cam')); state.autoOrbit = q.get('orbit') === '1'; }
  if (q.get('ui') === '0') for (const id of ['dock', 'brand', 'cams', 'hudwrap', 'scrim']) document.getElementById(id)?.style.setProperty('display', 'none');
}
syncUI();
addEventListener('keydown', (e) => {
  if (e.key === 'o' || e.key === 'O') { TOGGLES.orbit(!state.autoOrbit); syncUI(); }
  if (e.key === 'h' || e.key === 'H') { document.getElementById('dock')?.classList.toggle('hide'); }
});

// ---------------- 自检 API ----------------
function stats() {
  let tris = 0, meshes = 0, visibleTris = 0;
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes++;
    const g = o.geometry;
    const c = g.index ? g.index.count : g.getAttribute('position')?.count || 0;
    let n = c / 3;
    if (o.isInstancedMesh) n *= o.count;
    tris += n;
    if (o.visible && o.parent?.visible) visibleTris += n;
  });
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    fps: state.fps,
    tris_total: Math.round(tris),
    tris_visible_upper_bound: Math.round(visibleTris),
    meshes,
    programs: renderer.info.programs?.length ?? 0,
    calls_last_pass: renderer.info.render.calls,
    hour: state.hour,
    cam: state.cam,
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a',
    size: [renderer.domElement.width, renderer.domElement.height],
    pixelRatio: renderer.getPixelRatio(),
  };
}

// 采样：直接读 GL 后备缓冲（与截图同源）。先排空几帧，避免读到状态切换的中间帧
let _buf = null, _bw = 0, _bh = 0;
function readBuf() {
  const gl = renderer.getContext();
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (!_buf || _bw !== w || _bh !== h) { _buf = new Uint8Array(w * h * 4); _bw = w; _bh = h; }
  for (let i = 0; i < 6; i++) post.composer.render();
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, _buf);
  return { d: _buf, w, h };
}
// 归一化坐标（y 向下）→ 缓冲区下标（readPixels 原点在左下）
function px(buf, x, y) {
  const ix = Math.min(buf.w - 1, Math.max(0, Math.round(x * (buf.w - 1))));
  const iy = Math.min(buf.h - 1, Math.max(0, Math.round((1 - y) * (buf.h - 1))));
  return (iy * buf.w + ix) * 4;
}
function sample() {
  const buf = readBuf();
  const stepX = Math.max(1, Math.floor(buf.w / 120)), stepY = Math.max(1, Math.floor(buf.h / 68));
  let sum = [0, 0, 0], n = 0, black = 0, over = 0;
  const grid = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  for (let iy = 0; iy < buf.h; iy += stepY) {
    for (let ix = 0; ix < buf.w; ix += stepX) {
      const i = (iy * buf.w + ix) * 4;
      const r = buf.d[i], g = buf.d[i + 1], b = buf.d[i + 2];
      sum[0] += r; sum[1] += g; sum[2] += b; n++;
      if (r + g + b < 24) black++;
      if (r > 250 && g > 250 && b > 250) over++;
      const nx = ix / buf.w, ny = 1 - iy / buf.h;   // ny：0 在顶部
      const gi = Math.min(2, Math.floor(ny * 3)) * 3 + Math.min(2, Math.floor(nx * 3));
      grid[gi][0] += r; grid[gi][1] += g; grid[gi][2] += b; grid[gi][3]++;
    }
  }
  const g2 = grid.map(([r, gg, b, c]) => [Math.round(r / c), Math.round(gg / c), Math.round(b / c)]);
  return {
    mean: sum.map((v) => Math.round(v / n)),
    blackPct: +(100 * black / n).toFixed(2),
    overPct: +(100 * over / n).toFixed(2),
    grid: [g2.slice(0, 3), g2.slice(3, 6), g2.slice(6, 9)],
  };
}
function regionMean(x0, y0, x1, y1) {
  const buf = readBuf();
  const X0 = Math.max(0, Math.floor(x0 * buf.w)), X1 = Math.min(buf.w, Math.ceil(x1 * buf.w));
  const Y0 = Math.max(0, Math.floor(y0 * buf.h)), Y1 = Math.min(buf.h, Math.ceil(y1 * buf.h));
  const stepX = Math.max(1, Math.floor((X1 - X0) / 60)), stepY = Math.max(1, Math.floor((Y1 - Y0) / 60));
  let s = [0, 0, 0], n = 0;
  for (let y = Y0; y < Y1; y += stepY) {
    const iy = buf.h - 1 - y;
    for (let x = X0; x < X1; x += stepX) {
      const i = (iy * buf.w + x) * 4;
      s[0] += buf.d[i]; s[1] += buf.d[i + 1]; s[2] += buf.d[i + 2]; n++;
    }
  }
  return n ? s.map((v) => Math.round(v / n)) : [0, 0, 0];
}
window.__DBG__ = { Raycaster: THREE.Raycaster, Vector2: THREE.Vector2, Vector3: THREE.Vector3 };  // 只导出射线拾取所需，避免整包 THREE 进 bundle
window.__SCENE__ = {
  state, CAMS, setHour, setCam, jumpCam, stats, sample, regionMean, TOGGLES, syncUI, applyDay,
  scene, camera, renderer, controls, post, mods, water, props, palace, pyramid, sky, horizon, world,
};

// 首帧
refreshEnv(dayState(state.hour));
requestAnimationFrame(frame);
window.__READY__ = true;
