// Marisol Heat — shared constants: world geometry, palette, tuning.
// An original sun-soaked open-world crime game. No third-party assets.

export const WORLD = {
  w: 4096,
  h: 2560,
  roadW: 128,
  // Centre-lines of the vertical avenues and horizontal streets.
  vx: [64, 640, 1216, 1792, 2368, 2944, 3520],
  hy: [64, 640, 1216, 1792, 2368],
  beachX: 3584, // sand starts here
  waterX: 3904, // open water starts here
};

export const STEP = 1 / 30; // fixed simulation step, seconds

export const PALETTE = {
  water: '#1b9aaa',
  waterDeep: '#14707f',
  sand: '#ecd9a0',
  sandDark: '#dfc78c',
  grass: '#7fb069',
  grassDark: '#6a9a58',
  asphalt: '#3a3f4a',
  asphaltDark: '#32363f',
  lane: '#e8e3d3',
  sidewalk: '#d9d2c0',
  sidewalkEdge: '#b9b09a',
  blockBase: '#cfc7b4',
  plaza: '#e3dcc8',
  shadow: 'rgba(38, 32, 24, 0.28)',
  roofs: ['#f4f1de', '#e07a5f', '#f2cc8f', '#81b29a', '#e8c07d', '#cdb4db', '#a8dadc', '#f28482', '#98c1d9', '#e5989b'],
  roofsDowntown: ['#7fb3c8', '#5e8ca3', '#93b8c9', '#6d9db5', '#87a8be'],
  roofsWarehouse: ['#9c8f7d', '#8a7f6e', '#a89a85'],
  cars: ['#e63946', '#f1fa8c', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#9d4edd', '#e0e1dd', '#1d3557', '#ff70a6', '#70d6ff', '#ffd670'],
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 118,
  runSpeed: 205,
  accel: 900,
  health: 100,
};

export const CAR = {
  radius: 25,
  length: 52,
  width: 27,
};

export const TUNING = {
  trafficCount: 22,
  pedCount: 34,
  parkedCount: 16,
  maxPolice: 6,
  wantedDecaySeconds: 6.5, // unseen time per star lost
  bustSeconds: 2.4, // time boxed-in at low speed before a bust
  resprayCost: 100,
  gunCost: 150,
  hospitalPenalty: 0.12, // fraction of cash lost when wasted
  bustPenalty: 0.18, // fraction of cash lost when busted
};

export const SAVE_KEY = 'marisol-heat-save-v1';

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-path interpolation between two angles, in radians. */
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Is point (x, y) on a road (either orientation), given the grid? */
export function onRoad(x, y) {
  const hw = WORLD.roadW / 2;
  for (const cx of WORLD.vx) if (Math.abs(x - cx) <= hw) return true;
  for (const cy of WORLD.hy) if (Math.abs(y - cy) <= hw) return true;
  return false;
}
