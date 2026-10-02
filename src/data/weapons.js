// In-run gun ladder. Every run starts with the Rifle; gates unlock the next guns.
// Guns multiply firepower, while extra soldiers have diminishing returns,
// so "more army" vs "better gun" is a real decision.
export const GUNS = [
  { name: 'RIFLE', rate: 1, dmg: 1, pierce: 0, size: 1, tint: [3.2, 2.4, 1.0] },
  { name: 'SMG', rate: 1.6, dmg: 0.95, pierce: 0, size: 0.9, tint: [1.4, 3.2, 1.2] },
  { name: 'ASSAULT RIFLE', rate: 1.5, dmg: 1.5, pierce: 0, size: 1.1, tint: [3.6, 1.9, 0.5] },
  { name: 'MINIGUN', rate: 2.6, dmg: 1.25, pierce: 0, size: 1.0, tint: [3.8, 0.9, 0.5] },
  { name: 'PLASMA', rate: 1.9, dmg: 2.5, pierce: 1, size: 1.5, tint: [0.9, 2.0, 4.2] },
  { name: 'RAILGUN', rate: 1.6, dmg: 4.2, pierce: 2, size: 1.7, tint: [3.4, 1.1, 4.2] },
];

export const MAX_TIER = GUNS.length - 1;

// Overall firepower multiplier of a tier (pierce counts as extra hits).
export function gunPower(tier) {
  const g = GUNS[Math.min(tier, MAX_TIER)];
  return g.rate * g.dmg * (1 + g.pierce * 0.3);
}

// Hero weapon style (spread, pellets, range) combined with the current gun's power.
export function composeWeapon(heroWeapon, tier) {
  const g = GUNS[Math.min(tier, MAX_TIER)];
  return {
    ...heroWeapon,
    rate: heroWeapon.rate * g.rate,
    damage: heroWeapon.damage * g.dmg,
    pierce: heroWeapon.pierce + g.pierce,
    size: heroWeapon.size * g.size,
    tint: heroWeapon.flame || tier === 0 ? heroWeapon.tint : g.tint,
  };
}
