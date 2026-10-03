# CLAUDE.md

Guidance for coding agents working in this repo. For player-facing docs see `README.md`.

## What this is

**Last Human: Final Stand** is a browser 3D lane-runner zombie shooter. Vanilla JS (ES modules) + Three.js + Vite. No framework, no TypeScript, no asset files: models, textures and audio are all generated in code.

## Commands

```bash
npm install
npm run dev        # Vite dev server on :5173 (opens browser)
npm run build      # production build to dist/ (gitignored)
npm run preview    # serve dist/
```

There is **no test suite and no linter**. Verify changes with `npm run build` (catches import and syntax errors) and by playing in the dev server.

Dev-only helpers:
- `http://localhost:5173/?speed=4` fast-forwards the simulation (ignored in production builds).
- `window.__game` exposes the `Game` instance in DevTools. Useful: `__game.squad.setCount(500)`, `__game.run`, `__game.track.events`, `__game.finish(true)`.
- Fonts (Bungee, Rajdhani) load from Google Fonts, so the first frame waits on `document.fonts.ready`.

## Architecture

```
src/main.js          bootstrap + rAF loop (Stage, Game, Input, Audio, UI, Save)
src/core/Game.js     the hub: state machine, spawning, collisions, gate effects, boss hooks, HUD feed
src/core/Input.js    drag / A,D / arrows -> steering; Esc/P pause
src/core/Audio.js    all WebAudio synthesis + procedural music loop
src/core/Save.js     localStorage persistence (key `lasthuman.save.v1`)
src/render/Scene.js  Stage: renderer, sky shader, lights, bloom, follow camera, screen shake
src/render/Models.js procedural low-poly geometry + `walkerMaterial` (vertex-shader leg swing)
src/world/*          one class per world object type (Road, Squad, Bullets, Enemies, Gates, Hazards, Boss, Effects)
src/data/*           pure data/config: levels (+ track builder), endless, heroes/upgrades, weapons
src/ui/ui.js         DOM menus, HUD, shop, results (template-string HTML, no framework)
src/ui/ui.css        all styling
```

`Game` owns every world object and wires them together; world classes do not import `Game`. They receive callbacks/hooks (`onContact`, `bossHooks()`, `onSaw`) instead.

### Game states
`menu` -> `run` -> (`boss` ->) `result` -> `menu`. `Game.update(dt)` branches on `state`. `run.result` (`'win'|'lose'`) triggers a slow-mo `endTimer` before `showResults()`. Endless mode returns from `boss` to `run` via `bossResumeT`.

### Coordinate system
The road runs along **-Z**. The squad moves by decreasing `squad.z`; `run.dist = -squad.z`. Track events use distance `d` and are placed at world `z = -d`. X is lateral, `ROAD_HALF = 7`. Characters face -Z. Enemies move toward +Z.

### Level generation (`src/data/levels.js`)
Levels are **not hand-placed**. `TrackBuilder` takes a config and a fixed seed (`1000 + n * 7919`) and emits an ordered list of events (`gates`, `horde`, `barrels`, `wall`, `saw`, `boss`). It simulates a "balanced player" (`expected` squad size, `tier` gun) and scales hordes, wall HP and boss HP to it, so changing a gate pattern shifts difficulty downstream. Same seed -> same level every attempt, so don't introduce unseeded `Math.random()` in builder code (use `this.rng` / `this.r` / `this.ri`). Endless mode (`endless.js`) reuses the builder with a ramping config and a random seed.

`Game.spawnEvents()` streams events in as the squad approaches (`SPAWN_AHEAD = 78`). Boss events wait until the squad reaches them.

### Combat model
- Squad count can be huge (max 9999) but only `DISPLAY_MAX = 130` soldiers are rendered; the rest are "hidden reserve" that die first. Use `scaledLoss(visibleHit)` to convert visible hits to true losses.
- Only `SHOOTERS = 50` soldiers add bullets; extra soldiers add damage with `^0.55` diminishing returns. Gun tier is the other scaling axis (`data/weapons.js`).
- Bullets are pooled arrays (structure-of-arrays) in `Bullets.js`; collision is resolved in `Game.resolveBullets()` against gate planes, walls, boss, then enemies via z-bucketed spatial hash (`CELL = 2`). Bullets are swept in small steps to prevent tunnelling.
- Large hordes are capped in head-count; the excess becomes `stack` (extra HP/bite per zombie).

### Rendering/perf conventions
- Everything repeated is an `InstancedMesh` with a fixed cap and free-list (`Enemies` pools, `Squad`, `Bullets`, `Effects` particles, decals). Hidden instances are scaled to 0. Respect caps; `spawn()` returns `null`/no-ops when the pool is full, so callers must handle that.
- **Set `mesh.count` every frame to what is actually in use.** Instances beyond `count` cost nothing, but scaled-to-0 ones still cost vertex work, and twice more in the shadow pass. Enemies/Bullets use the highest live slot + 1; `Squad` uses the soldier count; `Effects` packs live particles densely (instance k = k-th live particle, colours rewritten each frame). If you add a pool, do the same.
- GPU budget (measured on an M3 at 2880x1626): bloom and shadows were the biggest costs after resolution. Keep `MAX_DPR` at 1.5, the shadow map at 1024, and `antialias: false` (the composer renders offscreen, so canvas MSAA is wasted). Don't add full-screen passes without measuring.
- The frame loop in `main.js` caps at 60 fps (30 on menu/result) and skips rendering while paused (`stage.needsRender` forces one redraw, e.g. on resize). Set `needsRender = true` if you change the scene while paused.
- To profile: drive headless Chrome over CDP, read `renderer.info`, and time `composer.render` followed by `gl.readPixels` (a plain `gl.finish()` does not wait for the GPU in Chrome). Warm up for 60+ frames and compare runs back to back, because GPU clocks drift.
- Models are merged vertex-colored geometries from `Models.js`. `walkerMaterial` **requires** per-instance `aPhase` and `aStride` attributes on the geometry; legs are everything with `y < 0.82` in model space, so keep hips at that height in new models.
- Floating numbers, HP labels and the squad count are DOM elements positioned by projecting world points each frame (`#labels` layer), not canvas text. HP labels are capped at `LABELS = 70`.
- Gate and wall signs are `CanvasTexture`s redrawn only when `dirty`.
- Reuse module-level scratch objects (`_m`, `_v`, ...) in hot paths; avoid per-frame allocation.
- Colors above 1.0 (e.g. `[3.2, 2.4, 1.0]`) are intentional: they feed the bloom pass with `toneMapped: false` materials.

## Conventions

- Plain ES modules, single quotes, 2-space indent, semicolons, trailing commas, ~140 col lines (Prettier-style, though no config is checked in). Match the surrounding code; comments explain *why*, are sparse.
- Data-driven where possible: add enemies in `ENEMY_TYPES`, guns in `GUNS`, heroes in `HEROES`, upgrades in `UPGRADES`, levels in `LEVELS`, rather than special-casing in `Game.js`.
- UI is built with the `h()` template helper and `data-act` attributes handled by one click listener per screen. Pointer events: `.screen`, `.btn`, `.icon-btn` re-enable them because `#ui` is `pointer-events: none`.
- Browser-only: don't add Node-only APIs. No runtime dependencies besides `three`.

## Gotchas

- **Duplicated constants must stay in sync**: `ROAD_HALF` (`Road.js`) vs `HALF` (`levels.js`); `SHOOTERS` (`Squad.js`) vs `SHOOTERS` and the `dps()` formula (`levels.js`). The level balancer mirrors `Squad.fire()` math; if you change one, change the other or difficulty drifts.
- **Save compatibility**: `loadSave()` shallow-merges onto `DEFAULT`, with `upgrades` merged one level deep. New top-level fields get defaults automatically; renaming or restructuring needs a key bump (`lasthuman.save.v1`) or migration. Storage can throw (private mode); keep the try/catch.
- **Audio** only starts after a user gesture (`Audio.unlock()`); every sound is rate-limited via `gate()`. Don't call `ctx` methods before unlock.
- `Game.update` clamps `dt` to 1/30 and applies `timeScale` (slow-mo on level end), so use `gdt` for anything gameplay-related and raw `dt` only for camera/UI.
- When the tab is hidden the game auto-pauses (`main.js`); keep that working if you touch pause logic.
- Gate text/colour depends on the current gun tier (`Gates.refreshGuns()`); call it after tier changes.
- Boss `claw` damage scales with squad percentage on purpose, so a huge squad with weak guns still bleeds. Keep that in mind when tuning.
- `dist/` and `node_modules/` are gitignored.

## Where to change what

| Goal | Look at |
| --- | --- |
| Difficulty / pacing of a level | `LEVELS` config and `TrackBuilder` in `data/levels.js` |
| New gate type | `Gates.text/tone/hit`, `Game.applyGate`, a pattern in `TrackBuilder` |
| New enemy | `ENEMY_TYPES` + `TINTS` (`Enemies.js`), geometry in `Models.js`, spawn kind in builder `kinds` |
| New hazard | `Hazards.js`, event type in `Game.spawnEvents`, builder pattern |
| New boss attack | `Boss.beginAttack/update`, matching hook in `Game.bossHooks` |
| New gun / hero | `data/weapons.js` / `data/heroes.js` (balancer reads `gunPower`) |
| Menus / HUD | `ui/ui.js` + `ui/ui.css` |
| Look and feel (sky, fog, bloom, camera) | `render/Scene.js` |
| Sounds | `core/Audio.js` (synth only) |
