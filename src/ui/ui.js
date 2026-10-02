import { LEVELS } from '../data/levels.js';
import { HEROES, HERO_ORDER, UPGRADES, upgradeCost } from '../data/heroes.js';
import { writeSave } from '../core/Save.js';
import { GUNS, MAX_TIER } from '../data/weapons.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const fmt = (n) => Math.floor(n).toLocaleString();
const starStr = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(max - n);

export class UI {
  constructor(root, save, audio, actions) {
    this.root = root;
    this.save = save;
    this.audio = audio;
    this.actions = actions; // { play(n), endless(), menu(), restart(), resume(), heroChanged() }
    this.screen = null;
    this.hud = null;
    this.lastHud = {};

    root.addEventListener('click', (e) => {
      if (e.target.closest('button')) this.audio.click();
    });
  }

  clear() {
    this.root.innerHTML = '';
    this.hud = null;
    this.boss = null;
    this.lastHud = {};
  }

  // ---------- menu ----------

  showMenu() {
    this.clear();
    const s = this.save;
    const next = Math.min(s.unlocked, LEVELS.length);
    const el = h(`
      <div class="screen menu">
        <div class="topbar">
          <button class="icon-btn" data-act="mute" title="Sound">${s.muted ? '🔇' : '🔊'}</button>
          <div class="coins">🪙 <span>${fmt(s.coins)}</span></div>
        </div>
        <div class="title">
          <div class="t1">LAST HUMAN</div>
          <div class="t2">FINAL STAND</div>
        </div>
        <div class="menu-actions">
          <button class="btn primary big" data-act="play">
            <span class="btn-k">PLAY</span>
            <span class="btn-sub">Level ${next} · ${LEVELS[next - 1].name}</span>
          </button>
          <div class="row">
            <button class="btn" data-act="levels">🗺️ Levels</button>
            <button class="btn" data-act="shop">🎖️ Squad</button>
            <button class="btn" data-act="endless">♾️ Endless<small>${s.bestEndless ? `best ${fmt(s.bestEndless)}m` : 'survive'}</small></button>
          </div>
        </div>
        <div class="hint">Drag, <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd> to steer · Shoot gates to raise their value · <kbd>Esc</kbd> pause</div>
      </div>`);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'play') this.actions.play(next);
      if (act === 'levels') this.showLevels();
      if (act === 'shop') this.showShop();
      if (act === 'endless') this.actions.endless();
      if (act === 'mute') {
        s.muted = !s.muted;
        this.audio.setMuted(s.muted);
        writeSave(s);
        e.target.textContent = s.muted ? '🔇' : '🔊';
      }
    });
    this.root.appendChild(el);
  }

  panel(title, body) {
    const el = h(`
      <div class="screen panel-screen">
        <div class="panel">
          <div class="panel-head">
            <button class="icon-btn" data-act="back">←</button>
            <h2>${title}</h2>
            <div class="coins">🪙 <span>${fmt(this.save.coins)}</span></div>
          </div>
          <div class="panel-body"></div>
        </div>
      </div>`);
    el.querySelector('.panel-body').appendChild(body);
    el.querySelector('[data-act=back]').addEventListener('click', () => this.showMenu());
    this.clear();
    this.root.appendChild(el);
    return el;
  }

  showLevels() {
    const grid = h('<div class="level-grid"></div>');
    LEVELS.forEach((lv, i) => {
      const n = i + 1;
      const locked = n > this.save.unlocked;
      const boss = n % 5 === 0 || n === LEVELS.length;
      const b = h(`
        <button class="level ${locked ? 'locked' : ''} ${n < this.save.unlocked ? 'done' : ''} ${boss ? 'boss' : ''}" ${locked ? 'disabled' : ''}>
          <span class="n">${locked ? '🔒' : n}</span>
          <span class="nm">${lv.name}</span>
          <span class="bs">☠ ${lv.boss.name}</span>
          ${locked ? '' : `<span class="st">${starStr(this.save.stars[n] || 0)}</span>`}
        </button>`);
      if (!locked) b.addEventListener('click', () => this.actions.play(n));
      grid.appendChild(b);
    });
    this.panel('Levels', grid);
  }

  showShop() {
    const body = h('<div class="shop"><h3>Upgrades</h3><div class="upgrades"></div><h3>Heroes</h3><div class="heroes"></div></div>');
    const render = () => {
      const s = this.save;
      this.root.querySelectorAll('.coins span').forEach((c) => (c.textContent = fmt(s.coins)));
      const ups = body.querySelector('.upgrades');
      ups.innerHTML = '';
      for (const [id, u] of Object.entries(UPGRADES)) {
        const lvl = s.upgrades[id];
        const maxed = lvl >= u.max;
        const cost = upgradeCost(id, lvl);
        const card = h(`
          <div class="card">
            <div class="ic">${u.icon}</div>
            <div class="info">
              <div class="nm">${u.name} <span class="lv">Lv ${lvl}</span></div>
              <div class="ds">${u.desc}</div>
              <div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
            </div>
            <button class="btn buy" ${maxed || s.coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `🪙 ${fmt(cost)}`}</button>
          </div>`);
        card.querySelector('button').addEventListener('click', () => {
          if (maxed || s.coins < cost) return;
          s.coins -= cost;
          s.upgrades[id]++;
          writeSave(s);
          this.audio.coin();
          render();
        });
        ups.appendChild(card);
      }
      const hs = body.querySelector('.heroes');
      hs.innerHTML = '';
      for (const id of HERO_ORDER) {
        const hero = HEROES[id];
        const owned = s.heroes.includes(id);
        const selected = s.hero === id;
        const color = '#' + hero.color.toString(16).padStart(6, '0');
        const card = h(`
          <div class="card hero ${selected ? 'selected' : ''}">
            <div class="ic hero-ic" style="background:${color}">${hero.name[0]}</div>
            <div class="info">
              <div class="nm">${hero.name}</div>
              <div class="ds">${hero.desc}</div>
            </div>
            <button class="btn buy ${selected ? 'sel' : ''}" ${!owned && s.coins < hero.cost ? 'disabled' : ''}>
              ${selected ? 'LEADING' : owned ? 'SELECT' : `🪙 ${fmt(hero.cost)}`}
            </button>
          </div>`);
        card.querySelector('button').addEventListener('click', () => {
          if (selected) return;
          if (!owned) {
            if (s.coins < hero.cost) return;
            s.coins -= hero.cost;
            s.heroes.push(id);
            this.audio.coin();
          }
          s.hero = id;
          writeSave(s);
          this.actions.heroChanged();
          render();
        });
        hs.appendChild(card);
      }
    };
    this.panel('Squad', body);
    render();
  }

  // ---------- in-run ----------

  showHUD(track) {
    this.clear();
    const el = h(`
      <div class="hud">
        <div class="hud-top">
          <button class="icon-btn" data-act="pause">❚❚</button>
          <div class="lvl">
            <div class="lvl-name">${track.endless ? 'ENDLESS' : `LEVEL ${track.number} · ${track.name.toUpperCase()}`}</div>
            <div class="prog ${track.endless ? 'hidden' : ''}"><div class="fill"></div><div class="skull">☠</div></div>
            <div class="dist ${track.endless ? '' : 'hidden'}">0 m</div>
            <div class="gun-badge"><span class="gname">RIFLE</span><span class="gpips"></span></div>
          </div>
          <div class="coins">🪙 <span>0</span></div>
        </div>
        <div class="bossbar hidden">
          <div class="bname"></div>
          <div class="bbar"><div class="bfill"></div><div class="btrail"></div></div>
        </div>
        <div class="toasts"></div>
        <div class="tips"></div>
      </div>`);
    el.querySelector('[data-act=pause]').addEventListener('click', () => this.actions.pause());
    this.root.appendChild(el);
    this.hud = {
      el,
      fill: el.querySelector('.prog .fill'),
      coins: el.querySelector('.coins span'),
      dist: el.querySelector('.dist'),
      boss: el.querySelector('.bossbar'),
      bname: el.querySelector('.bname'),
      bfill: el.querySelector('.bfill'),
      btrail: el.querySelector('.btrail'),
      toasts: el.querySelector('.toasts'),
      tips: el.querySelector('.tips'),
      gun: el.querySelector('.gun-badge'),
    };
    this.trail = 1;
  }

  updateHUD(d) {
    const hd = this.hud;
    if (!hd) return;
    const l = this.lastHud;
    if (d.coins !== l.coins) hd.coins.textContent = fmt(d.coins);
    if (d.progress !== null && d.progress !== l.progress) hd.fill.style.width = `${d.progress * 100}%`;
    if (d.progress === null && d.dist !== l.dist) hd.dist.textContent = `${fmt(d.dist)} m`;
    if (d.bossHp !== null) {
      hd.bfill.style.width = `${d.bossHp * 100}%`;
      this.trail = Math.max(d.bossHp, this.trail - 0.004);
      hd.btrail.style.width = `${this.trail * 100}%`;
    }
    this.lastHud = d;
  }

  setGun(tier) {
    const g = this.hud?.gun;
    if (!g) return;
    g.querySelector('.gname').textContent = '🔫 ' + GUNS[tier].name;
    g.querySelector('.gpips').innerHTML = Array.from({ length: MAX_TIER }, (_, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('');
    g.classList.remove('bump');
    void g.offsetWidth;
    if (tier > 0) g.classList.add('bump');
  }

  showBoss(name) {
    if (!this.hud) return;
    this.trail = 1;
    this.hud.bname.textContent = name;
    this.hud.boss.classList.remove('hidden');
  }

  hideBoss() {
    this.hud?.boss.classList.add('hidden');
  }

  toast(text, cls = '') {
    if (!this.hud) return;
    const t = h(`<div class="toast ${cls}">${text}</div>`);
    (cls === 'tip' ? this.hud.tips : this.hud.toasts).appendChild(t);
    setTimeout(() => t.remove(), cls === 'tip' ? 4200 : 2300);
  }

  showPause() {
    const el = h(`
      <div class="screen overlay pause">
        <div class="modal">
          <h2>PAUSED</h2>
          <button class="btn primary" data-act="resume">Resume</button>
          <button class="btn" data-act="restart">Restart</button>
          <button class="btn" data-act="menu">Main Menu</button>
        </div>
      </div>`);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') this.actions.pause();
      if (act === 'restart') this.actions.restart();
      if (act === 'menu') this.actions.menu();
    });
    this.root.appendChild(el);
    this.pauseEl = el;
  }

  hidePause() {
    this.pauseEl?.remove();
    this.pauseEl = null;
  }

  showResult(r) {
    this.clear();
    const title = r.endless ? 'OVERRUN' : r.win ? 'VICTORY' : 'DEFEATED';
    const sub = r.endless
      ? `${fmt(r.dist)} m survived${r.newBest ? ' · <b>NEW BEST!</b>' : ` · best ${fmt(r.best)} m`}`
      : `Level ${r.level} · ${r.name}`;
    const el = h(`
      <div class="screen overlay result ${r.win ? 'win' : 'lose'}">
        <div class="modal">
          <h1>${title}</h1>
          ${r.win && !r.endless ? `<div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('')}</div>` : ''}
          <div class="sub">${sub}</div>
          <div class="stats">
            <div><span>☠</span><b>${fmt(r.kills)}</b><small>kills</small></div>
            <div><span>👥</span><b>${fmt(r.peak)}</b><small>peak squad</small></div>
            <div><span>🪖</span><b>${fmt(r.survivors)}</b><small>survivors</small></div>
          </div>
          <div class="gunline">🔫 Best gun: <b>${r.gun}</b></div>
          ${r.win && !r.endless ? `<div class="starhint">${r.starBonus ? `⭐ New stars! +${fmt(r.starBonus)} 🪙` : r.stars < 3 ? 'Keep more of your army alive for more stars' : 'Perfect run!'}</div>` : ''}
          <div class="earned">🪙 <b class="count">0</b> <small>${r.bonus ? `(incl. ${fmt(r.bonus)} clear bonus)` : 'earned'}</small></div>
          <div class="btns">
            ${r.hasNext && r.win ? '<button class="btn primary" data-act="next">Next Level ▶</button>' : ''}
            <button class="btn ${r.win && r.hasNext ? '' : 'primary'}" data-act="retry">${r.win ? 'Replay' : 'Try Again'}</button>
            <button class="btn" data-act="shop">🎖️ Upgrade</button>
            <button class="btn" data-act="menu">Menu</button>
          </div>
        </div>
      </div>`);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'next') this.actions.play(r.level + 1);
      if (act === 'retry') this.actions.restart();
      if (act === 'menu') this.actions.menu();
      if (act === 'shop') {
        this.actions.menu();
        this.showShop();
      }
    });
    this.root.appendChild(el);
    // Tally up the coins
    const c = el.querySelector('.count');
    const target = Math.floor(r.coins);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      c.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && c.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
