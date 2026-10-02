// Heroes lead the squad and change how everyone shoots.
export const HEROES = {
  rifleman: {
    id: 'rifleman',
    name: 'Rifleman',
    desc: 'Reliable all-rounder. Steady fire, solid range.',
    cost: 0,
    color: 0x4f7d3a,
    weapon: { rate: 1, damage: 1, spread: 0, shots: 1, life: 0.62, pierce: 0, speed: 52, size: 1, tint: [3.2, 2.4, 1.0] },
  },
  gunner: {
    id: 'gunner',
    name: 'Gunner',
    desc: 'Shotgun squad. Fires 3 pellets in a fan — shreds hordes.',
    cost: 600,
    color: 0x2f5f8f,
    weapon: { rate: 0.85, damage: 0.55, spread: 0.16, shots: 3, life: 0.5, pierce: 0, speed: 48, size: 0.9, tint: [1.4, 2.6, 3.4] },
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper',
    desc: 'Slow, heavy rounds that pierce through 3 zombies.',
    cost: 1400,
    color: 0x6b5a3a,
    weapon: { rate: 0.55, damage: 2.4, spread: 0, shots: 1, life: 0.85, pierce: 3, speed: 75, size: 1.3, tint: [3.4, 1.4, 3.0] },
  },
  flamer: {
    id: 'flamer',
    name: 'Flamer',
    desc: 'Short-range firestorm. Melts anything that gets close.',
    cost: 2500,
    color: 0x8f3a22,
    weapon: { rate: 1.6, damage: 0.75, spread: 0.32, shots: 1, life: 0.32, pierce: 1, speed: 34, size: 2.2, tint: [2.4, 1.0, 0.2], flame: true },
  },
};

export const HERO_ORDER = ['rifleman', 'gunner', 'sniper', 'flamer'];

// Permanent upgrades bought with coins between runs.
export const UPGRADES = {
  squad: { name: 'Recruits', desc: '+3 starting soldiers', base: 60, max: 15, icon: '👥' },
  damage: { name: 'Firepower', desc: '+15% bullet damage', base: 80, max: 15, icon: '💥' },
  rate: { name: 'Fire Rate', desc: '+10% fire rate', base: 80, max: 15, icon: '⚡' },
  coin: { name: 'Scavenger', desc: '+10% coins earned', base: 100, max: 10, icon: '🪙' },
};

export function upgradeCost(id, level) {
  return Math.round(UPGRADES[id].base * Math.pow(1.45, level));
}

export function playerStats(save) {
  const u = save.upgrades;
  return {
    startSquad: 5 + u.squad * 3,
    damage: 1 + u.damage * 0.15,
    rate: 1 + u.rate * 0.1,
    coinMul: 1 + u.coin * 0.1,
  };
}
