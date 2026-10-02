# Last Human: Final Stand (browser edition)

A 3D lane-runner zombie shooter for Chrome, inspired by the Android game. Built with Three.js + Vite; all models, textures and sounds are generated in code (no asset files).

## Play

```bash
npm install
npm run dev        # opens http://localhost:5173 in your browser
```

Production build: `npm run build` → static files in `dist/` (open with `npm run preview` or host anywhere).

## Controls

- **Steer:** drag with mouse/finger, or `A`/`D` / `←`/`→`
- **Pause:** `Esc` or `P`
- Your squad fires automatically. **Shoot gates to raise their value**: a red `-12` can become a blue `+20`.

## What's in it

- 12 levels, each ending in a boss fight (Bloater → Patient Zero), plus **Endless** mode. Each level introduces a new mechanic with an on-screen tip.
- **Army vs. guns:** each run starts with a Rifle and can unlock SMG → Assault Rifle → Minigun → Plasma → Railgun. Guns multiply firepower; extra soldiers have diminishing returns, so you need both.
- **Gates:** `+N`, `×N`, `-N`, `÷N`, fire rate, damage, extra bullets, plus:
  - 🔫 gun vs. army choices
  - 🔒 locked guns you shoot open
  - 💱 trades (soldiers for a gun)
  - ❓ mystery gates
- **Hazards:** 🧱 barricades that eat soldiers unless shot down, and ⚙️ sweeping saw blades
- **Enemies:** walkers, runners and brutes, plus explosive barrels that chain-react
- **Bosses** telegraph slams (red circles) and charges (red lanes), so steer out of them. Their claws take a percentage of your army, and later bosses summon minions.
- 1–3 ★ per level based on how much of your peak army survives
- 4 heroes (Rifleman, Gunner, Sniper, Flamer) and 4 permanent upgrades, bought with coins
- Progress saves in your browser (localStorage)

## Code map

| Path | What |
| --- | --- |
| `src/core/Game.js` | game states, spawning, collisions, gates, boss hooks |
| `src/world/*` | road/city, squad, bullets, enemies, gates, hazards, boss, effects |
| `src/render/` | renderer, sky, lights, bloom, camera; procedural models |
| `src/data/levels.js` | level configs + seeded track builder (balance lives here) |
| `src/data/heroes.js` | heroes, hero weapon styles, upgrade costs |
| `src/data/weapons.js` | in-run gun ladder |
| `src/ui/` | menus, HUD, shop, results |

Dev tip: `http://localhost:5173/?speed=4` fast-forwards the simulation (dev builds only), and `window.__game` is exposed in DevTools.

## License

MIT — see [LICENSE](LICENSE).
