// Marisol Heat — browser entrypoint. Wires the canvas, keyboard and the
// fixed-step loop together; with ?shot=<scene>&seed=<n> in the URL it
// instead stages one deterministic scene (used for screenshots).

import { Game, SCREEN } from './game.js';
import { render } from './render.js';
import { installInput, pollInput, blankInput } from './input.js';
import { stageShot } from './shots.js';
import { STEP } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

function viewSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  return { w, h, dpr };
}

let view = viewSize();
window.addEventListener('resize', () => {
  view = viewSize();
});

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

if (shotName) {
  // Screenshot mode: stage the scene once and hold the frame.
  const seed = Number(params.get('seed') || 7);
  const game = stageShot(shotName, seed);
  const draw = () => {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    render(ctx, game, view.w, view.h);
    window.requestAnimationFrame(draw);
  };
  draw();
} else {
  installInput(window);
  let storage = null;
  try {
    storage = window.localStorage;
  } catch (e) {
    storage = null;
  }
  const game = new Game(20261122, storage);
  // Losing the tab pauses the city instead of letting it run away.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN.PLAY) game.screen = SCREEN.PAUSED;
  });
  let last = performance.now();
  let acc = 0;
  let announced = '';
  const frame = (now) => {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let input = blankInput();
    let polled = false;
    while (acc >= STEP) {
      if (!polled) {
        input = pollInput();
        polled = true;
      } else {
        // Held keys carry into extra steps; edges fire only once.
        const held = pollInput();
        input = { ...held, actionHit: false, attackHit: false, pauseHit: false, confirmHit: false, menuHit: 0 };
      }
      game.step(input);
      acc -= STEP;
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    render(ctx, game, view.w, view.h);
    const line = game.screen === SCREEN.TITLE
      ? 'Marisol Heat title screen'
      : `Marisol Heat — ${game.objectiveText()} — cash $${Math.round(game.player.cash)}, wanted ${game.player.wanted} stars`;
    if (line !== announced) {
      announced = line;
      if (status) status.textContent = line;
    }
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
}
