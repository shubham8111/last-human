import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FOG_COLOR = new THREE.Color(0x5a3f52);

export class Stage {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG_COLOR, 45, 150);
    scene.background = FOG_COLOR.clone();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 500);
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 12, 14);
    this.shake = 0;
    this.time = 0;

    this.buildSky();
    this.buildLights();

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(420, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(-0.35, 0.12, -1).normalize() },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform float uTime;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main() {
          float h = vDir.y;
          vec3 top = vec3(0.05, 0.06, 0.16);
          vec3 mid = vec3(0.36, 0.17, 0.26);
          vec3 hor = vec3(1.25, 0.52, 0.22);
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
          col = mix(col, top, smoothstep(0.18, 0.6, h));
          float s = max(dot(vDir, uSunDir), 0.0);
          col += vec3(2.6, 1.2, 0.45) * pow(s, 380.0) * 3.0;  // sun disc (blooms)
          col += vec3(1.0, 0.45, 0.18) * pow(s, 10.0) * 0.6;  // halo
          // drifting smoke bands near the horizon
          float band = sin(vDir.x * 14.0 + uTime * 0.05) * sin(vDir.z * 9.0 - uTime * 0.03);
          col = mix(col, vec3(0.18, 0.1, 0.14), smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.2, 0.35, h)) * (0.25 + 0.2 * band));
          // stars
          vec2 g = floor(vDir.xz / max(h, 0.05) * 90.0);
          float st = step(0.997, hash(g)) * smoothstep(0.3, 0.7, h);
          col += vec3(st) * 0.8;
          if (h < 0.0) col = mix(hor * 0.45, vec3(0.2, 0.12, 0.15), smoothstep(0.0, -0.1, h));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x9aa6ff, 0x4a3026, 1.35);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffb57a, 3.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 34;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const rim = new THREE.DirectionalLight(0x6f8cff, 1.1);
    rim.position.set(6, 8, -20);
    this.rim = rim;
    this.scene.add(rim);
    this.scene.add(rim.target);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.aspect = w / h;
    // Portrait screens need a taller, wider view so the road fits.
    this.portrait = w / h < 1;
    this.camera.fov = this.portrait ? 68 : 52;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  // Follow a point on the road (the squad), with a little lag and shake.
  follow(x, z, dt, mode = 'run') {
    const back = this.portrait ? 17 : 14;
    const up = this.portrait ? 16 : 11.5;
    let desired, look;
    if (mode === 'menu') {
      const a = this.time * 0.12;
      desired = new THREE.Vector3(x + Math.sin(a) * 13, 5.5, z + Math.cos(a) * 13);
      look = new THREE.Vector3(x, -0.15, z);
    } else if (mode === 'boss') {
      desired = new THREE.Vector3(x * 0.4, up + 2.5, z + back + 3);
      look = new THREE.Vector3(x * 0.25, 1, z - 14);
    } else {
      desired = new THREE.Vector3(x * 0.55, up, z + back);
      look = new THREE.Vector3(x * 0.35, 0.5, z - 12);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.camPos.lerp(desired, k);
    this.camTarget.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.6;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.camTarget);

    // Keep the shadow frustum and sky centred on the action.
    this.sun.position.set(x - 14, 26, z + 8);
    this.sun.target.position.set(x, 0, z - 8);
    this.rim.target.position.set(x, 0, z);
    this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
  }

  snapCamera(x, z) {
    this.camPos.set(x * 0.55, 11.5, z + 14);
    this.camTarget.set(x * 0.35, 0.5, z - 12);
  }

  render(dt) {
    this.time += dt;
    this.sky.material.uniforms.uTime.value = this.time;
    this.composer.render(dt);
  }
}
