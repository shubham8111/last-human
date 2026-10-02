import { GUNS, MAX_TIER, gunPower } from './weapons.js';

// Levels are generated from a hand-tuned config + a fixed seed, so each level is
// the same every attempt (learnable). The builder simulates a "balanced" player
// (army size + gun tier) and scales hordes, walls and the boss to match, so
// neglecting either army or guns gets punished.
//
// Each level introduces something new (`intro`), shown with a one-time tip.
// tierBase/tierEvery: which gun tier a balanced player should have by now.

const ALL = { guns: true, locks: true, walls: true, barrels: true, weapons: true, trades: true, saws: true, mystery: true };

export const LEVELS = [
  { name: 'Outbreak', segs: 10, kinds: { walker: 1 }, pressure: 0.85, hp: 1, guns: true, intro: ['gunVsArmy'], tierBase: 1, tierEvery: 99, boss: { name: 'BLOATER', scale: 2.6, time: 9 } },
  { name: 'Main Street', segs: 12, kinds: { walker: 3, runner: 1 }, pressure: 0.95, hp: 1.1, guns: true, locks: true, intro: ['lockGun'], tierBase: 1, tierEvery: 8, boss: { name: 'BLOATER', scale: 2.8, time: 11 } },
  { name: 'Gas Station', segs: 13, kinds: { walker: 3, runner: 1 }, pressure: 1.0, hp: 1.2, guns: true, locks: true, walls: true, barrels: true, intro: ['wallLane', 'barrelHorde'], tierBase: 1, tierEvery: 6, boss: { name: 'SCORCHED', scale: 3.0, time: 12 } },
  { name: 'Armory', segs: 13, kinds: { walker: 3, runner: 2 }, pressure: 1.05, hp: 1.3, guns: true, locks: true, walls: true, barrels: true, weapons: true, trades: true, intro: ['tradeGate'], tierBase: 1, tierEvery: 5, boss: { name: 'SCORCHED', scale: 3.1, time: 14, summons: 6 } },
  { name: 'The Brute', segs: 14, kinds: { walker: 3, runner: 1, brute: 1 }, pressure: 1.1, hp: 1.45, ...ALL, saws: false, mystery: false, intro: ['bruteGuard'], tierBase: 2, tierEvery: 6, boss: { name: 'GOLIATH', scale: 3.6, time: 17, summons: 8 } },
  { name: 'Overpass', segs: 15, kinds: { walker: 3, runner: 2, brute: 1 }, pressure: 1.15, hp: 1.6, ...ALL, mystery: false, intro: ['sawGauntlet'], tierBase: 2, tierEvery: 5, boss: { name: 'GOLIATH', scale: 3.6, time: 18, summons: 8 } },
  { name: 'Hospital', segs: 16, kinds: { walker: 2, runner: 3, brute: 1 }, pressure: 1.2, hp: 1.75, ...ALL, intro: ['mysteryGate'], tierBase: 2, tierEvery: 5, boss: { name: 'THE SURGEON', scale: 3.8, time: 19, summons: 10 } },
  { name: 'Blackout', segs: 17, kinds: { walker: 3, runner: 2, brute: 2 }, pressure: 1.25, hp: 1.9, ...ALL, tierBase: 2, tierEvery: 5, boss: { name: 'THE SURGEON', scale: 3.9, time: 20, summons: 10 } },
  { name: 'Quarantine', segs: 18, kinds: { walker: 2, runner: 3, brute: 2 }, pressure: 1.3, hp: 2.05, ...ALL, tierBase: 3, tierEvery: 5, boss: { name: 'WARDEN', scale: 4.1, time: 21, summons: 12 } },
  { name: 'Ground Zero', segs: 19, kinds: { walker: 3, runner: 3, brute: 2 }, pressure: 1.35, hp: 2.2, ...ALL, tierBase: 3, tierEvery: 4, boss: { name: 'MUTANT KING', scale: 4.5, time: 23, summons: 12 } },
  { name: 'Wasteland', segs: 20, kinds: { walker: 2, runner: 3, brute: 3 }, pressure: 1.4, hp: 2.4, ...ALL, tierBase: 3, tierEvery: 4, boss: { name: 'MUTANT KING', scale: 4.6, time: 24, summons: 14 } },
  { name: 'Final Stand', segs: 22, kinds: { walker: 3, runner: 3, brute: 3 }, pressure: 1.45, hp: 2.6, ...ALL, tierBase: 4, tierEvery: 4, boss: { name: 'PATIENT ZERO', scale: 5.2, time: 28, summons: 16 } },
];

export const TIPS = {
  gunVsArmy: '🔫 Guns multiply firepower — sometimes worth more than soldiers',
  lockGun: '🔒 Shoot the locked gun to open it before you reach it',
  wallLane: '🧱 Walls cost soldiers — shoot them down or dodge',
  barrelHorde: '🛢️ Shoot barrels to blast the horde',
  tradeGate: '💱 Trade soldiers for a better gun',
  bruteGuard: '💪 Brutes kill 6 soldiers each — focus fire!',
  sawGauntlet: '⚙️ Time your crossing past the saws',
  mysteryGate: '❓ Mystery gate: jackpot… or disaster',
};

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HALF = 7; // road half-width (matches Road.ROAD_HALF)
const SHOOTERS = 50;
// Firepower of an un-upgraded rifleman squad of size n with gun tier t (damage/sec).
export const dps = (n, t = 0) => Math.min(n, SHOOTERS) * 2.0 * Math.pow(Math.max(1, n / SHOOTERS), 0.55) * gunPower(t);

export class TrackBuilder {
  constructor(cfg, seed) {
    this.cfg = cfg;
    this.rng = mulberry32(seed);
    this.events = [];
    this.d = 34; // distance along the track (world z = -d)
    this.expected = 6; // squad size a balanced player should have here
    this.tier = 0; // gun tier a balanced player should have here
    this.lastPattern = null;
    this.segCount = 0;
    this.intros = [...(cfg.intro || [])];
  }

  r(a = 0, b = 1) {
    return a + this.rng() * (b - a);
  }

  ri(a, b) {
    return Math.floor(this.r(a, b + 1));
  }

  get tierTarget() {
    return Math.min(MAX_TIER, (this.cfg.tierBase ?? 1) + Math.floor(this.segCount / (this.cfg.tierEvery ?? 6)));
  }

  wantsGun() {
    return this.tier < this.tierTarget;
  }

  pickKind() {
    const entries = Object.entries(this.cfg.kinds);
    let total = entries.reduce((s, [, w]) => s + w, 0);
    let x = this.rng() * total;
    for (const [k, w] of entries) if ((x -= w) <= 0) return k;
    return entries[0][0];
  }

  // A good squad gate scaled to the current expected size.
  goodGate(strength = 1) {
    const e = Math.min(this.expected, 1500);
    if (this.rng() < 0.2 && e < 80) return { kind: 'mul', value: e < 15 && this.rng() < 0.3 ? 3 : 2 };
    return { kind: 'add', value: Math.max(3, Math.round((e * this.r(0.25, 0.55) + this.r(4, 9)) * strength)) };
  }

  badGate() {
    const e = this.expected;
    if (this.rng() < 0.25 && e > 12) return { kind: 'div', value: 2 };
    return { kind: 'add', value: -Math.max(3, Math.round(e * this.r(0.2, 0.45))) };
  }

  value(g) {
    const e = this.expected;
    if (g.kind === 'add') return Math.min(9999, e + g.value);
    if (g.kind === 'mul') return Math.min(9999, e * g.value);
    if (g.kind === 'div') return e / g.value;
    if (g.kind === 'trade') return Math.max(1, e - g.cost);
    return e;
  }

  // Enemy toughness grows with the gun a balanced player should have.
  get toughness() {
    return this.cfg.hp * Math.pow(gunPower(this.tier), 0.8);
  }

  gateRow(left, right, extra = {}) {
    const stepCost = Math.max(1, Math.round(this.cfg.hp * 1.5));
    this.push({
      type: 'gates',
      gates: [
        { x: -HALF / 2, w: HALF, stepCost, ...left },
        { x: HALF / 2, w: HALF, stepCost, ...right },
      ],
      ...extra,
    });
  }

  push(ev) {
    ev.d = this.d;
    if (this.pendingTip) {
      ev.tip = this.pendingTip;
      this.pendingTip = null;
    }
    this.events.push(ev);
  }

  sides(a, b) {
    return this.rng() < 0.5 ? [a, b] : [b, a];
  }

  // Big hordes are capped in head-count; the excess becomes extra HP (and bite) per zombie.
  horde(kind, size, x, w, depth) {
    const cap = kind === 'brute' ? 8 : 110;
    const count = Math.max(1, Math.round(Math.min(size, cap)));
    const stack = Math.max(1, size / count);
    this.push({ type: 'horde', kind, count, x, w, depth, hp: this.toughness * stack, stack });
  }

  hordeSize(kind, frac = 1) {
    const per = { walker: 1, runner: 0.9, brute: 0.08 }[kind];
    const warmup = Math.min(1, 0.45 + this.segCount * 0.15); // gentle opening
    return Math.max(kind === 'brute' ? 1 : 4, this.expected * this.cfg.pressure * frac * per * warmup);
  }

  segment() {
    const c = this.cfg;
    const bruteReady = c.kinds.brute && this.segCount >= 4 && this.expected >= 35;
    this.bruteReady = bruteReady;
    const gunsLeft = this.tier < MAX_TIER;
    let p;
    // Teach this level's new mechanic early (right after the opening gate).
    if (this.segCount >= 1 && this.intros.length && (this.intros[0] !== 'bruteGuard' || bruteReady)) {
      p = this.intros.shift();
      this.pendingTip = TIPS[p];
    } else {
      const pats = ['gatePair', 'gatePair', 'riskGate', 'hordeSide', 'hordeFull'];
      if (c.guns && gunsLeft) pats.push('gunVsArmy', 'gunVsArmy');
      if (c.locks && gunsLeft) pats.push('lockGun');
      if (c.trades && gunsLeft) pats.push('tradeGate');
      if (c.walls) pats.push('wallLane', 'wallLane');
      if (c.barrels) pats.push('barrelHorde');
      if (c.weapons) pats.push('weaponPair');
      if (c.saws && this.segCount >= 3) pats.push('sawGauntlet');
      if (c.mystery) pats.push('mysteryGate');
      if (bruteReady) pats.push('bruteGuard');
      do p = pats[(this.rng() * pats.length) | 0];
      while (p === this.lastPattern || (this.segCount === 0 && p !== 'gatePair'));
    }
    this.segCount++;
    this.lastPattern = p;
    this[p]();
  }

  gatePair() {
    const a = this.goodGate();
    const b = this.rng() < 0.55 ? this.goodGate(0.6) : this.badGate();
    this.gateRow(...this.sides(a, b));
    this.expected = Math.max(this.value(a), this.value(b)) * 0.85;
    this.d += this.r(26, 32);
  }

  // A bad gate that becomes great if you shoot it, beside a modest safe gate.
  riskGate() {
    const e = this.expected;
    const bad = { kind: 'add', value: -Math.max(4, Math.round(e * this.r(0.15, 0.3))) };
    const safe = { kind: 'add', value: Math.max(3, Math.round(e * 0.25)) };
    this.gateRow(...this.sides(bad, safe));
    this.expected = e + Math.max(safe.value, 6);
    this.d += this.r(24, 30);
  }

  // A horde blocks one lane; a juicy gate waits behind it, a weak one on the open side.
  hordeSide() {
    const side = this.rng() < 0.5 ? -1 : 1;
    const kind = this.pickKind();
    const k = kind === 'brute' ? 'walker' : kind;
    this.horde(k, this.hordeSize(k, 0.9), side * HALF * 0.5, HALF * 0.85, 6);
    this.d += 14;
    const juicy = this.cfg.guns && this.wantsGun() && this.rng() < 0.4 ? { kind: 'gun', value: 1 } : this.goodGate(1.3);
    const weak = { kind: 'add', value: Math.max(2, Math.round(this.expected * 0.15)) };
    if (side < 0) this.gateRow(juicy, weak);
    else this.gateRow(weak, juicy);
    if (juicy.kind === 'gun') this.tier++;
    else this.expected = (this.value(juicy) + this.value(weak)) / 2;
    this.d += this.r(24, 30);
  }

  hordeFull() {
    const kind = this.pickKind();
    const k = kind === 'brute' ? 'walker' : kind;
    this.horde(k, this.hordeSize(k, 1.2), 0, HALF * 1.8, 10);
    if (this.bruteReady && (kind === 'brute' || this.rng() < 0.4)) {
      this.d += 6;
      this.horde('brute', this.hordeSize('brute'), 0, HALF, 3);
    }
    this.expected *= 0.85;
    this.d += this.r(28, 34);
  }

  barrelHorde() {
    const n = this.ri(3, 5);
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(-HALF + 1 + ((HALF * 2 - 2) * (i + this.r(0.2, 0.8))) / n);
    this.push({ type: 'barrels', xs });
    this.d += 4;
    const kind = this.pickKind();
    const k = kind === 'brute' ? 'walker' : kind;
    this.horde(k, this.hordeSize(k, 1.5), 0, HALF * 1.6, 7);
    this.expected *= 0.9;
    this.d += this.r(28, 34);
  }

  weaponPair() {
    const opts = [
      { kind: 'rate', value: this.ri(3, 6) * 5 },
      { kind: 'dmg', value: this.ri(3, 6) * 5 },
      { kind: 'multi', value: 1 },
      this.goodGate(0.8),
    ];
    const i = this.ri(0, 3);
    let j = this.ri(0, 3);
    if (j === i) j = (i + 1) % 4;
    this.gateRow(opts[i], opts[j]);
    if (opts[i].kind === 'add' || opts[j].kind === 'add') this.expected += 4;
    this.d += this.r(26, 32);
  }

  bruteGuard() {
    const side = this.rng() < 0.5 ? -1 : 1;
    this.horde('brute', this.hordeSize('brute') + 1, side * HALF * 0.45, HALF * 0.7, 2);
    this.horde('walker', this.hordeSize('walker', 0.5), -side * HALF * 0.45, HALF * 0.8, 6);
    this.expected *= 0.88;
    this.d += this.r(28, 34);
  }

  // ---------- the hard choices ----------

  // New gun vs. a generous pile of soldiers.
  gunVsArmy() {
    const e = this.expected;
    const army = e < 30 && this.rng() < 0.3 ? { kind: 'mul', value: 2 } : { kind: 'add', value: Math.round(e * this.r(0.5, 0.8) + this.r(6, 10)) };
    this.gateRow(...this.sides({ kind: 'gun', value: 1 }, army));
    if (this.wantsGun()) this.tier++;
    else this.expected = this.value(army);
    this.d += this.r(26, 32);
  }

  // A locked gun you must shoot open, while a horde charges at you.
  lockGun() {
    const e = this.expected;
    this.horde(this.pickKind() === 'runner' ? 'runner' : 'walker', this.hordeSize('walker', 0.55), 0, HALF * 1.7, 5);
    this.d += 12;
    const hitsPerSec = Math.min(e, SHOOTERS) * 2 * GUNS[this.tier].rate;
    const need = Math.max(25, Math.min(400, Math.round(hitsPerSec * 1.8)));
    const other = { kind: 'add', value: Math.round(e * 0.3 + 5) };
    this.gateRow(...this.sides({ kind: 'lock', value: 1, need }, other));
    if (this.wantsGun()) this.tier++;
    else this.expected = this.value(other);
    this.d += this.r(26, 32);
  }

  // Pay soldiers for firepower.
  tradeGate() {
    const e = this.expected;
    const big = this.tier < MAX_TIER - 1 && this.rng() < 0.35;
    const trade = { kind: 'trade', value: big ? 2 : 1, cost: Math.max(3, Math.round(e * (big ? this.r(0.5, 0.6) : this.r(0.28, 0.4)))) };
    const other = this.goodGate(0.7);
    this.gateRow(...this.sides(trade, other));
    if (this.wantsGun()) {
      this.tier = Math.min(MAX_TIER, this.tier + trade.value);
      this.expected = this.value(trade);
    } else {
      this.expected = this.value(other);
    }
    this.d += this.r(26, 32);
  }

  // A wall blocks one lane and guards the better gate behind it.
  wallLane() {
    const e = this.expected;
    const side = this.rng() < 0.5 ? -1 : 1;
    const value = Math.max(4, Math.round(e * this.r(0.25, 0.45) + this.r(3, 6)));
    // ~2.5s of focused fire from a balanced squad knocks it down
    const hpPer = Math.max(0.5, (dps(e, this.tier) * 2.5) / value) * this.cfg.hp;
    this.push({ type: 'wall', x: side * HALF * 0.5, w: HALF - 0.4, value, hpPer });
    this.d += 9;
    const juicy = this.cfg.guns && this.wantsGun() && this.rng() < 0.5 ? { kind: 'gun', value: 1 } : this.goodGate(1.4);
    const weak = { kind: 'add', value: Math.max(2, Math.round(e * 0.15)) };
    if (side < 0) this.gateRow(juicy, weak);
    else this.gateRow(weak, juicy);
    if (juicy.kind === 'gun') this.tier++;
    else this.expected = Math.max(this.value(weak), this.value(juicy) - value * 0.3);
    this.d += this.r(24, 30);
  }

  sawGauntlet() {
    const intro = this.lastPattern === 'sawGauntlet' && this.pendingTip;
    const n = intro || this.rng() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      this.push({ type: 'saw', r: this.r(1.1, 1.5), amp: HALF - 1.6, speed: intro ? 1.2 : this.r(1.3, 2.1), phase: this.r(0, 6.28) });
      this.d += 9;
    }
    this.expected *= 0.93;
    this.d += this.r(18, 24);
  }

  mysteryGate() {
    const safe = { kind: 'add', value: Math.round(this.expected * 0.3 + 5) };
    this.gateRow(...this.sides({ kind: 'mystery', value: 0 }, safe));
    this.expected = this.value(safe);
    this.d += this.r(26, 32);
  }

  boss(spec) {
    this.d += 12;
    const hp = dps(this.expected, this.tier) * spec.time * this.cfg.hp * 0.45;
    this.push({ type: 'boss', name: spec.name, scale: spec.scale, hp, summons: spec.summons || 0 });
  }
}

export function buildLevel(n) {
  const cfg = LEVELS[n - 1];
  const b = new TrackBuilder(cfg, 1000 + n * 7919);
  for (let i = 0; i < cfg.segs; i++) b.segment();
  b.boss(cfg.boss);
  return { name: cfg.name, number: n, events: b.events, length: b.d, hp: cfg.hp, endless: false, expectedTier: b.tier };
}
