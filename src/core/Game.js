import * as THREE from 'three';
import { Road } from '../world/Road.js';
import { Effects } from '../world/Effects.js';
import { Squad } from '../world/Squad.js';
import { Bullets } from '../world/Bullets.js';
import { Enemies } from '../world/Enemies.js';
import { Gates } from '../world/Gates.js';
import { Boss } from '../world/Boss.js';
import { Hazards } from '../world/Hazards.js';
import { GUNS, MAX_TIER, composeWeapon } from '../data/weapons.js';
import { buildLevel, LEVELS } from '../data/levels.js';
import { EndlessTrack } from '../data/endless.js';
import { HEROES, playerStats } from '../data/heroes.js';
import { writeSave } from './Save.js';

const RUN_SPEED = 9;
const SPAWN_AHEAD = 78;
const CELL = 2;
const _v = new THREE.Vector3();

export class Game {
  constructor(stage, ui, audio, input, save) {
    this.stage = stage;
    this.ui = ui;
    this.audio = audio;
    this.input = input;
    this.save = save;
    const scene = stage.scene;
    const layer = document.getElementById('labels');

    this.road = new Road(scene);
    this.effects = new Effects(scene, layer);
    this.squad = new Squad(scene, layer);
    this.bullets = new Bullets(scene, this.effects);
    this.enemies = new Enemies(scene, layer);
    this.gates = new Gates(scene);
    this.boss = new Boss(scene);
    this.hazards = new Hazards(scene);
    this.gates.tierOf = () => this.run?.tier ?? 0;

    this.state = 'menu';
    this.paused = false;
    this.time = 0;
    this.timeScale = 1;
    this.buckets = new Map();

    input.onPause = () => this.togglePause();
    this.enterMenu();
  }

  // ---------- flow ----------

  clearWorld() {
    this.enemies.clear();
    this.enemies.hideLabels();
    this.bullets.clear();
    this.gates.clear();
    this.hazards.clear();
    this.boss.hide();
    this.effects.clearTexts();
    this.effects.clearDecals();
    this.road.reset(0);
  }

  enterMenu() {
    this.state = 'menu';
    this.paused = false;
    this.timeScale = 1;
    this.clearWorld();
    this.squad.setHero(HEROES[this.save.hero]);
    this.squad.reset(24);
    this.squad.visible = true;
    this.squad.setRunning(false);
    this.squad.label.style.display = 'none';
    this.audio.stopMusic();
    this.ui.showMenu();
  }

  startLevel(n) {
    this.track = buildLevel(n);
    this.beginRun();
  }

  startEndless() {
    this.track = new EndlessTrack();
    this.track.ensure(0);
    this.beginRun();
  }

  beginRun() {
    this.clearWorld();
    const stats = playerStats(this.save);
    const hero = HEROES[this.save.hero];
    this.stats = stats;
    this.hero = hero;
    this.run = {
      rate: stats.rate,
      damage: stats.damage,
      tier: 0,
      weapon: composeWeapon(hero.weapon, 0),
      extraShots: 0,
      coins: 0,
      kills: 0,
      dist: 0,
      evIdx: 0,
      endTimer: 0,
      result: null,
      peak: stats.startSquad,
      tips: new Set(),
    };
    this.squad.setHero(hero);
    this.squad.reset(stats.startSquad);
    this.squad.visible = true;
    this.squad.setRunning(true);
    this.stage.snapCamera(0, 0);
    this.state = 'run';
    this.paused = false;
    this.timeScale = 1;
    this.ui.showHUD(this.track);
    this.ui.setGun(0);
    this.ui.toast(this.track.endless ? 'ENDLESS — SURVIVE!' : `LEVEL ${this.track.number}: ${this.track.name.toUpperCase()}`, 'big');
    this.audio.startMusic(false);
  }

  togglePause() {
    if (this.state !== 'run' && this.state !== 'boss') return;
    this.paused = !this.paused;
    if (this.paused) {
      this.ui.showPause();
      this.audio.stopMusic();
    } else {
      this.ui.hidePause();
      this.audio.startMusic(this.state === 'boss');
    }
  }

  setTier(t) {
    const r = this.run;
    r.tier = Math.min(MAX_TIER, t);
    r.weapon = composeWeapon(this.hero.weapon, r.tier);
    r.peakTier = Math.max(r.peakTier || 0, r.tier);
    this.gates.refreshGuns();
    this.ui.setGun(r.tier);
  }

  // A gun gate when the ladder is already maxed turns into a damage boost.
  gainGun(n) {
    const r = this.run;
    if (r.tier >= MAX_TIER) {
      r.damage *= 1 + 0.4 * n;
      return '+' + 40 * n + '% DAMAGE';
    }
    this.setTier(r.tier + n);
    this.audio.gunUp();
    this.ui.toast(`🔫 ${GUNS[r.tier].name} UNLOCKED!`, 'gun');
    return GUNS[r.tier].name + '!';
  }

  finish(win) {
    if (this.run.result) return;
    const r = this.run;
    r.result = win ? 'win' : 'lose';
    r.endTimer = win ? 2.2 : 1.6;
    this.timeScale = 0.35;
    this.audio.stopMusic();
    if (win) {
      this.audio.win();
      const bonus = Math.round((25 + 15 * this.track.number) * this.stats.coinMul);
      r.coins += bonus;
      r.bonus = bonus;
    } else {
      this.audio.lose();
    }
  }

  showResults() {
    const r = this.run;
    const t = this.track;
    this.state = 'result';
    this.save.coins += r.coins;
    if (r.result === 'win' && !t.endless) {
      this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, t.number + 1));
      if (t.number === LEVELS.length) this.save.beatGame = true;
    }
    let newBest = false;
    if (t.endless) {
      const m = Math.round(r.dist);
      if (m > this.save.bestEndless) {
        this.save.bestEndless = m;
        newBest = true;
      }
    }
    // Stars: clear it, keep 40% / 75% of your peak army.
    let stars = 0;
    let starBonus = 0;
    if (r.result === 'win' && !t.endless) {
      const keep = this.squad.count / Math.max(1, r.peak);
      stars = 1 + (keep >= 0.4 ? 1 : 0) + (keep >= 0.75 ? 1 : 0);
      const prev = this.save.stars[t.number] || 0;
      if (stars > prev) {
        starBonus = (stars - prev) * 20 * t.number;
        this.save.stars[t.number] = stars;
        this.save.coins += starBonus;
      }
    }
    writeSave(this.save);
    this.squad.label.style.display = 'none';
    this.enemies.hideLabels();
    this.ui.hideBoss();
    this.ui.showResult({
      win: r.result === 'win',
      endless: t.endless,
      level: t.number,
      name: t.name,
      coins: r.coins,
      bonus: r.bonus || 0,
      kills: r.kills,
      survivors: this.squad.count,
      peak: r.peak,
      dist: Math.round(r.dist),
      best: this.save.bestEndless,
      newBest,
      hasNext: !t.endless && t.number < LEVELS.length,
      stars,
      starBonus,
      gun: GUNS[r.peakTier || 0].name,
    });
  }

  // ---------- gameplay events ----------

  spawnEvents() {
    const r = this.run;
    const t = this.track;
    if (t.endless) t.ensure(r.dist);
    const evs = t.events;
    while (r.evIdx < evs.length && evs[r.evIdx].d <= r.dist + SPAWN_AHEAD) {
      const ev = evs[r.evIdx];
      if (ev.type === 'boss') {
        if (r.dist < ev.d) break; // wait until we actually reach the arena
        this.startBoss(ev);
      } else if (ev.type === 'gates') {
        this.gates.spawnRow(ev);
      } else if (ev.type === 'horde') {
        this.spawnHorde(ev);
      } else if (ev.type === 'barrels') {
        for (const x of ev.xs) this.enemies.spawn('barrel', x, -ev.d - Math.random() * 1.5, 1);
      } else if (ev.type === 'wall') {
        this.hazards.spawnWall(ev, ev.hpPer);
      } else if (ev.type === 'saw') {
        this.hazards.spawnSaw(ev);
      }
      if (ev.tip && !r.tips.has(ev.tip)) {
        r.tips.add(ev.tip);
        this.ui.toast(ev.tip, 'tip');
      }
      r.evIdx++;
    }
  }

  spawnHorde(ev) {
    const n = ev.count;
    const cols = Math.max(1, Math.round(Math.sqrt(n * (ev.w / Math.max(2, ev.depth)))));
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(n / cols);
      const x = ev.x - ev.w / 2 + ((c + 0.5 + (Math.random() - 0.5) * 0.7) * ev.w) / cols;
      const z = -ev.d - ((row + Math.random() * 0.6) * ev.depth) / Math.max(1, rows);
      this.enemies.spawn(ev.kind, x, z, ev.hp, { stack: ev.stack });
    }
  }

  startBoss(ev) {
    this.state = 'boss';
    this.squad.setRunning(false);
    this.bossEv = ev;
    this.boss.start(ev, this.squad);
    this.ui.showBoss(ev.name);
    this.ui.toast(`⚠ ${ev.name} ⚠`, 'boss');
    this.audio.stopMusic();
    this.audio.startMusic(true);
  }

  applyGate(g) {
    const sq = this.squad;
    const before = sq.count;
    const r = this.run;
    let good = true;
    let label = this.gates.text(g)[0];
    switch (g.kind) {
      case 'add':
        sq.setCount(before + g.value);
        good = g.value >= 0;
        break;
      case 'mul':
        sq.setCount(before * g.value);
        break;
      case 'div':
        sq.setCount(Math.ceil(before / g.value));
        good = false;
        break;
      case 'rate':
        r.rate *= 1 + g.value / 100;
        label += ' FIRE RATE';
        break;
      case 'dmg':
        r.damage *= 1 + g.value / 100;
        label += ' DAMAGE';
        break;
      case 'multi':
        r.extraShots += g.value;
        label += ' BULLET';
        break;
      case 'gun':
        label = this.gainGun(g.value);
        break;
      case 'trade':
        this.killSoldiers(g.cost, sq.x, sq.z - 2);
        if (sq.count > 0) label = `-${g.cost} 👥  ${this.gainGun(g.value)}`;
        else label = 'NOT ENOUGH SOLDIERS';
        good = sq.count > 0;
        break;
      case 'lock':
        label = '🔒 STILL LOCKED';
        good = false;
        break;
      case 'mystery':
        [label, good] = this.rollMystery();
        break;
    }
    r.peak = Math.max(r.peak, sq.count);
    this.effects.text(_v.set(sq.x, 2.6, sq.z - 1), label, good ? 'good' : 'bad', 1.3);
    this.effects.ring(sq.x, sq.z, sq.radius + 2, good ? [0.3, 1.2, 3] : [3, 0.3, 0.3], 0.5);
    if (good) this.audio.gateGood();
    else {
      this.audio.gateBad();
      this.stage.addShake(0.4);
    }
    if (sq.count <= 0) this.finish(false);
  }

  rollMystery() {
    const sq = this.squad;
    const n = sq.count;
    const x = Math.random();
    if (x < 0.22) {
      sq.setCount(n * 2);
      return ['JACKPOT ×2!', true];
    }
    if (x < 0.4) {
      if (this.run.tier < MAX_TIER) return ['FREE ' + this.gainGun(1), true];
      sq.setCount(Math.round(n * 1.5));
      return ['×1.5!', true];
    }
    if (x < 0.58) {
      const add = Math.round(n * 0.8 + 10);
      sq.setCount(n + add);
      return [`+${add}!`, true];
    }
    if (x < 0.78) {
      sq.setCount(Math.ceil(n / 2));
      return ['CURSED ÷2', false];
    }
    // Ambush: runners burst out of the alleys ahead.
    const hp = this.track.endless ? this.track.cfg.hp : this.track.hp;
    const count = Math.min(90, Math.round(n * 0.5 + 8));
    for (let i = 0; i < count; i++) {
      const e = this.enemies.spawn('runner', (Math.random() - 0.5) * 12, sq.z - 22 - Math.random() * 8, hp * 1.5, { aggro: 999 });
      if (e) e.state = 'chase';
    }
    return ['AMBUSH!', false];
  }

  killSoldiers(n, fromX, fromZ) {
    const dead = this.squad.lose(n, fromX, fromZ);
    for (const p of dead) this.effects.gore(p.x, 0.2, p.z, 0.7, 0x4f6b35);
    if (n > 0) this.audio.soldierDown();
    if (this.squad.count <= 0) this.finish(false);
  }

  // Scale a count of *visible* soldiers hit to the true squad size.
  scaledLoss(visibleHit) {
    const shown = Math.max(1, this.squad.displayCount);
    return Math.round((visibleHit * this.squad.count) / shown);
  }

  explodeBarrel(e) {
    const fx = this.effects;
    fx.explosion(e.x, 0, e.z, 1);
    this.audio.explosion();
    this.stage.addShake(0.55);
    const R = 4.6;
    const dmg = 30 * (this.track.hp || 1) * (this.track.endless ? this.track.cfg.hp : 1);
    for (const o of this.enemies.list) {
      if (o === e || o.state === 'dying') continue;
      const d2 = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d2 < R * R) {
        if (o.type === 'barrel') {
          // chain reaction, slightly delayed
          o.hp = 0.01;
          o.chain = 0.12;
        } else if (this.enemies.damage(o, dmg)) this.onKill(o);
      }
    }
    const hit = this.squad.countInside(e.x, e.z, R * 0.6);
    if (hit > 0) this.killSoldiers(this.scaledLoss(hit), e.x, e.z);
  }

  onKill(e) {
    const r = this.run;
    if (e.type === 'barrel') {
      this.explodeBarrel(e);
      return;
    }
    r.kills++;
    r.coins += e.cfg.coin * Math.sqrt(e.stack) * this.stats.coinMul;
    this.effects.gore(e.x, 0.3, e.z, e.cfg.scale * 1.3, e.cfg.gore);
    this.audio.zombieDie();
    if (e.type === 'brute') {
      this.effects.text(_v.set(e.x, 2.5, e.z), `+${Math.round(e.cfg.coin * this.stats.coinMul)} 🪙`, 'coin', 0.9);
      this.audio.coin();
      this.stage.addShake(0.15);
    }
  }

  onContact(e) {
    if (e.type === 'barrel') {
      e.state = 'dying';
      e.t = 0.4;
      this.explodeBarrel(e);
      return;
    }
    this.killSoldiers(Math.round(e.cfg.bite * e.stack), e.x, e.z);
    e.state = 'dying';
    e.t = 0.2;
    this.effects.gore(e.x, 0.3, e.z, e.cfg.scale, e.cfg.gore);
    if (e.type === 'brute') this.stage.addShake(0.3);
  }

  bossHooks() {
    const sq = this.squad;
    return {
      roar: () => {
        this.audio.bossRoar();
        this.stage.addShake(0.6);
      },
      warn: () => this.audio.warn(),
      slam: (x, z, r) => {
        this.effects.ring(x, z, r * 1.6, [3, 1.2, 0.4], 0.5);
        this.effects.explosion(x, 0, z, 0.6);
        this.audio.explosion();
        this.stage.addShake(0.9);
        const hit = sq.countInside(x, z, r);
        if (hit > 0) this.killSoldiers(this.scaledLoss(hit), x, z);
      },
      charge: (x, w) => {
        this.stage.addShake(0.8);
        this.audio.explosion();
        let hit = 0;
        for (const s of sq.soldiers) if (Math.abs(sq.x + s.ox - x) < w) hit++;
        if (hit > 0) this.killSoldiers(this.scaledLoss(hit), x, sq.z);
      },
      claw: () => {
        // A percentage of the army, so a huge crowd with a pea-shooter still bleeds out.
        const n = Math.max(Math.round(this.boss.scale * 0.7 + (this.track.number || 3) * 0.3), Math.round(sq.count * 0.025));
        this.killSoldiers(n, this.boss.x, this.boss.z);
        this.stage.addShake(0.25);
      },
      summon: (x, z, n) => {
        const hp = this.track.endless ? this.track.cfg.hp : this.track.hp;
        for (let i = 0; i < n; i++) {
          const e = this.enemies.spawn(Math.random() < 0.3 ? 'runner' : 'walker', x + (Math.random() - 0.5) * 8, z - Math.random() * 3, hp, { aggro: 999 });
          if (e) e.state = 'chase';
        }
        this.effects.ring(x, z, 6, [1.5, 0.3, 2.5], 0.6);
      },
    };
  }

  // ---------- collisions ----------

  rebuildBuckets() {
    const b = this.buckets;
    for (const arr of b.values()) arr.length = 0;
    for (const e of this.enemies.list) {
      if (e.state === 'dying') continue;
      const k = Math.floor(e.z / CELL);
      let arr = b.get(k);
      if (!arr) b.set(k, (arr = []));
      arr.push(e);
    }
  }

  resolveBullets() {
    const B = this.bullets;
    const boss = this.boss;
    this.rebuildBuckets();
    let gateTicked = false;
    let hitSomething = false;
    for (let k = B.alive.length - 1; k >= 0; k--) {
      const i = B.alive[k];
      const x = B.x[i];
      const z = B.z[i];
      const pz = B.pz[i];
      let dead = false;

      // Gates catch bullets crossing their plane.
      for (const row of this.gates.rows) {
        if (row.used || !(pz > row.z && z <= row.z)) continue;
        const g = this.gates.pick(row, x);
        if (g) {
          const res = this.gates.hit(g);
          if (res === 'tick') gateTicked = true;
          if (res === 'unlock') {
            this.effects.ring(g.x, g.z, 5, [3, 2, 0.4], 0.6);
            this.effects.sparks(g.x, 2, g.z, [3.5, 2.4, 0.6], 30, 10);
            this.audio.gunUp();
            this.effects.text(_v.set(g.x, 4, g.z), 'UNLOCKED!', 'gold', 1.2);
          }
          this.effects.sparks(x, B.y[i], row.z + 0.1, g.tone === 'bad' ? [3, 0.6, 0.4] : [0.6, 1.6, 3.5], 2, 4);
          dead = true;
        }
        break;
      }
      if (dead) {
        B.kill(k);
        continue;
      }

      if (this.hazards.walls.length && this.hazards.bulletHit(x, pz, z, B.dmg[i])) {
        this.effects.sparks(x, B.y[i] + 0.4, z, [2.2, 2, 1.6], 2, 4);
        hitSomething = true;
        B.kill(k);
        continue;
      }

      if (boss.active && !boss.dying) {
        const r = boss.radius;
        if (Math.abs(x - boss.x) < r && z < boss.z + r * 0.7 && z > boss.z - r * 0.9) {
          this.effects.sparks(x, B.y[i] + 0.5, z, [3, 0.8, 0.5], 2, 5);
          hitSomething = true;
          if (boss.damage(B.dmg[i])) this.onBossDead();
          B.kill(k);
          continue;
        }
      }

      // Sweep the step in small samples so fast rounds can't tunnel through.
      const steps = Math.max(1, Math.ceil(Math.abs(pz - z) / 0.4));
      const px = x - (B.vx[i] * (z - pz)) / (B.vz[i] || -1);
      outer: for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const sz = pz + (z - pz) * t;
        const sx = px + (x - px) * t;
        const cell = Math.floor(sz / CELL);
        for (let c = cell - 1; c <= cell + 1; c++) {
          const arr = this.buckets.get(c);
          if (!arr) continue;
          for (const e of arr) {
            if (e.state === 'dying' || e.id === B.lastHit[i]) continue;
            const r = e.cfg.radius;
            const dx = e.x - sx;
            const dz = e.z - sz;
            if (dx * dx + dz * dz < r * r) {
              hitSomething = true;
              B.lastHit[i] = e.id;
              if (!B.flame[i]) this.effects.sparks(sx, B.y[i] + 0.3, sz, e.type === 'barrel' ? [3, 2, 0.5] : [2, 0.3, 0.2], 2, 4);
              if (this.enemies.damage(e, B.dmg[i])) this.onKill(e);
              if (B.pierce[i] > 0) {
                B.pierce[i]--;
              } else {
                dead = true;
              }
              break outer;
            }
          }
        }
      }
      if (dead) B.kill(k);
    }
    if (gateTicked) this.audio.gateTick();
    if (hitSomething) this.audio.hit();
  }

  onBossDead() {
    const b = this.boss;
    this.effects.explosion(b.x, 1, b.z, 2);
    this.effects.gore(b.x, 1, b.z, 4, 0x7b6a8f);
    this.audio.explosion();
    this.stage.addShake(1.2);
    const reward = Math.round(10 * b.scale * b.scale * this.stats.coinMul);
    this.run.coins += reward;
    this.run.kills++;
    this.effects.text(_v.set(b.x, 4, b.z), `+${reward} 🪙`, 'coin big', 1.6);
    this.audio.coin();
    this.ui.hideBoss();
    // Remaining minions panic and die with their master.
    for (const e of this.enemies.list) if (e.state !== 'dying' && e.type !== 'barrel' && this.enemies.damage(e, 1e9)) this.onKill(e);
    if (this.track.endless) {
      this.bossResumeT = 2.0;
    } else {
      this.finish(true);
    }
  }

  // ---------- frame ----------

  update(rawDt) {
    const dt = Math.min(rawDt, 1 / 30);
    const sq = this.squad;

    if (this.state === 'menu' || this.state === 'result') {
      this.time += dt;
      sq.update(dt, this.time, this.stage.camera);
      sq.label.style.display = 'none';
      this.road.update(sq.z, this.time);
      this.effects.update(dt, this.stage.camera);
      this.stage.follow(sq.x, sq.z, dt, 'menu');
      return;
    }

    if (this.paused) {
      this.stage.follow(sq.x, sq.z, 0, this.state === 'boss' ? 'boss' : 'run');
      return;
    }

    const r = this.run;
    if (r.result) {
      r.endTimer -= dt;
      this.timeScale = Math.min(1, this.timeScale + dt * 0.4);
      if (r.endTimer <= 0) {
        this.timeScale = 1;
        this.showResults();
        return;
      }
    }
    const gdt = dt * this.timeScale;
    this.time += gdt;

    // Steering
    const drag = this.input.consumeDrag();
    sq.steer(drag, this.input.axis, gdt);
    // Lane magnet: approaching a gate row without steering, settle into one lane
    // so the whole army passes through a single gate.
    const steering = this.input.dragging || this.input.axis !== 0 || drag !== 0;
    if (this.state === 'run' && !steering) {
      const ahead = this.gates.rows.some((row) => !row.used && sq.z - row.z > 0 && sq.z - row.z < 18);
      if (ahead) {
        const lim = Math.max(0.3, 7 - Math.min(sq.radius, 5.8) - 0.2);
        const laneX = Math.sign(sq.targetX || 1) * Math.min(3.5, lim);
        sq.targetX += (laneX - sq.targetX) * Math.min(1, gdt * 4);
      }
    }

    // Advance
    if (this.state === 'run' && !r.result) {
      const prevZ = sq.z;
      sq.z -= RUN_SPEED * gdt;
      r.dist = -sq.z;
      this.spawnEvents();
      const wall = this.hazards.squadCross(prevZ, sq.z, sq.x, sq.radius);
      if (wall.lost > 0) {
        this.killSoldiers(wall.lost, sq.x, sq.z - 2);
        this.effects.text(_v.set(sq.x, 2.6, sq.z - 1), `-${wall.lost}`, 'bad', 1.1);
        this.audio.explosion();
        this.stage.addShake(0.6);
      }
      const row = this.gates.crossed(prevZ, sq.z);
      if (row) {
        const g = this.gates.pick(row, sq.x);
        this.gates.use(row, g);
        if (g) this.applyGate(g);
      }
    }
    if (this.state === 'boss' && this.bossResumeT !== undefined) {
      this.bossResumeT -= gdt;
      if (this.bossResumeT <= 0) {
        this.bossResumeT = undefined;
        this.state = 'run';
        sq.setRunning(true);
        this.audio.stopMusic();
        this.audio.startMusic(false);
      }
    }

    // Combat
    if (!r.result || r.result === 'win') {
      const s = { rate: r.rate, damage: r.damage, weapon: r.weapon, extraShots: r.extraShots };
      if (sq.count > 0) sq.fire(gdt, this.bullets, this.effects, s, this.audio);
    }
    this.bullets.update(gdt);
    this.resolveBullets();

    // chained barrels
    for (const e of this.enemies.list) {
      if (e.chain !== undefined && e.state !== 'dying') {
        e.chain -= gdt;
        if (e.chain <= 0) {
          e.chain = undefined;
          if (this.enemies.damage(e, 1e9)) this.onKill(e);
        }
      }
    }

    this.enemies.update(gdt, this.time, sq, this.stage.camera, (e) => this.onContact(e));
    if (this.boss.active) this.boss.update(gdt, this.time, sq, this.bossHooks());
    this.gates.update(gdt, this.time, sq.z);
    this.hazards.update(gdt, this.time, sq, this.effects, (saw) => {
      const hit = sq.countInside(saw.x, saw.z, saw.r * 0.8);
      if (hit > 0 && sq.count > 0) {
        this.killSoldiers(this.scaledLoss(hit), saw.x, saw.z);
        this.effects.sparks(saw.x, 0.6, saw.z, [3, 0.4, 0.2], 6, 7);
        this.stage.addShake(0.15);
      }
    });
    sq.update(gdt, this.time, this.stage.camera);
    this.road.update(sq.z, this.time);
    this.effects.update(gdt, this.stage.camera);
    this.stage.follow(sq.x, sq.z, dt, this.state === 'boss' ? 'boss' : 'run');

    r.peak = Math.max(r.peak, sq.count);
    this.ui.updateHUD({
      count: sq.count,
      coins: Math.floor(r.coins),
      progress: this.track.endless ? null : Math.min(1, r.dist / this.track.length),
      dist: Math.round(r.dist),
      bossHp: this.boss.active ? this.boss.hp / this.boss.maxHp : null,
    });
  }
}
