import * as THREE from 'three';
import { zombieGeometry, bruteGeometry, barrelGeometry, walkerMaterial } from '../render/Models.js';
import { ROAD_HALF } from './Road.js';

export const ENEMY_TYPES = {
  walker: { hp: 3, speed: 2.4, radius: 0.45, bite: 1, scale: 0.72, coin: 1, cap: 600, stride: 6, gore: 0x5d8a3a },
  runner: { hp: 2, speed: 6.2, radius: 0.42, bite: 1, scale: 0.66, coin: 1, cap: 300, stride: 13, gore: 0x8a5a3a },
  brute: { hp: 28, speed: 1.8, radius: 0.95, bite: 6, scale: 1.4, coin: 8, cap: 60, stride: 4, gore: 0x4a7a3a },
  barrel: { hp: 3, speed: 0, radius: 0.55, bite: 3, scale: 1, coin: 0, cap: 80, stride: 0, gore: 0 },
};

const TINTS = {
  walker: [[1, 1, 1], [0.85, 1, 0.8], [1.1, 0.95, 0.85], [0.75, 0.85, 0.9], [1, 0.8, 0.8]],
  runner: [[1.25, 0.8, 0.7], [1.1, 0.7, 0.6], [1.2, 0.9, 0.7]],
  brute: [[1, 1, 1], [0.85, 0.95, 0.8]],
  barrel: [[1, 1, 1]],
};

const LABELS = 70;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

let nextId = 1;

export class Enemies {
  constructor(scene, labelLayer) {
    this.scene = scene;
    this.list = [];
    this.pools = {};
    this.walkMat = walkerMaterial();
    const geos = { walker: zombieGeometry(), runner: zombieGeometry(), brute: bruteGeometry(), barrel: barrelGeometry() };
    for (const [type, cfg] of Object.entries(ENEMY_TYPES)) {
      const geo = geos[type];
      const isBarrel = type === 'barrel';
      if (!isBarrel) {
        const ph = new Float32Array(cfg.cap);
        for (let i = 0; i < cfg.cap; i++) ph[i] = Math.random() * 6.28;
        geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
        geo.setAttribute('aStride', new THREE.InstancedBufferAttribute(new Float32Array(cfg.cap).fill(cfg.stride), 1));
      }
      const mat = isBarrel ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }) : this.walkMat;
      const mesh = new THREE.InstancedMesh(geo, mat, cfg.cap);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, _c.setRGB(1, 1, 1));
      const free = [];
      for (let i = cfg.cap - 1; i >= 0; i--) {
        free.push(i);
        _m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _m);
      }
      scene.add(mesh);
      this.pools[type] = { mesh, free, cfg };
    }

    this.labels = [];
    for (let i = 0; i < LABELS; i++) {
      const el = document.createElement('div');
      el.className = 'hp-label';
      el.style.display = 'none';
      labelLayer.appendChild(el);
      this.labels.push(el);
    }
  }

  spawn(type, x, z, hpScale = 1, opts = {}) {
    const pool = this.pools[type];
    const slot = pool.free.pop();
    if (slot === undefined) return null;
    const cfg = pool.cfg;
    const tints = TINTS[type];
    const tint = tints[(Math.random() * tints.length) | 0];
    const hp = Math.max(1, Math.round(cfg.hp * hpScale * (opts.hpMul || 1)));
    const e = {
      id: nextId++,
      type,
      cfg,
      slot,
      x,
      z,
      hp,
      maxHp: hp,
      state: 'idle',
      t: 0,
      flash: 0,
      tint,
      speed: cfg.speed * (0.85 + Math.random() * 0.3) * (opts.speedMul || 1),
      rot: Math.PI + (Math.random() - 0.5) * 0.6,
      aggro: opts.aggro ?? 34 + Math.random() * 8,
      stack: opts.stack || 1, // one zombie standing in for several (huge hordes)
      wobble: Math.random() * 6.28,
    };
    pool.mesh.setColorAt(slot, _c.setRGB(tint[0], tint[1], tint[2]));
    pool.mesh.instanceColor.needsUpdate = true;
    this.list.push(e);
    return e;
  }

  free(e) {
    const pool = this.pools[e.type];
    _m.makeScale(0, 0, 0);
    pool.mesh.setMatrixAt(e.slot, _m);
    pool.free.push(e.slot);
  }

  clear() {
    for (const e of this.list) this.free(e);
    this.list.length = 0;
    for (const p of Object.values(this.pools)) p.mesh.instanceMatrix.needsUpdate = true;
  }

  damage(e, amount) {
    if (e.state === 'dying') return false;
    e.hp -= amount;
    e.flash = 0.07;
    if (e.state === 'idle' && e.type !== 'barrel') e.state = 'chase';
    if (e.hp <= 0) {
      e.state = 'dying';
      e.t = 0;
      return true;
    }
    return false;
  }

  aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.state !== 'dying' && e.type !== 'barrel') n++;
    return n;
  }

  // Moves enemies, animates them. Calls onContact(e) when one reaches the squad.
  update(dt, time, squad, camera, onContact, stopZ = null) {
    this.walkMat.userData.uniforms.uTime.value = time;
    const sr = squad.radius;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const e = this.list[k];
      const pool = this.pools[e.type];
      if (e.state === 'dying') {
        e.t += dt;
        if (e.t > 0.55) {
          this.free(e);
          this.list.splice(k, 1);
          continue;
        }
      } else if (e.type !== 'barrel') {
        const dz = squad.z - e.z;
        if (e.state === 'idle' && dz < e.aggro && dz > -4) e.state = 'chase';
        if (e.state === 'chase') {
          const dx = squad.x - e.x;
          const d = Math.hypot(dx, dz) || 1;
          // Mostly charge forward, steer sideways only slowly — lane choice matters.
          const lateral = Math.abs(dz) < 7 ? 0.9 : 0.3;
          e.x += (dx / d) * e.speed * lateral * dt;
          e.z += Math.max(0.25, dz / d) * e.speed * dt;
          e.x = THREE.MathUtils.clamp(e.x, -ROAD_HALF + 0.4, ROAD_HALF - 0.4);
          e.rot = Math.PI + Math.atan2(-dx, Math.max(2, dz)) * 0.8 + Math.sin(time * 3 + e.wobble) * 0.1;
        } else {
          e.rot = Math.PI + Math.sin(time * 0.7 + e.wobble) * 0.4;
        }
      }

      if (e.state !== 'dying') {
        const dx = e.x - squad.x;
        const dz = e.z - squad.z;
        const reach = sr + e.cfg.radius * 0.8;
        if (dx * dx + dz * dz < reach * reach && squad.count > 0) {
          onContact(e);
          continue;
        }
        // Wandered behind the camera: despawn quietly.
        if (e.z > squad.z + 8) {
          this.free(e);
          this.list.splice(k, 1);
          continue;
        }
      }

      // Pose
      const s = e.cfg.scale;
      let tilt = 0;
      let sink = 0;
      if (e.state === 'dying') {
        const t = Math.min(1, e.t / 0.35);
        tilt = -t * 1.45;
        sink = Math.max(0, e.t - 0.35) * 2.5;
      }
      _e.set(tilt, e.rot, Math.sin(time * 2.3 + e.wobble) * 0.08 * (e.type === 'barrel' ? 0 : 1), 'YXZ');
      _q.setFromEuler(_e);
      const bscale = e.type === 'barrel' ? 1 : s;
      _s.set(bscale, bscale, bscale);
      _p.set(e.x, -sink, e.z);
      _m.compose(_p, _q, _s);
      pool.mesh.setMatrixAt(e.slot, _m);
      if (e.flash > 0) {
        e.flash -= dt;
        const f = e.flash > 0 ? 3.2 : 1;
        const t = e.tint;
        pool.mesh.setColorAt(e.slot, _c.setRGB(t[0] * f, t[1] * f, t[2] * f));
        pool.mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const p of Object.values(this.pools)) p.mesh.instanceMatrix.needsUpdate = true;
    this.updateLabels(squad, camera);
  }

  updateLabels(squad, camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let used = 0;
    // Nearest-first labels for enemies on screen.
    const shown = this.list
      .filter((e) => e.state !== 'dying' && e.type !== 'barrel' && squad.z - e.z < 42 && (e.maxHp > 1 || e.type === 'brute'))
      .sort((a, b) => b.z - a.z);
    for (const e of shown) {
      if (used >= LABELS) break;
      _p.set(e.x, e.cfg.scale * 2.1 + 0.2, e.z).project(camera);
      if (_p.z > 1) continue;
      const el = this.labels[used++];
      el.style.display = '';
      el.textContent = Math.ceil(e.hp);
      el.className = 'hp-label' + (e.type === 'brute' ? ' big' : '') + (e.type === 'runner' ? ' fast' : '');
      el.style.transform = `translate(-50%,-50%) translate(${(_p.x * 0.5 + 0.5) * w}px,${(-_p.y * 0.5 + 0.5) * h}px)`;
    }
    for (let i = used; i < LABELS; i++) if (this.labels[i].style.display !== 'none') this.labels[i].style.display = 'none';
  }

  hideLabels() {
    for (const l of this.labels) l.style.display = 'none';
  }
}
