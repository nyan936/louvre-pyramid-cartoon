// post.js —— 后处理：Bloom → OutputPass(ACES+sRGB) → 自写调色（饱和/暖调/暗角/颗粒）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.09 },
    uContrast: { value: 1.04 },
    uWarm: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
    uVig: { value: 0.34 },
    uGrain: { value: 0.022 },
    uTime: { value: 0 },
    uLift: { value: 0.012 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSat, uContrast, uVig, uGrain, uTime, uLift;
    uniform vec3 uWarm;
    varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                       // 饱和
      c = (c - 0.5) * uContrast + 0.5;                 // 对比
      c = c * uWarm;                                   // 暖调
      c = c * (1.0 - uLift) + uLift;                   // 抬一点黑位，避免塑料黑
      float d = distance(vUv, vec2(0.5, 0.48));
      c *= 1.0 - smoothstep(0.34, 0.92, d) * uVig;     // 暗角
      float n = fract(sin(dot(vUv * vec2(1213.7, 917.3) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a);
    }`,
};

export function buildPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // 半分辨率的 bloom 在强点光源上会出现方形块状伪影（用户报的"泛光是正方形的"）→ 提到 3/4 分辨率并降强度
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * 0.75, size.y * 0.75), 0.42, 0.85, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return {
    composer, bloom, grade,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.setSize(w * 0.75, h * 0.75);
    },
    update(t, st) {
      grade.uniforms.uTime.value = t;
      grade.uniforms.uVig.value = 0.30 + st.nightF * 0.16 + st.goldenF * 0.06;
      grade.uniforms.uSat.value = 1.10 - st.nightF * 0.06 + st.goldenF * 0.05;
      grade.uniforms.uContrast.value = 1.04 + st.goldenF * 0.05;
      grade.uniforms.uWarm.value.set(1.0 + st.goldenF * 0.05, 1.0 + st.goldenF * 0.01, 1.0 - st.goldenF * 0.05);
      grade.uniforms.uGrain.value = 0.020 + st.nightF * 0.012;
      bloom.strength = 0.24 + st.nightF * 0.24 + st.goldenF * 0.14;
      bloom.threshold = 0.86 - st.nightF * 0.10;
    },
    setBloom(on) { bloom.enabled = on; },
  };
}
