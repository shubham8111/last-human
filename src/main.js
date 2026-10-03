import './ui/ui.css';
import { Stage } from './render/Scene.js';
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { Audio } from './core/Audio.js';
import { loadSave } from './core/Save.js';
import { UI } from './ui/ui.js';
import { HEROES } from './data/heroes.js';

const canvas = document.getElementById('game');
const save = loadSave();
const audio = new Audio();
audio.muted = save.muted;
const stage = new Stage(canvas);
const input = new Input(canvas);

let game;
let lastStart = null;
const ui = new UI(document.getElementById('ui'), save, audio, {
  play: (n) => {
    lastStart = () => game.startLevel(n);
    lastStart();
  },
  endless: () => {
    lastStart = () => game.startEndless();
    lastStart();
  },
  restart: () => lastStart?.(),
  menu: () => game.enterMenu(),
  pause: () => game.togglePause(),
  heroChanged: () => {
    game.squad.setHero(HEROES[save.hero]);
  },
});

// Audio can only start after a user gesture.
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

document.fonts?.ready.finally(() => {
  game = new Game(stage, ui, audio, input, save);
  window.__game = game; // handy for debugging in DevTools

  // Dev only: ?speed=4 fast-forwards the simulation (used for balance testing).
  const speed = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('speed')) || 1 : 1;
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    // 120/144 Hz displays would otherwise double the GPU work; menus only need 30.
    const idle = game.state === 'menu' || game.state === 'result';
    const dt = (now - last) / 1000;
    if (dt < (idle ? 1 / 30 : 1 / 60) * 0.8) return;
    last = now;
    for (let i = 0; i < speed; i++) game.update(dt);
    if (game.paused && !stage.needsRender) return; // nothing changed since the last frame
    stage.render(dt);
  };
  requestAnimationFrame(frame);
});

// Pause automatically when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && (game.state === 'run' || game.state === 'boss')) game.togglePause();
});
