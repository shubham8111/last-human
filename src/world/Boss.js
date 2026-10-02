import * as THREE from 'three';
import { bossGeometry, walkerMaterial } from '../render/Models.js';
import { ROAD_HALF } from './Road.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export class Boss {
  constructor(scene) {
    this.scene = scene;
    const geo = bossGeometry();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
    this.stride = new THREE.InstancedBufferAttribute(new Float32Array([3]), 1);
    geo.setAttribute('aStride', this.stride);
    this.mat = walkerMaterial();
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 1);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);

    const discGeo = new THREE.CircleGeometry(1, 40);
    discGeo.rotateX(-Math.PI / 2);
    this.disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.1), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }),
    );
    this.disc.visible = false;
    scene.add(this.disc);
    const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), toneMapped: false, transparent: true }));
    this.disc.add(this.ringMesh);
    this.ringMesh.position.y = 0.01;

    const stripGeo = new THREE.PlaneGeometry(1, 1);
    stripGeo.rotateX(-Math.PI / 2);
    this.strip = new THREE.Mesh(stripGeo, this.disc.material);
    this.strip.visible = false;
    scene.add(this.strip);

    this.active = false;
    this.hide();
  }

  hide() {
    this.active = false;
    _m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(0, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.disc.visible = false;
    this.strip.visible = false;
  }

  start(ev, squad) {
    this.active = true;
    this.name = ev.name;
    this.scale = ev.scale;
    this.hp = this.maxHp = Math.round(ev.hp);
    this.x = 0;
    this.z = squad.z - 30;
    this.state = 'enter';
    this.t = 0;
    this.attackT = 2.5;
    this.attack = null;
    this.flash = 0;
    this.clawT = 0;
    this.charges = ev.scale >= 3.4;
    this.summons = ev.summons || 0;
    this.speed = 1.2 + ev.scale * 0.05;
    this.dying = 0;
    this.lunge = 0;
  }

  get radius() {
    return 0.75 * this.scale;
  }

  damage(n) {
    if (!this.active || this.dying) return false;
    this.hp -= n;
    this.flash = 0.06;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dying = 0.001;
      this.disc.visible = false;
      this.strip.visible = false;
      return true;
    }
    return false;
  }

  // game hooks: { slam(x,z,r), charge(x, halfWidth), claw(), summon(x,z,n), roar(), warn() }
  update(dt, time, squad, hooks) {
    if (!this.active) return;
    this.mat.userData.uniforms.uTime.value = time;
    const s = this.scale;
    let tilt = 0;
    let armRaise = 0;

    if (this.dying) {
      this.dying += dt;
      tilt = -Math.min(1, this.dying / 1.2) * 1.5;
      const sink = Math.max(0, this.dying - 1.2) * 1.5;
      this.pose(tilt, sink);
      if (this.dying > 2.2) this.hide();
      return;
    }

    this.t += dt;
    const contactZ = squad.z - squad.radius - this.radius - 0.4;

    if (this.state === 'enter') {
      if (this.t > 0.2 && !this.roared) {
        this.roared = true;
        hooks.roar();
      }
      if (this.t > 1.6) {
        this.state = 'walk';
        this.roared = false;
      }
    } else {
      // Approach until in claw range
      if (this.z < contactZ) {
        this.z = Math.min(contactZ, this.z + this.speed * dt + this.lunge * dt);
        this.stride.array[0] = 3.5;
      } else {
        this.stride.array[0] = 0;
        this.clawT -= dt;
        if (this.clawT <= 0) {
          this.clawT = 0.6;
          hooks.claw();
        }
      }
      this.stride.needsUpdate = true;
      this.lunge = Math.max(0, this.lunge - dt * 30);
      this.x += (squad.x * 0.6 - this.x) * dt * 0.6;
      this.x = THREE.MathUtils.clamp(this.x, -ROAD_HALF + 1, ROAD_HALF - 1);

      if (!this.attack) {
        this.attackT -= dt;
        if (this.attackT <= 0) this.beginAttack(squad, hooks);
      } else {
        const a = this.attack;
        a.t += dt;
        const k = Math.min(1, a.t / a.wind);
        if (a.type === 'slam') {
          armRaise = k;
          this.disc.position.set(a.x, 0.08, a.z);
          this.disc.scale.setScalar(a.r);
          this.ringMesh.scale.setScalar(Math.max(0.05, k));
          this.disc.material.opacity = 0.25 + Math.sin(a.t * 18) * 0.12;
          if (a.t >= a.wind) {
            this.disc.visible = false;
            hooks.slam(a.x, a.z, a.r);
            this.endAttack();
          }
        } else if (a.type === 'charge') {
          armRaise = k * 0.5;
          const len = Math.abs(squad.z - this.z) + 2;
          this.strip.position.set(a.x, 0.08, this.z + len / 2);
          this.strip.scale.set(a.w * 2, 1, len);
          this.disc.material.opacity = 0.25 + Math.sin(a.t * 18) * 0.12;
          if (a.t >= a.wind) {
            this.strip.visible = false;
            this.x = a.x;
            this.lunge = 40;
            hooks.charge(a.x, a.w);
            this.endAttack();
          }
        } else if (a.type === 'summon') {
          armRaise = Math.sin(k * Math.PI);
          if (a.t >= a.wind) {
            hooks.summon(this.x, this.z + 2, this.summons);
            this.endAttack();
          }
        }
      }
    }

    tilt = armRaise * 0.35 - (this.attack?.type === 'slam' && this.attack.t > this.attack.wind * 0.85 ? 0.6 : 0);
    this.pose(tilt, 0);
  }

  beginAttack(squad, hooks) {
    const options = ['slam', 'slam'];
    if (this.charges) options.push('charge');
    if (this.summons) options.push('summon');
    const type = options[(Math.random() * options.length) | 0];
    const wind = type === 'summon' ? 1.0 : 1.35;
    const a = { type, t: 0, wind };
    if (type === 'slam') {
      a.r = 1.6 + this.scale * 0.35;
      a.x = squad.x + (Math.random() - 0.5) * 1.5;
      a.z = squad.z - 0.5;
      this.disc.visible = true;
    } else if (type === 'charge') {
      a.w = 1.3 + this.scale * 0.15;
      a.x = THREE.MathUtils.clamp(squad.x, -ROAD_HALF + a.w, ROAD_HALF - a.w);
      this.strip.visible = true;
    }
    if (type !== 'summon') hooks.warn();
    this.attack = a;
  }

  endAttack() {
    this.attack = null;
    this.attackT = 2.2 + Math.random() * 1.5 - Math.min(1, this.scale * 0.1);
  }

  pose(tilt, sink) {
    const s = this.scale;
    _e.set(tilt, Math.PI, 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(s, s, s);
    _p.set(this.x, -sink, this.z);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(0, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.flash > 0) {
      this.flash -= 1 / 60;
      this.mesh.setColorAt(0, _p.set(2.5, 2.5, 2.5));
    } else {
      this.mesh.setColorAt(0, _p.set(1, 1, 1));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
}
