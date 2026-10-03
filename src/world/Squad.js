import * as THREE from 'three';
import { soldierGeometry, heroGeometry, walkerMaterial } from '../render/Models.js';
import { ROAD_HALF } from './Road.js';

export const DISPLAY_MAX = 130;
export const MAX_SQUAD = 9999;
const SPACING = 0.36;
const SCALE = 0.56;
const MAX_RADIUS = 2.5; // a crowd must always fit inside one lane (lane width 7)
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const BASE_RATE = 2.0; // shots per second per shooter
const SHOOTERS = 50; // beyond this many, extra soldiers add damage instead of bullets

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export class Squad {
  constructor(scene, labelLayer) {
    this.scene = scene;
    this.mat = walkerMaterial();
    this.geo = soldierGeometry();
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, DISPLAY_MAX);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const phase = new Float32Array(DISPLAY_MAX);
    for (let i = 0; i < DISPLAY_MAX; i++) phase[i] = Math.random() * 6.28;
    this.geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.stride = new THREE.InstancedBufferAttribute(new Float32Array(DISPLAY_MAX).fill(11), 1);
    this.geo.setAttribute('aStride', this.stride);
    scene.add(this.mesh);

    this.heroMat = walkerMaterial();
    this.heroMesh = null;

    this.label = document.createElement('div');
    this.label.className = 'squad-count';
    labelLayer.appendChild(this.label);

    this.soldiers = []; // {ox, oz} current offsets (index 0 is unused: hero stands there)
    this.count = 0;
    this.x = 0;
    this.z = 0;
    this.targetX = 0;
    this.shotAcc = 0;
    this.running = true;
    this.visible = true;
  }

  setHero(hero) {
    if (this.heroMesh) {
      this.scene.remove(this.heroMesh);
      this.heroMesh.geometry.dispose();
    }
    const g = heroGeometry(hero.color);
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    this.heroStride = new THREE.InstancedBufferAttribute(new Float32Array([11]), 1);
    g.setAttribute('aStride', this.heroStride);
    this.heroMesh = new THREE.InstancedMesh(g, this.heroMat, 1);
    this.heroMesh.castShadow = true;
    this.heroMesh.frustumCulled = false;
    this.scene.add(this.heroMesh);
    this.hero = hero;
  }

  reset(count) {
    this.count = 0;
    this.soldiers.length = 0;
    this.x = this.targetX = 0;
    this.z = 0;
    this.shotAcc = 0;
    this.setCount(count);
    for (const s of this.soldiers) {
      s.ox = s.tx;
      s.oz = s.tz;
    }
    this.label.style.display = '';
  }

  get displayCount() {
    return Math.min(this.count, DISPLAY_MAX);
  }

  // Big squads pack tighter (and soldiers shrink a little) instead of spreading out.
  get spacing() {
    return Math.min(SPACING, MAX_RADIUS / Math.sqrt(Math.max(1, this.displayCount)));
  }

  get scale() {
    return THREE.MathUtils.clamp(this.spacing * 1.75, 0.44, SCALE);
  }

  get radius() {
    return this.spacing * Math.sqrt(Math.max(1, this.displayCount)) * 1.05 + 0.25;
  }

  target(i) {
    const r = this.spacing * Math.sqrt(i);
    const a = i * GOLDEN;
    return [Math.sin(a) * r, Math.cos(a) * r * 0.9];
  }

  setCount(n) {
    n = THREE.MathUtils.clamp(Math.floor(n), 0, MAX_SQUAD);
    const before = this.count;
    this.count = n;
    const want = Math.min(n, DISPLAY_MAX);
    while (this.soldiers.length < want) {
      const i = this.soldiers.length;
      const [tx, tz] = this.target(i);
      // new recruits burst out from the centre
      this.soldiers.push({ ox: tx * 0.2, oz: tz * 0.2, tx, tz });
    }
    if (this.soldiers.length > want) this.soldiers.length = want;
    this.soldiers.forEach((s, i) => ([s.tx, s.tz] = this.target(i)));
    if (before !== n) {
      this.label.classList.remove('bump-up', 'bump-down');
      void this.label.offsetWidth;
      this.label.classList.add(n > before ? 'bump-up' : 'bump-down');
    }
  }

  // Remove soldiers; returns world positions of the ones that visibly died.
  lose(n, fromX = this.x, fromZ = this.z - 5) {
    n = Math.min(n, this.count);
    if (n <= 0) return [];
    const dead = [];
    // Hidden reserve soldiers (beyond DISPLAY_MAX) die first, invisibly.
    const hidden = Math.max(0, this.count - DISPLAY_MAX);
    const visible = Math.max(0, n - hidden);
    if (visible > 0 && this.soldiers.length > 1) {
      // Kill the visible soldiers closest to the attack, then re-pack the formation.
      const idx = this.soldiers
        .map((s, i) => [i, (this.x + s.ox - fromX) ** 2 + (this.z + s.oz - fromZ) ** 2])
        .filter(([i]) => i > 0)
        .sort((a, b) => a[1] - b[1])
        .slice(0, visible)
        .map(([i]) => i);
      for (const i of idx) dead.push(_v.set(this.x + this.soldiers[i].ox, 0.5, this.z + this.soldiers[i].oz).clone());
      const keep = this.soldiers.filter((_, i) => !idx.includes(i));
      this.soldiers = keep;
    }
    this.setCount(this.count - n);
    return dead;
  }

  // Soldiers whose world position falls inside a circle (boss slam).
  countInside(x, z, r) {
    let c = 0;
    for (const s of this.soldiers) if ((this.x + s.ox - x) ** 2 + (this.z + s.oz - z) ** 2 < r * r) c++;
    return c;
  }

  setRunning(on) {
    if (on === this.running) return;
    this.running = on;
    const v = on ? 11 : 0;
    this.stride.array.fill(v);
    this.stride.needsUpdate = true;
    if (this.heroStride) {
      this.heroStride.array[0] = v;
      this.heroStride.needsUpdate = true;
    }
  }

  steer(dx, axis, dt) {
    this.targetX += dx + axis * 15 * dt;
    const lim = Math.max(0.3, ROAD_HALF - Math.min(this.radius, ROAD_HALF - 1.2) - 0.2);
    this.targetX = THREE.MathUtils.clamp(this.targetX, -lim, lim);
  }

  // Fire from random soldiers' guns. Returns number of bullets spawned.
  fire(dt, bullets, effects, stats, audio) {
    if (this.count <= 0) return;
    const w = stats.weapon;
    const shooters = Math.min(this.count, SHOOTERS);
    const sps = shooters * BASE_RATE * stats.rate * w.rate;
    // Soldiers beyond the shooters add damage with steep diminishing returns —
    // past a point, a better gun beats a bigger crowd.
    const bonus = Math.pow(Math.max(1, this.count / SHOOTERS), 0.55);
    const dmg = stats.damage * w.damage * bonus;
    this.shotAcc += sps * dt;
    let fired = 0;
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      const n = this.soldiers.length;
      const i = n > 1 && Math.random() < 0.85 ? 1 + ((Math.random() * (n - 1)) | 0) : 0;
      const s = this.soldiers[i] || { ox: 0, oz: 0 };
      const heroScale = i === 0 ? 1.25 : 1;
      const sc = i === 0 ? SCALE : this.scale;
      const gx = this.x + s.ox - 0.04 * sc;
      const gy = 1.05 * sc * heroScale;
      const gz = this.z + s.oz - 1.25 * sc * heroScale;
      const shots = w.shots + (stats.extraShots || 0);
      for (let k = 0; k < shots; k++) {
        const spread = shots > 1 ? (k / (shots - 1) - 0.5) * 2 * Math.max(w.spread, 0.1) : 0;
        const ang = spread + (Math.random() - 0.5) * (w.spread * 0.6 + 0.03);
        bullets.spawn(gx, gy, gz, Math.sin(ang) * w.speed, -Math.cos(ang) * w.speed, w.life, dmg, w.pierce, w.size, w.tint, w.flame);
      }
      if (!w.flame && Math.random() < 0.35) effects.muzzle(gx, gy, gz - 0.15, w.tint);
      fired++;
    }
    if (fired) audio.shot(w.flame);
  }

  update(dt, time, camera) {
    this.mat.userData.uniforms.uTime.value = time;
    this.heroMat.userData.uniforms.uTime.value = time;
    this.x += (this.targetX - this.x) * (1 - Math.exp(-dt * 10));

    const k = 1 - Math.exp(-dt * 7);
    const n = this.soldiers.length;
    const sc = this.scale;
    _s.set(sc, sc, sc);
    const shown = this.visible ? n : 0;
    this.mesh.count = shown;
    for (let i = 0; i < shown; i++) {
      if (i === 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      const s = this.soldiers[i];
      s.ox += (s.tx - s.ox) * k;
      s.oz += (s.tz - s.oz) * k;
      _e.set(0, Math.sin(time * 2 + i) * 0.08 + (this.targetX - this.x) * -0.05, 0);
      _q.setFromEuler(_e);
      _p.set(this.x + s.ox, 0, this.z + s.oz);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.heroMesh) {
      const hs = SCALE * 1.25;
      _e.set(0, (this.targetX - this.x) * -0.06, 0);
      _q.setFromEuler(_e);
      _p.set(this.x, 0, this.z);
      _m.compose(_p, _q, _v.set(hs, hs, hs));
      if (this.count <= 0 || !this.visible) _m.makeScale(0, 0, 0);
      this.heroMesh.setMatrixAt(0, _m);
      this.heroMesh.instanceMatrix.needsUpdate = true;
    }

    // Count bubble above the squad
    _p.set(this.x, 1.9 + Math.min(this.radius, 3) * 0.25, this.z - this.radius * 0.4).project(camera);
    const sx = (_p.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_p.y * 0.5 + 0.5) * window.innerHeight;
    this.label.style.transform = `translate(-50%,-100%) translate(${sx}px,${sy}px)`;
    if (this.shownCount !== this.count) this.label.textContent = this.shownCount = this.count;
    this.label.style.display = this.visible && this.count > 0 ? '' : 'none';
  }
}
