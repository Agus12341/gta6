// Marisol: a sun-soaked coastal city on a strict avenue grid.
// East edge is beach and open water; the south strip is a promenade.
// The world is generated deterministically from a seed: blocks of pastel
// buildings, one park, one parking lot, and a set of named special
// buildings (police HQ, hospital, respray garage, gun store, the
// QuickMart, Club Marisol, the Pier 9 warehouse, Venn Motors, a hideout
// and a beach house) that the story missions hang off.

import { WORLD, PALETTE } from './config.js';
import { makeRng, randRange, randInt, pick } from './random.js';

const SIDEWALK = 26;

// Which lot of a block a special building takes, and what it is.
// Lots: 0 = NW, 1 = NE, 2 = SW, 3 = SE of the block interior.
const SPECIALS = {
  '0,0': { lot: 1, kind: 'police', name: 'Marisol PD HQ' },
  '3,0': { lot: 0, kind: 'garage', name: 'Bayside Respray' },
  '0,3': { lot: 0, kind: 'hospital', name: 'St. Solana Hospital' },
  '1,3': { lot: 1, kind: 'cousin', name: 'Venn Motors' },
  '2,3': { lot: 3, kind: 'gunstore', name: 'Iron & Oak Guns' },
  '4,2': { lot: 1, kind: 'store', name: 'QuickMart 24/7' },
  '5,1': { lot: 2, kind: 'club', name: 'Club Marisol' },
  '0,2': { lot: 3, kind: 'hideout', name: 'Calle Ocho Hideout' },
};

const PARK_BLOCK = '1,2';
const LOT_BLOCK = '4,0';
const DOCKS_BLOCK = '2,0';

export function blockRect(i, j) {
  return {
    x: WORLD.vx[i] + WORLD.roadW / 2,
    y: WORLD.hy[j] + WORLD.roadW / 2,
    w: WORLD.vx[i + 1] - WORLD.vx[i] - WORLD.roadW,
    h: WORLD.hy[j + 1] - WORLD.hy[j] - WORLD.roadW,
  };
}

function districtOf(i, j) {
  if (j === 0 && i <= 2) return 'industrial';
  if (i >= 2 && i <= 3 && j >= 1 && j <= 2) return 'downtown';
  if (i === 5) return 'marina';
  if (i <= 1) return 'oldtown';
  if (j === 3) return 'suburb';
  return 'midtown';
}

function addBuilding(world, rng, rect, district, kind, name, lot) {
  const inset = kind ? 4 : randRange(rng, 5, 18);
  const b = {
    x: rect.x + inset,
    y: rect.y + inset,
    w: rect.w - inset * 2,
    h: rect.h - inset * 2,
    kind: kind || 'generic',
    name: name || '',
  };
  if (district === 'downtown') {
    b.ht = randRange(rng, 90, 210);
    b.roof = pick(rng, PALETTE.roofsDowntown);
  } else if (district === 'industrial') {
    b.ht = randRange(rng, 22, 40);
    b.roof = pick(rng, PALETTE.roofsWarehouse);
  } else if (district === 'suburb') {
    b.ht = randRange(rng, 14, 26);
    b.roof = pick(rng, PALETTE.roofs);
  } else {
    b.ht = randRange(rng, 30, 80);
    b.roof = pick(rng, PALETTE.roofs);
  }
  if (kind === 'police') { b.ht = 70; b.roof = '#8fa3b8'; }
  if (kind === 'hospital') { b.ht = 60; b.roof = '#eef2f0'; }
  if (kind === 'garage' || kind === 'cousin') { b.ht = 26; b.roof = '#c96f4a'; }
  if (kind === 'club') { b.ht = 44; b.roof = '#5f4b8b'; }
  if (kind === 'store') { b.ht = 24; b.roof = '#d64550'; }
  // Roof furniture, deterministic per building.
  b.ac = [];
  const acCount = b.w > 90 && b.h > 90 ? randInt(rng, 1, 3) : 0;
  for (let k = 0; k < acCount; k += 1) {
    b.ac.push({
      x: b.x + randRange(rng, 12, Math.max(13, b.w - 44)),
      y: b.y + randRange(rng, 12, Math.max(13, b.h - 36)),
      w: randRange(rng, 18, 34),
      h: randRange(rng, 14, 24),
    });
  }
  // The door is where interactions happen. A special building's door
  // faces the avenue its lot touches (east lots face east, west lots
  // west), so it always opens onto the clear sidewalk ring; the docks
  // and the beach house face south onto open ground.
  if (kind === 'docks' || kind === 'beachhouse') {
    b.doorSide = 'S';
    b.door = { x: b.x + b.w / 2, y: b.y + b.h + 15 };
  } else if (kind) {
    b.doorSide = lot === 1 || lot === 3 ? 'E' : 'W';
    b.door = b.doorSide === 'E'
      ? { x: b.x + b.w + 15, y: b.y + b.h / 2 }
      : { x: b.x - 15, y: b.y + b.h / 2 };
  } else {
    b.doorSide = 'S';
    b.door = { x: b.x + b.w / 2, y: b.y + b.h + 15 };
  }
  world.buildings.push(b);
  if (kind) world.specials[kind] = b;
  return b;
}

export function buildWorld(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const world = {
    buildings: [],
    palms: [],
    lamps: [],
    benches: [],
    specials: {},
    lotSpots: [],
    park: null,
  };

  for (let i = 0; i < WORLD.vx.length - 1; i += 1) {
    for (let j = 0; j < WORLD.hy.length - 1; j += 1) {
      const key = `${i},${j}`;
      const rect = blockRect(i, j);
      const district = districtOf(i, j);
      const inner = {
        x: rect.x + SIDEWALK,
        y: rect.y + SIDEWALK,
        w: rect.w - SIDEWALK * 2,
        h: rect.h - SIDEWALK * 2,
      };
      if (key === PARK_BLOCK) {
        world.park = rect;
        for (let k = 0; k < 9; k += 1) {
          world.palms.push({ x: inner.x + randRange(rng, 20, inner.w - 20), y: inner.y + randRange(rng, 20, inner.h - 20), s: randRange(rng, 0.8, 1.25) });
        }
        for (let k = 0; k < 5; k += 1) {
          world.benches.push({ x: inner.x + randRange(rng, 30, inner.w - 50), y: inner.y + randRange(rng, 30, inner.h - 30), a: pick(rng, [0, Math.PI / 2]) });
        }
        continue;
      }
      if (key === LOT_BLOCK) {
        // Open parking lot: marked bays along both long edges.
        for (let s = 0; s < 6; s += 1) {
          world.lotSpots.push({ x: inner.x + 40 + s * 58, y: inner.y + 34, a: Math.PI / 2 });
          world.lotSpots.push({ x: inner.x + 40 + s * 58, y: inner.y + inner.h - 34, a: -Math.PI / 2 });
        }
        continue;
      }
      if (key === DOCKS_BLOCK) {
        addBuilding(world, rng, inner, 'industrial', 'docks', 'Pier 9 Warehouse', 0);
        continue;
      }
      const special = SPECIALS[key];
      const lotW = inner.w / 2;
      const lotH = inner.h / 2;
      const houses = district === 'suburb' && !special;
      if (houses) {
        for (let a = 0; a < 3; a += 1) {
          for (let c = 0; c < 2; c += 1) {
            addBuilding(world, rng, {
              x: inner.x + a * (inner.w / 3) + 8,
              y: inner.y + c * lotH + 14,
              w: inner.w / 3 - 16,
              h: lotH - 28,
            }, district, '', '');
          }
        }
        continue;
      }
      for (let lot = 0; lot < 4; lot += 1) {
        const lr = {
          x: inner.x + (lot % 2) * lotW,
          y: inner.y + Math.floor(lot / 2) * lotH,
          w: lotW,
          h: lotH,
        };
        if (special && special.lot === lot) {
          addBuilding(world, rng, lr, district, special.kind, special.name, lot);
        } else if (rng() < 0.88) {
          addBuilding(world, rng, lr, district, '', '');
        }
      }
    }
  }

  // The beach house stands alone on the sand.
  addBuilding(world, rng, { x: 3650, y: 1330, w: 150, h: 110 }, 'marina', 'beachhouse', 'Casa Del Mar', 0);

  // Palms: a loose double row along the beach and the south promenade,
  // plus a few on the marina sidewalk corners.
  for (let y = 90; y < WORLD.h - 60; y += randRange(rng, 90, 150)) {
    world.palms.push({ x: randRange(rng, 3620, 3680), y, s: randRange(rng, 0.9, 1.4) });
    if (rng() < 0.7) world.palms.push({ x: randRange(rng, 3760, 3860), y: y + randRange(rng, -30, 30), s: randRange(rng, 0.8, 1.2) });
  }
  for (let x = 200; x < WORLD.beachX - 80; x += randRange(rng, 130, 210)) {
    world.palms.push({ x, y: randRange(rng, 2470, 2520), s: randRange(rng, 0.85, 1.2) });
  }

  // Street lamps on intersection corners.
  for (const cx of WORLD.vx) {
    for (const cy of WORLD.hy) {
      world.lamps.push({ x: cx - 74, y: cy - 74 });
      world.lamps.push({ x: cx + 74, y: cy + 74 });
    }
  }
  return world;
}

/** What is underfoot: drives speed factors and rendering. */
export function groundAt(world, x, y) {
  if (x >= WORLD.waterX) return 'water';
  if (x >= WORLD.beachX) return 'sand';
  const hw = WORLD.roadW / 2;
  for (const cx of WORLD.vx) if (Math.abs(x - cx) <= hw) return 'road';
  for (const cy of WORLD.hy) if (Math.abs(y - cy) <= hw) return 'road';
  if (world.park && x >= world.park.x && x <= world.park.x + world.park.w && y >= world.park.y && y <= world.park.y + world.park.h) return 'grass';
  if (y >= WORLD.hy[WORLD.hy.length - 1] + hw) return 'plaza';
  // Inside a block: the ring is sidewalk, the middle is lot ground.
  for (let i = 0; i < WORLD.vx.length - 1; i += 1) {
    for (let j = 0; j < WORLD.hy.length - 1; j += 1) {
      const r = blockRect(i, j);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        const edge = Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
        if (`${i},${j}` === LOT_BLOCK) return 'asphalt';
        return edge < SIDEWALK ? 'sidewalk' : 'block';
      }
    }
  }
  return 'sidewalk';
}

const GROUND_SPEED = { road: 1, sidewalk: 0.85, plaza: 0.85, block: 0.8, asphalt: 0.95, grass: 0.6, sand: 0.55, water: 0 };

export function groundSpeed(world, x, y) {
  return GROUND_SPEED[groundAt(world, x, y)];
}

/** Circle-vs-city collision: buildings, deep water and the world edge. */
export function isSolid(world, x, y, r) {
  if (x < r || y < r || x > WORLD.w - r || y > WORLD.h - r) return true;
  if (x + r > WORLD.waterX + 26) return true;
  const bs = world.buildings;
  for (let k = 0; k < bs.length; k += 1) {
    const b = bs[k];
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** Move a circle through the city with axis-separated sliding. Mutates p ({x, y}). */
export function moveCircle(world, p, dx, dy, r) {
  let hitX = false;
  let hitY = false;
  if (!isSolid(world, p.x + dx, p.y, r)) p.x += dx;
  else hitX = true;
  if (!isSolid(world, p.x, p.y + dy, r)) p.y += dy;
  else hitY = true;
  return { hitX, hitY };
}

/** The cross-street coordinate of the right-hand lane for a car on a road. */
export function laneCross(axis, dir, centre) {
  // Right-hand traffic: heading +x uses the south lane, +y the west lane.
  if (axis === 'h') return centre + (dir > 0 ? 32 : -32);
  return centre + (dir > 0 ? -32 : 32);
}

/** Centres of the roads crossing a given road, for intersection logic. */
export function crossings(axis) {
  return axis === 'v' ? WORLD.hy : WORLD.vx;
}
