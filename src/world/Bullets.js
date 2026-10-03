import * as THREE from 'three';

const MAX = 1400;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Pooled glowing tracers. Collision is resolved by the Game against enemies/gates/boss.
export class Bullets {
  constructor(scene, effects) {
    this.effects = effects;
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.7);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0; // grows with the highest live slot
    scene.add(this.mesh);
    this.x = new Float32Array(MAX);
    this.y = new Float32Array(MAX);
    this.z = new Float32Array(MAX);
    this.pz = new Float32Array(MAX); // previous z, for gate plane crossing
    this.vx = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.dmg = new Float32Array(MAX);
    this.pierce = new Int8Array(MAX);
    this.size = new Float32Array(MAX);
    this.flame = new Uint8Array(MAX);
    this.lastHit = new Int32Array(MAX).fill(-1);
    this.alive = []; // indices of live bullets
    this.free = [];
    for (let i = MAX - 1; i >= 0; i--) {
      this.free.push(i);
      this.hideIdx(i);
    }
  }

  hideIdx(i) {
    _m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, _m);
  }

  spawn(x, y, z, vx, vz, life, dmg, pierce, size, tint, flame) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vz[i] = vz;
    this.life[i] = life;
    this.dmg[i] = dmg;
    this.pierce[i] = pierce;
    this.size[i] = size;
    this.flame[i] = flame ? 1 : 0;
    this.lastHit[i] = -1;
    this.mesh.setColorAt(i, _c.setRGB(tint[0], tint[1], tint[2]));
    this.alive.push(i);
    if (i >= this.mesh.count) this.mesh.count = i + 1;
  }

  kill(k) {
    // k is the position in this.alive
    const i = this.alive[k];
    this.alive[k] = this.alive[this.alive.length - 1];
    this.alive.pop();
    this.free.push(i);
    this.hideIdx(i);
  }

  clear() {
    while (this.alive.length) this.kill(this.alive.length - 1);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    const fx = this.effects;
    for (let k = this.alive.length - 1; k >= 0; k--) {
      const i = this.alive[k];
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(k);
        continue;
      }
      this.pz[i] = this.z[i];
      this.x[i] += this.vx[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.flame[i]) {
        if (Math.random() < 0.16) fx.flame(this.x[i], this.y[i], this.z[i], this.vx[i] * 0.3, this.vz[i] * 0.3);
        this.hideIdx(i);
        continue;
      }
      _e.set(0, Math.atan2(this.vx[i], this.vz[i]), 0);
      _q.setFromEuler(_e);
      const s = this.size[i];
      _s.set(s, s, s);
      _p.set(this.x[i], this.y[i], this.z[i]);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    let hi = 0;
    for (const i of this.alive) if (i >= hi) hi = i + 1;
    this.mesh.count = hi;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
