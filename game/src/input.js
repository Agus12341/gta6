// Keyboard input. The rest of the game reads a plain per-step input
// object ({mx, my, run, action, attack, and edge-triggered *Hit flags}),
// so tools and screenshot staging can synthesise the same shape.

export function blankInput() {
  return {
    mx: 0, my: 0, run: false,
    action: false, actionHit: false,
    attack: false, attackHit: false,
    pauseHit: false, confirmHit: false, menuHit: 0,
  };
}

const DOWN = new Set();
let latched = null;

function latch() {
  if (!latched) {
    latched = { action: false, attack: false, pause: false, confirm: false, menu: 0 };
  }
  return latched;
}

export function installInput(window_) {
  window_.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    DOWN.add(e.code);
    const L = latch();
    if (e.code === 'KeyE' || e.code === 'KeyF') L.action = true;
    if (e.code === 'KeyJ' || e.code === 'Space') L.attack = true;
    if (e.code === 'KeyP' || e.code === 'Escape') L.pause = true;
    if (e.code === 'Enter') L.confirm = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') L.menu = -1;
    if (e.code === 'KeyS' || e.code === 'ArrowDown') L.menu = 1;
  });
  window_.addEventListener('keyup', (e) => DOWN.delete(e.code));
  window_.addEventListener('blur', () => DOWN.clear());
}

/** Build the input for one simulation step, consuming latched edges. */
export function pollInput() {
  const input = blankInput();
  const held = (codes) => codes.some((c) => DOWN.has(c));
  input.mx = (held(['KeyD', 'ArrowRight']) ? 1 : 0) - (held(['KeyA', 'ArrowLeft']) ? 1 : 0);
  input.my = (held(['KeyS', 'ArrowDown']) ? 1 : 0) - (held(['KeyW', 'ArrowUp']) ? 1 : 0);
  input.run = held(['ShiftLeft', 'ShiftRight']);
  input.action = held(['KeyE', 'KeyF']);
  input.attack = held(['KeyJ', 'Space']);
  const L = latch();
  input.actionHit = L.action;
  input.attackHit = L.attack;
  input.pauseHit = L.pause;
  input.confirmHit = L.confirm;
  input.menuHit = L.menu;
  latched = { action: false, attack: false, pause: false, confirm: false, menu: 0 };
  return input;
}
