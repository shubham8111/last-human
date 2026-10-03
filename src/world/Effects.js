import * as THREE from 'three';

const MAX_PARTICLES = 2400;
const MAX_DECALS = 80;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

// Particles, shockwaves, ground decals and floating HTML text.
export class Effects {
  constructor(scene, labelLayer) {
    this.scene = scene;
    this.layer = labelLayer;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const N = MAX_PARTICLES;
    this.p = {
      x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N),
      vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
      life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N),
      grav: new Float32Array(N), drag: new Float32Array(N), spin: new Float32Array(N),
      grow: new Float32Array(N),
      cr: new Float32Array(N), cg: new Float32Array(N), cb: new Float32Array(N),
    };
    this.alive = []; // slots with life > 0
    this.free = [];
    this.steal = 0;
    for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.mesh.count = 0;

    // Shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
      );
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, size: 1 });
    }

    // Ground decals (blood / scorch)
    const dGeo = new THREE.CircleGeometry(1, 10);
    dGeo.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(
      dGeo,
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.85, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      MAX_DECALS,
    );
    this.decals.setColorAt(0, new THREE.Color());
    this.decals.receiveShadow = true;
    this.decals.frustumCulled = false;
    this.decalCursor = 0;
    for (let i = 0; i < MAX_DECALS; i++) {
      _m.makeScale(0, 0, 0);
      this.decals.setMatrixAt(i, _m);
    }
    scene.add(this.decals);

    this.texts = [];
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, grav = -18, drag = 1.5, grow = 0) {
    const p = this.p;
    let i = this.free.pop();
    if (i === undefined) i = this.alive[this.steal++ % this.alive.length]; // pool full: recycle a live particle
    else this.alive.push(i);
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size;
    p.grav[i] = grav; p.drag[i] = drag; p.grow[i] = grow;
    p.spin[i] = Math.random() * 10;
    p.cr[i] = color.r;
    p.cg[i] = color.g;
    p.cb[i] = color.b;
  }

  // A burst of chunky gore when a zombie dies.
  gore(x, y, z, scale = 1, color = 0x5d8a3a) {
    const base = new THREE.Color(color);
    const red = new THREE.Color(0.5, 0.03, 0.03);
    const n = Math.round(10 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      _c.copy(Math.random() < 0.55 ? red : base).multiplyScalar(0.7 + Math.random() * 0.5);
      this.spawn(x, y + Math.random() * 0.8 * scale, z, Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp - 2,
        0.6 + Math.random() * 0.5, (0.08 + Math.random() * 0.14) * scale, _c);
    }
    this.decal(x, z, (0.5 + Math.random() * 0.5) * scale, 0x2e0505);
  }

  sparks(x, y, z, color = [3, 2.2, 0.8], n = 4, speed = 6) {
    _c.setRGB(color[0], color[1], color[2]);
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.2) * speed,
        0.15 + Math.random() * 0.2, 0.06 + Math.random() * 0.05, _c, -10, 3);
    }
  }

  // Short-lived bright puff at a gun barrel.
  muzzle(x, y, z, tint) {
    _c.setRGB(tint[0] * 1.3, tint[1] * 1.3, tint[2] * 1.3);
    this.spawn(x, y, z, 0, 0, -3, 0.05, 0.22, _c, 0, 0, 2);
  }

  flame(x, y, z, vx, vz) {
    const k = Math.random();
    _c.setRGB(1.6 + k * 0.8, 0.45 + k * 0.5, 0.06);
    this.spawn(x, y, z, vx, 0.5 + Math.random() * 1.5, vz, 0.22 + Math.random() * 0.1, 0.16, _c, 3, 2.5, 2.2);
  }

  explosion(x, y, z, scale = 1) {
    for (let i = 0; i < 40 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2;
      const sp = (4 + Math.random() * 10) * scale;
      _c.setRGB(4 + Math.random() * 2, 1.4 + Math.random() * 1.4, 0.25);
      this.spawn(x, y + 0.5, z, Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp + 3, Math.sin(a) * sp * Math.cos(e),
        0.35 + Math.random() * 0.4, (0.2 + Math.random() * 0.3) * scale, _c, -6, 3, 1.5);
    }
    for (let i = 0; i < 18 * scale; i++) {
      const g = 0.08 + Math.random() * 0.06;
      _c.setRGB(g, g * 0.9, g * 0.9);
      this.spawn(x + (Math.random() - 0.5) * 2 * scale, y + 0.5, z + (Math.random() - 0.5) * 2 * scale,
        (Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3, 1.0 + Math.random() * 0.8,
        (0.5 + Math.random() * 0.5) * scale, _c, 1.5, 1.5, 1.4);
    }
    this.ring(x, z, 5 * scale, [3.5, 1.6, 0.5], 0.45);
    this.decal(x, z, 1.8 * scale, 0x120c0a);
  }

  ring(x, z, size, color = [2, 2, 2], life = 0.5) {
    const r = this.rings.find((r) => r.life <= 0) || this.rings[0];
    r.life = life;
    r.max = life;
    r.size = size;
    r.mesh.position.set(x, 0.12, z);
    r.mesh.material.color.setRGB(color[0], color[1], color[2]);
    r.mesh.visible = true;
  }

  decal(x, z, size, color) {
    const i = this.decalCursor;
    this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    _e.set(0, Math.random() * 6.28, 0);
    _q.setFromEuler(_e);
    _s.set(size * (0.8 + Math.random() * 0.4), 1, size);
    _p.set(x, 0.04 + i * 0.0004, z);
    _m.compose(_p, _q, _s);
    this.decals.setMatrixAt(i, _m);
    this.decals.setColorAt(i, _c.set(color));
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
  }

  clearDecals() {
    for (let i = 0; i < MAX_DECALS; i++) {
      _m.makeScale(0, 0, 0);
      this.decals.setMatrixAt(i, _m);
    }
    this.decals.instanceMatrix.needsUpdate = true;
  }

  // Floating text over a world position (e.g. "+10", "x2", "+5 🪙").
  text(pos, str, cls = '', life = 1.0) {
    const el = document.createElement('div');
    el.className = 'float-text ' + cls;
    el.textContent = str;
    this.layer.appendChild(el);
    this.texts.push({ el, pos: pos.clone(), life, max: life });
  }

  clearTexts() {
    for (const t of this.texts) t.el.remove();
    this.texts.length = 0;
  }

  update(dt, camera) {
    const p = this.p;
    const alive = this.alive;
    // Instance k is the k-th live particle, so only live ones are drawn; swap-remove keeps `alive` dense.
    for (let k = 0; k < alive.length; ) {
      const i = alive[k];
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        this.free.push(i);
        alive[k] = alive[alive.length - 1];
        alive.pop();
        continue;
      }
      const d = Math.exp(-p.drag[i] * dt);
      p.vx[i] *= d;
      p.vz[i] *= d;
      p.vy[i] = p.vy[i] * d + p.grav[i] * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.05) {
        p.y[i] = 0.05;
        p.vy[i] *= -0.3;
        p.vx[i] *= 0.6;
        p.vz[i] *= 0.6;
      }
      const t = p.life[i] / p.max[i];
      const s = p.size[i] * (p.grow[i] > 0 ? 1 + (1 - t) * p.grow[i] : Math.min(1, t * 3));
      p.spin[i] += dt * 8;
      _e.set(p.spin[i], p.spin[i] * 0.7, 0);
      _q.setFromEuler(_e);
      _s.set(s, s, s);
      _p.set(p.x[i], p.y[i], p.z[i]);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(k, _m);
      this.mesh.instanceColor.setXYZ(k, p.cr[i], p.cg[i], p.cb[i]);
      k++;
    }
    this.mesh.count = alive.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.max;
      const s = r.size * (0.2 + 0.8 * Math.sqrt(t));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 1 - t;
      if (r.life <= 0) r.mesh.visible = false;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.el.remove();
        this.texts.splice(i, 1);
        continue;
      }
      t.pos.y += dt * 2.2;
      _p.copy(t.pos).project(camera);
      const k = t.life / t.max;
      const sc = k > 0.85 ? 1 + (k - 0.85) * 4 : 1;
      t.el.style.transform = `translate(-50%,-50%) translate(${(_p.x * 0.5 + 0.5) * w}px,${(-_p.y * 0.5 + 0.5) * h}px) scale(${sc})`;
      t.el.style.opacity = Math.min(1, k * 2.5);
    }
  }
}
