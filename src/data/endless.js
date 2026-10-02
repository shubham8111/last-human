import { TrackBuilder } from './levels.js';

const BOSSES = ['BLOATER', 'SCORCHED', 'GOLIATH', 'THE SURGEON', 'WARDEN', 'MUTANT KING', 'PATIENT ZERO'];

// Endless mode: an ever-harder track generated just ahead of the player,
// with a boss every 8 segments.
export class EndlessTrack {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.cfg = { kinds: { walker: 1 }, pressure: 1, hp: 1 };
    this.segs = 0;
    this.ramp();
    this.builder = new TrackBuilder(this.cfg, seed);
    this.bosses = 0;
    this.name = 'Endless';
    this.endless = true;
    this.number = 0;
  }

  get events() {
    return this.builder.events;
  }

  // Mechanics phase in as you go; the expected gun tier climbs every 5 segments.
  ramp() {
    const s = this.segs;
    const c = this.cfg;
    c.hp = 1 + s * 0.08;
    c.pressure = Math.min(1.7, 0.95 + s * 0.018);
    c.tierBase = 1;
    c.tierEvery = 5;
    c.guns = true;
    c.locks = s >= 3;
    c.walls = s >= 5;
    c.barrels = s >= 4;
    c.trades = s >= 8;
    c.weapons = s >= 8;
    c.saws = s >= 10;
    c.mystery = s >= 12;
    c.kinds = s < 3 ? { walker: 1 } : s < 10 ? { walker: 3, runner: 1 } : { walker: 3, runner: 2, brute: 1 };
  }

  ensure(d) {
    while (this.builder.d < d + 220) {
      this.ramp();
      this.builder.segment();
      this.segs++;
      if (this.segs % 8 === 0) {
        const name = BOSSES[Math.min(BOSSES.length - 1, this.bosses)];
        this.builder.boss({ name, scale: Math.min(5.4, 2.8 + this.bosses * 0.4), time: 12 + this.bosses * 3, summons: 6 + this.bosses * 2 });
        this.builder.d += 20;
        this.bosses++;
      }
    }
  }
}
