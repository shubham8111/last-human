import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF } from './Road.js';

// Barricade walls (block a lane, cost soldiers equal to their number unless shot
// down) and saw blades (sweep across the road; time your crossing).
export class Hazards {
  constructor(scene) {
    this.scene = scene;
    this.walls = [];
    this.saws = [];

    this.concrete = new THREE.MeshStandardMaterial({ color: 0x8d8780, roughness: 0.95 });
    this.stripe = new THREE.MeshStandardMaterial({ color: 0xf2c218, roughness: 0.7 });
    this.darkMetal = new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.8, roughness: 0.35 });
    this.steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.25 });
    this.hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.1), toneMapped: false });

    // Saw blade: disc + teeth, merged. Disc faces the camera (normal along Z).
    const parts = [new THREE.CylinderGeometry(1, 1, 0.1, 32).rotateX(Math.PI / 2)];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const t = new THREE.ConeGeometry(0.13, 0.32, 3).rotateZ(-a).translate(Math.sin(a) * 1.08, Math.cos(a) * 1.08, 0);
      parts.push(t.index ? t.toNonIndexed() : t);
    }
    this.bladeGeo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    this.rimGeo = new THREE.TorusGeometry(0.82, 0.05, 6, 32);
    this.hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.22, 12).rotateX(Math.PI / 2);
  }

  // ---------- walls ----------

  spawnWall(ev, hpPer) {
    const g = new THREE.Group();
    const w = ev.w;
    g.position.set(ev.x, 0, -ev.d);
    const cols = 4;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const bw = w / cols - 0.06;
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.7, 0.8), this.concrete);
        b.position.set(-w / 2 + (c + 0.5) * (w / cols) + (r ? 0.15 : 0), 0.36 + r * 0.72, (Math.random() - 0.5) * 0.1);
        b.rotation.y = (Math.random() - 0.5) * 0.06;
        b.castShadow = true;
        b.receiveShadow = true;
        g.add(b);
      }
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.84), this.stripe);
    top.position.y = 1.5;
    g.add(top);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }),
    );
    sign.position.set(0, 2.35, 0.1);
    g.add(sign);
    this.scene.add(g);

    const wall = { x: ev.x, z: -ev.d, w, value: ev.value, progress: 0, hpPer, group: g, canvas, tex, alive: true, flash: 0, dirty: false };
    this.drawWall(wall);
    this.walls.push(wall);
    return wall;
  }

  drawWall(wall) {
    wall.dirty = false;
    const ctx = wall.canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(120,10,10,0.92)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 240, 112, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,180,0.8)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 72px Bungee, Impact, sans-serif';
    ctx.fillText(`-${wall.value}`, 128, 62);
    wall.tex.needsUpdate = true;
  }

  // A bullet crossing a wall's plane. Returns true if it struck the wall.
  bulletHit(x, pz, z, dmg) {
    for (const w of this.walls) {
      if (!w.alive || !(pz > w.z + 0.4 && z <= w.z + 0.4) || Math.abs(x - w.x) > w.w / 2) continue;
      w.progress += dmg;
      w.flash = 0.06;
      while (w.progress >= w.hpPer && w.value > 0) {
        w.progress -= w.hpPer;
        w.value--;
        w.dirty = true;
      }
      if (w.value <= 0) this.breakWall(w);
      return w;
    }
    return null;
  }

  breakWall(w) {
    w.alive = false;
    w.breakT = 0;
    w.broken = true;
  }

  // Squad crossing a wall: returns soldiers lost.
  squadCross(prevZ, z, sx, radius) {
    let lost = 0;
    const hits = [];
    for (const w of this.walls) {
      if (!w.alive || !(prevZ > w.z + 0.5 && z <= w.z + 0.5)) continue;
      if (Math.abs(sx - w.x) < w.w / 2 + radius * 0.5) {
        lost += w.value;
        hits.push(w);
        this.breakWall(w);
      }
    }
    return { lost, hits };
  }

  // ---------- saws ----------

  spawnSaw(ev) {
    const g = new THREE.Group();
    g.position.set(0, 0, -ev.d);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.12, 0.5), this.darkMetal);
    rail.position.y = 0.06;
    rail.receiveShadow = true;
    g.add(rail);
    for (let i = -6; i <= 6; i += 2) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.13, 0.52), this.stripe);
      s.position.set(i, 0.07, 0);
      g.add(s);
    }
    const r = ev.r;
    const blade = new THREE.Group();
    const disc = new THREE.Mesh(this.bladeGeo, this.steel);
    disc.castShadow = true;
    const rim = new THREE.Mesh(this.rimGeo, this.hot);
    rim.position.z = 0.06;
    const hub = new THREE.Mesh(this.hubGeo, this.darkMetal);
    blade.add(disc, rim, hub);
    blade.scale.setScalar(r);
    g.add(blade);
    this.scene.add(g);
    const saw = { z: -ev.d, r, amp: ev.amp, speed: ev.speed, phase: ev.phase, x: 0, group: g, blade, tick: 0 };
    this.saws.push(saw);
    return saw;
  }

  // ---------- frame ----------

  clear() {
    for (const w of this.walls) this.disposeGroup(w.group, w.tex);
    for (const s of this.saws) this.disposeGroup(s.group);
    this.walls.length = 0;
    this.saws.length = 0;
  }

  disposeGroup(g, tex) {
    this.scene.remove(g);
    g.traverse((m) => {
      if (m.isMesh && m.geometry !== this.bladeGeo && m.geometry !== this.rimGeo && m.geometry !== this.hubGeo) m.geometry.dispose();
    });
    tex?.dispose();
  }

  // onSaw(saw) is called on a fixed tick while a saw overlaps the squad.
  update(dt, time, squad, effects, onSaw) {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.dirty) this.drawWall(w);
      if (w.broken) {
        if (w.breakT === 0) {
          for (const b of w.group.children) {
            b.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 5, -2 - Math.random() * 6);
            b.userData.s = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          }
          effects.explosion(w.x, 0, w.z, 0.5);
        }
        w.breakT += dt;
        for (const b of w.group.children) {
          const v = b.userData.v;
          v.y -= 20 * dt;
          b.position.addScaledVector(v, dt);
          b.rotation.x += b.userData.s.x * dt;
          b.rotation.z += b.userData.s.z * dt;
        }
        if (w.breakT > 1.2) {
          this.disposeGroup(w.group, w.tex);
          this.walls.splice(i, 1);
        }
        continue;
      }
      w.flash = Math.max(0, w.flash - dt);
      w.group.position.x = w.x + (w.flash > 0 ? (Math.random() - 0.5) * 0.08 : 0);
      if (w.z > squad.z + 10) {
        this.disposeGroup(w.group, w.tex);
        this.walls.splice(i, 1);
      }
    }

    for (let i = this.saws.length - 1; i >= 0; i--) {
      const s = this.saws[i];
      s.x = Math.sin(time * s.speed + s.phase) * s.amp;
      s.blade.position.set(s.x, s.r + 0.05, 0);
      s.blade.rotation.z -= dt * 14 * Math.sign(Math.cos(time * s.speed + s.phase) || 1);
      if (Math.random() < dt * 25) effects.sparks(s.x, 0.1, s.z, [3.5, 1.6, 0.4], 2, 5);
      if (Math.abs(squad.z - s.z) < s.r + squad.radius) {
        s.tick -= dt;
        if (s.tick <= 0) {
          s.tick = 0.15;
          onSaw(s);
        }
      }
      if (s.z > squad.z + 10) {
        this.disposeGroup(s.group);
        this.saws.splice(i, 1);
      }
    }
  }
}
