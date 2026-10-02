const KEY = 'lasthuman.save.v1';

const DEFAULT = {
  coins: 0,
  unlocked: 1, // highest level the player may start
  stars: {}, // level -> best result (1..3)
  upgrades: { squad: 0, damage: 0, rate: 0, coin: 0 },
  heroes: ['rifleman'],
  hero: 'rifleman',
  bestEndless: 0,
  muted: false,
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT);
    const data = JSON.parse(raw);
    return { ...clone(DEFAULT), ...data, upgrades: { ...DEFAULT.upgrades, ...(data.upgrades || {}) } };
  } catch {
    return clone(DEFAULT);
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage unavailable (private mode) — progress just won't persist
  }
}
