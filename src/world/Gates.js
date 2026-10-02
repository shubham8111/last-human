import * as THREE from 'three';
import { GUNS, MAX_TIER } from '../data/weapons.js';

const COLORS = {
  good: new THREE.Color(0.1, 0.55, 1.6),
  bad: new THREE.Color(1.6, 0.12, 0.15),
  weapon: new THREE.Color(1.7, 0.95, 0.12),
  gun: new THREE.Color(1.8, 0.75, 0.05),
  trade: new THREE.Color(1.5, 0.35, 0.9),
  lock: new THREE.Color(0.75, 0.6, 0.35),
  mystery: new THREE.Color(0.75, 0.25, 1.8),
};

const GUN_KINDS = new Set(['gun', 'trade', 'lock']);

export class Gates {
  constructor(scene) {
    this.scene = scene;
    this.rows = [];
    this.tierOf = () => 0; // current gun tier, provided by the Game
    this.postMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.7, roughness: 0.35 });
    this.postGeo = new THREE.BoxGeometry(0.3, 3.6, 0.3);
  }

  // Gun a gate would give right now (null when already maxed out).
  gunFor(g) {
    const cur = this.tierOf();
    if (cur >= MAX_TIER) return null;
    return GUNS[Math.min(MAX_TIER, cur + g.value)];
  }

  text(g) {
    switch (g.kind) {
      case 'add':
        return [g.value >= 0 ? `+${g.value}` : `${g.value}`, g.shootable ? 'SHOOT TO UPGRADE' : ''];
      case 'mul':
        return [`×${g.value}`, ''];
      case 'div':
        return [`÷${g.value}`, ''];
      case 'rate':
        return [`+${g.value}%`, 'FIRE RATE'];
      case 'dmg':
        return [`+${g.value}%`, 'DAMAGE'];
      case 'multi':
        return [`+${g.value}`, g.value > 1 ? 'BULLETS' : 'BULLET'];
      case 'gun': {
        const gun = this.gunFor(g);
        return gun ? [gun.name, g.unlocked ? 'UNLOCKED!' : 'NEW GUN'] : ['+40%', 'DAMAGE'];
      }
      case 'trade': {
        const gun = this.gunFor(g);
        return [gun ? gun.name : '+60%', `COSTS ${g.cost} SOLDIERS`];
      }
      case 'lock': {
        const gun = this.gunFor(g);
        return [gun ? gun.name : '+40%', `SHOOT TO UNLOCK`];
      }
      case 'mystery':
        return ['?', 'MYSTERY'];
      default:
        return ['?', ''];
    }
  }

  tone(g) {
    if (g.kind === 'rate' || g.kind === 'dmg' || g.kind === 'multi') return 'weapon';
    if (g.kind === 'gun') return 'gun';
    if (g.kind === 'trade' || g.kind === 'lock' || g.kind === 'mystery') return g.kind;
    if (g.kind === 'div') return 'bad';
    if (g.kind === 'add' && g.value < 0) return 'bad';
    return 'good';
  }

  spawnRow(ev) {
    const row = { z: -ev.d, gates: [], used: false, fade: 0, tip: ev.tip };
    for (const def of ev.gates) {
      const g = {
        ...def,
        z: row.z,
        initial: def.value,
        progress: 0,
        stepCost: def.stepCost ?? 2,
        shootable: (def.kind === 'add' && def.shootable !== false) || def.kind === 'lock',
        pulse: 0,
        dirty: false,
        row,
      };
      this.build(g);
      row.gates.push(g);
    }
    this.rows.push(row);
    return row;
  }

  build(g) {
    const group = new THREE.Group();
    group.position.set(g.x, 0, g.z);
    const w = g.w;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    g.canvas = canvas;
    g.tex = tex;

    const panelMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 3.3), panelMat);
    panel.position.y = 1.75;
    group.add(panel);

    const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const text = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.4, 5.2), Math.min(w - 0.4, 5.2) * 0.625), textMat);
    text.position.set(0, 1.9, 0.02);
    group.add(text);

    const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.32), glowMat);
    beam.position.y = 3.5;
    group.add(beam);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.4), glowMat);
    base.position.y = 0.04;
    group.add(base);

    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(this.postGeo, this.postMat);
      post.position.set((sx * w) / 2, 1.8, 0);
      post.castShadow = true;
      group.add(post);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.32), glowMat);
      strip.position.set((sx * w) / 2 - sx * 0.12, 1.8, 0);
      group.add(strip);
    }

    g.group = group;
    g.panelMat = panelMat;
    g.glowMat = glowMat;
    g.textMat = textMat;
    this.scene.add(group);
    this.redraw(g);
  }

  redraw(g) {
    g.dirty = false;
    const t = this.tone(g);
    g.tone = t;
    const col = COLORS[t];
    g.panelMat.color.copy(col).multiplyScalar(0.55);
    g.glowMat.color.copy(col).multiplyScalar(1.7);

    const ctx = g.canvas.getContext('2d');
    const W = g.canvas.width;
    const H = g.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const [main, sub] = this.text(g);
    const locked = g.kind === 'lock';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = main.length <= 4 ? 160 : main.length <= 7 ? 112 : 76;
    ctx.font = `900 ${size}px Bungee, Impact, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    const y = sub ? H * (locked ? 0.36 : 0.42) : H * 0.5;
    ctx.strokeText(main, W / 2, y);
    ctx.fillStyle = locked ? '#d9cfc0' : '#ffffff';
    ctx.fillText(main, W / 2, y);
    if (GUN_KINDS.has(g.kind) && this.gunFor(g)) {
      // little gun badge
      ctx.font = '700 40px Rajdhani, Arial, sans-serif';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(locked ? '🔒' : '🔫', W / 2, H * 0.1);
    }
    if (sub) {
      ctx.font = `700 ${sub.length > 14 ? 34 : 44}px Rajdhani, Arial, sans-serif`;
      ctx.lineWidth = 8;
      ctx.strokeText(sub, W / 2, H * (locked ? 0.62 : 0.8));
      ctx.fillStyle = t === 'good' || t === 'bad' ? '#e8f4ff' : '#fff3c0';
      ctx.fillText(sub, W / 2, H * (locked ? 0.62 : 0.8));
    }
    if (locked) {
      // unlock progress bar
      const bw = W * 0.74;
      const bx = (W - bw) / 2;
      const by = H * 0.76;
      const k = Math.min(1, g.progress / g.need);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 34);
      ctx.fillStyle = '#ffb21e';
      ctx.fillRect(bx + 4, by + 4, (bw - 8) * k, 26);
      ctx.font = '700 28px Rajdhani, Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${Math.floor(g.progress)} / ${g.need}`, W / 2, by + 18);
    }
    g.tex.needsUpdate = true;
  }

  // Bullet hit. Returns 'tick' when a value ticked up, 'unlock' when a locked gun opened.
  hit(g) {
    g.pulse = 0.12;
    if (!g.shootable || g.row.used) return null;
    if (g.kind === 'lock') {
      g.progress += 1;
      g.dirty = true;
      if (g.progress >= g.need) {
        g.kind = 'gun';
        g.unlocked = true;
        g.shootable = false;
        g.pulse = 0.5;
        return 'unlock';
      }
      return null;
    }
    // 'add' gates: no cap, but each step costs a few more hits than the last.
    g.progress += 1;
    let changed = false;
    let cost = g.stepCost * (1 + (g.value - g.initial) / 8);
    while (g.progress >= cost) {
      g.progress -= cost;
      g.value += 1;
      changed = true;
      cost = g.stepCost * (1 + (g.value - g.initial) / 8);
    }
    if (changed) g.dirty = true;
    return changed ? 'tick' : null;
  }

  // Gun names depend on the current tier, so relabel after an upgrade.
  refreshGuns() {
    for (const row of this.rows) for (const g of row.gates) if (GUN_KINDS.has(g.kind)) g.dirty = true;
  }

  // Which gate row (if any) the squad crossed between prevZ and z.
  crossed(prevZ, z) {
    for (const row of this.rows) if (!row.used && prevZ > row.z && z <= row.z) return row;
    return null;
  }

  pick(row, x) {
    let best = null;
    let bd = Infinity;
    for (const g of row.gates) {
      const d = Math.abs(x - g.x);
      if (d <= g.w / 2 + 0.2 && d < bd) {
        best = g;
        bd = d;
      }
    }
    return best;
  }

  use(row, chosen) {
    row.used = true;
    row.chosen = chosen;
    row.fade = 0;
  }

  remove(row) {
    for (const g of row.gates) {
      this.scene.remove(g.group);
      g.group.traverse((m) => {
        if (m.isMesh) {
          if (m.geometry !== this.postGeo) m.geometry.dispose();
          if (m.material !== this.postMat) m.material.dispose();
        }
      });
      g.tex.dispose();
    }
  }

  clear() {
    for (const r of this.rows) this.remove(r);
    this.rows.length = 0;
  }

  update(dt, time, squadZ) {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const row = this.rows[i];
      if (row.used) row.fade += dt;
      if (row.z > squadZ + 12 || row.fade > 0.7) {
        this.remove(row);
        this.rows.splice(i, 1);
        continue;
      }
      for (const g of row.gates) {
        if (g.dirty) this.redraw(g);
        g.pulse = Math.max(0, g.pulse - dt);
        const p = 1 + g.pulse * 1.2 + Math.sin(time * 4 + g.x) * 0.02;
        g.textMat.opacity = 1;
        if (row.used) {
          // Passed gates collapse into the road; the chosen one flashes first.
          const f = row.fade / 0.7;
          const k = g === row.chosen ? Math.max(0.01, 1 - f * 1.8) : Math.max(0.01, 1 - f * 2.5);
          g.group.scale.set(1, k, 1);
          g.panelMat.opacity = (g === row.chosen ? 0.9 : 0.32) * (1 - f);
          g.textMat.opacity = 1 - f;
        } else {
          g.group.scale.set(1, p, 1);
          const shimmer = g.kind === 'mystery' ? Math.sin(time * 9) * 0.12 : 0;
          g.panelMat.opacity = 0.28 + g.pulse * 1.5 + Math.sin(time * 3) * 0.04 + shimmer;
        }
      }
    }
  }
}
