// Marisol Heat — the simulation: player, traffic, pedestrians, police,
// wanted system, combat, pickups, robberies, taxi fares and the four
// story missions. Pure logic on a fixed step; rendering lives in
// render.js and input in input.js, so tools can drive this directly.

import { WORLD, PLAYER, TUNING, SAVE_KEY, clamp, angleLerp, dist2 } from './config.js';
import { makeRng, randRange, pick } from './random.js';
import { buildWorld, blockRect, groundSpeed, isSolid, moveCircle, laneCross, crossings } from './world.js';

export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  BUSTED: 'busted',
  WASTED: 'wasted',
  STORY: 'story',
};

const CAR_TYPES = {
  sedan: { maxSpeed: 262, accel: 238, grip: 2.1 },
  coupe: { maxSpeed: 302, accel: 285, grip: 2.3 },
  sports: { maxSpeed: 350, accel: 330, grip: 2.5 },
  taxi: { maxSpeed: 252, accel: 230, grip: 2.1 },
  van: { maxSpeed: 226, accel: 205, grip: 1.9 },
  truck: { maxSpeed: 208, accel: 185, grip: 1.8 },
  police: { maxSpeed: 312, accel: 282, grip: 2.4 },
};
const TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'truck', 'sports'];
const CAR_PAINTS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#9d4edd', '#e0e1dd', '#1d3557', '#ff70a6', '#70d6ff', '#ffd670', '#8ac926'];
const PED_PAINTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#e07a5f', '#81b29a', '#f2cc8f', '#cdb4db', '#e8c07d', '#98c1d9'];

/** The point on the road outside a special building's door — where cars stop. */
export function accessOf(world, b) {
  if (!b || b.kind === 'beachhouse' || b.kind === 'docks') return { x: b.door.x, y: b.door.y + 26 };
  for (let i = 0; i < WORLD.vx.length - 1; i += 1) {
    for (let j = 0; j < WORLD.hy.length - 1; j += 1) {
      const r = blockRect(i, j);
      if (b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) {
        if (b.doorSide === 'E') return { x: r.x + r.w + 38, y: b.door.y };
        if (b.doorSide === 'W') return { x: r.x - 38, y: b.door.y };
        return { x: b.door.x, y: r.y + r.h + 38 };
      }
    }
  }
  return { x: b.door.x, y: b.door.y };
}

function buildMissions(game) {
  const S = game.world.specials;
  const acc = (b) => accessOf(game.world, b);
  return [
    {
      title: 'First Day in Marisol',
      intro: 'Your cousin Marco left a coupe by the marina. Bring it home to Venn Motors.',
      reward: 250,
      steps: [
        { type: 'goto', at: () => game.markedCar, r: 85, text: 'Get to the marked coupe by the marina' },
        { type: 'enterMarked', text: 'Take the coupe (press E)' },
        { type: 'drive', at: () => acc(S.cousin), r: 95, text: 'Drive the coupe to Venn Motors' },
      ],
    },
    {
      title: 'Hot Package',
      intro: 'A crate at Pier 9 needs to reach Club Marisol. No questions, no stops.',
      reward: 600,
      steps: [
        { type: 'goto', at: () => acc(S.docks), r: 100, text: 'Head to the Pier 9 warehouse' },
        { type: 'pickup', at: () => S.docks.door, r: 72, text: 'Pick up the package at the warehouse door' },
        {
          type: 'drive', at: () => acc(S.club), r: 95, needsCar: true, timer: 170,
          text: 'Deliver the package to Club Marisol — move!',
          onStart: (g) => g.crime(0, 2),
          onFail: (g) => { g.player.package = false; g.showToast('Too slow', 'The buyer walked. Grab another package.', 3); },
          failStep: 1,
        },
      ],
    },
    {
      title: 'Store Credit',
      intro: 'The QuickMart on Avenida 5 keeps its register full and its cameras broken.',
      reward: 1200,
      steps: [
        { type: 'goto', at: () => S.store.door, r: 66, text: 'Go to the QuickMart' },
        { type: 'rob', at: () => S.store.door, r: 54, text: 'Hold E at the register to empty it' },
        { type: 'escape', text: 'Lose the cops' },
        { type: 'goto', at: () => S.hideout.door, r: 72, text: 'Lay low at the Calle Ocho hideout' },
      ],
    },
    {
      title: 'The Long Goodbye',
      intro: 'An accountant who knows too much needs to reach Casa Del Mar. Alive.',
      reward: 2500,
      steps: [
        {
          type: 'drive', at: () => acc(S.docks), r: 100, needsCar: true,
          text: 'Pick up the accountant at Pier 9',
          onArrive: (g) => { g.player.passenger = true; g.showToast('Passenger aboard', 'Get him to Casa Del Mar.', 3); },
        },
        {
          type: 'drive', at: () => acc(S.beachhouse), r: 105, needsCar: true,
          text: 'Get him to Casa Del Mar — do not stop',
          onStart: (g) => g.crime(0, 3),
        },
      ],
    },
  ];
}

export class Game {
  constructor(seed, storage) {
    this.seed = seed;
    this.storage = storage || null;
    this.rng = makeRng(seed * 31 + 7);
    this.world = buildWorld(seed);
    this.missions = buildMissions(this);
    this.save = this.readSave();
    this.screen = SCREEN.TITLE;
    this.menuIndex = 0;
    this.time = 0;
    this.resetWorld();
  }

  readSave() {
    try {
      if (!this.storage) return null;
      const raw = this.storage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  writeSave() {
    try {
      if (!this.storage) return;
      this.storage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.round(this.player.cash),
        mission: this.missionIndex,
        storyDone: this.storyDone,
        stats: this.stats,
      }));
    } catch (e) { /* storage is best-effort */ }
  }

  /** (Re)build every entity. Player progress is set by startRun(). */
  resetWorld() {
    const rng = this.rng;
    this.cars = [];
    this.peds = [];
    this.particles = [];
    this.floaters = [];
    this.toasts = [];
    this.toastT = 0;
    this.player = {
      x: 3300, y: 1216, a: -Math.PI / 2, vx: 0, vy: 0,
      hp: PLAYER.health, armor: 0, cash: 120, wanted: 0,
      weapon: 'fists', ammo: 0, inCar: null, attackCd: 0,
      bustT: 0, hiddenT: 0, hurtT: 0, package: false, passenger: false,
      speed: 0,
    };
    this.stats = { earned: 0, busts: 0, wasted: 0, carsStolen: 0, fares: 0 };
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.stepT = 0;
    this.storyDone = false;
    this.taxi = null;
    this.taxiCooldown = 20;
    this.policeSpawnT = 0;
    this.robProgress = 0;
    this.robCooldown = 0;
    this.tookMarkedCar = false;
    this.endT = 0;
    this.shake = 0;

    // The marked coupe Marco left by the marina (mission 1).
    this.markedCar = this.spawnCar('coupe', 2892, 1130, Math.PI / 2, null);
    this.markedCar.color = '#ffcf3f';
    this.markedCar.marked = true;

    // Parked cars: the lot, plus cars nosed along avenue parking lanes.
    const spots = this.world.lotSpots;
    for (let k = 0; k < spots.length; k += 1) {
      if (rng() < 0.62) this.spawnCar(pick(rng, TRAFFIC_TYPES), spots[k].x, spots[k].y, spots[k].a, null);
    }
    for (let k = 0; k < TUNING.parkedCount; k += 1) {
      const spot = this.randomRoadPoint(0, 0, 0, true);
      if (spot) this.spawnCar(pick(rng, TRAFFIC_TYPES), spot.x, spot.y, spot.a, null);
    }
    for (let k = 0; k < TUNING.trafficCount; k += 1) this.spawnTraffic(true);
    for (let k = 0; k < TUNING.pedCount; k += 1) this.spawnPed();

    // Pickups: cash in the park and back alleys, gear at the stores.
    this.pickups = [];
    const S = this.world.specials;
    for (let k = 0; k < 10; k += 1) {
      const p = this.randomSidewalkPoint();
      this.pickups.push({ x: p.x, y: p.y, kind: 'cash', amount: Math.round(randRange(rng, 40, 90)), active: true, respawnT: 0, respawn: 45 });
    }
    this.pickups.push({ x: S.gunstore.door.x, y: S.gunstore.door.y, kind: 'pistol', active: true, respawnT: 0, respawn: 90 });
    this.pickups.push({ x: S.hospital.door.x, y: S.hospital.door.y, kind: 'health', active: true, respawnT: 0, respawn: 25 });
    this.pickups.push({ x: S.police.door.x + 26, y: S.police.door.y, kind: 'armor', active: true, respawnT: 0, respawn: 90 });
  }

  startRun(mode) {
    if (mode === 'continue' && this.save) {
      this.player.cash = this.save.cash;
      this.missionIndex = Math.min(this.save.mission, this.missions.length - 1);
      this.storyDone = !!this.save.storyDone;
      this.stats = this.save.stats || this.stats;
    } else if (mode === 'free') {
      this.storyDone = true;
      this.player.cash = 500;
    } else {
      this.missionIndex = 0;
      this.storyDone = false;
      this.player.cash = 120;
    }
    this.stepIndex = 0;
    this.stepT = 0;
    this.screen = SCREEN.PLAY;
    if (!this.storyDone) {
      const m = this.missions[this.missionIndex];
      this.showToast(m.title, m.intro, 4.5);
      this.runStepStart();
    } else {
      this.showToast('Marisol is yours', 'Free roam: fares, robberies and resprays are open.', 4);
    }
  }

  spawnCar(type, x, y, a, driver) {
    const spec = CAR_TYPES[type];
    const car = {
      type, x, y, a, speed: 0, hp: 100,
      maxSpeed: spec.maxSpeed, accel: spec.accel, grip: spec.grip,
      color: type === 'police' ? '#e8e8ec' : type === 'taxi' ? '#f7b731' : pick(this.rng, CAR_PAINTS),
      driver, state: driver === 'traffic' ? 'traffic' : driver === 'police' ? 'chase' : 'parked',
      axis: 'h', dir: 1, centre: y, fireT: 0, stuckT: 0, dead: false, marked: false,
    };
    this.cars.push(car);
    return car;
  }

  /** A point on a road: parked cars hug the kerb, others sit in a lane. */
  randomRoadPoint(cx, cy, minDist, parked) {
    const rng = this.rng;
    for (let tries = 0; tries < 24; tries += 1) {
      const vertical = rng() < 0.5;
      const centre = vertical ? pick(rng, WORLD.vx) : pick(rng, WORLD.hy);
      const along = randRange(rng, 80, (vertical ? WORLD.h : WORLD.w) - 80);
      const off = parked ? pick(rng, [-52, 52]) : pick(rng, [-32, 32]);
      const x = vertical ? centre + off : along;
      const y = vertical ? along : centre + off;
      if (minDist && dist2(x, y, cx, cy) < minDist * minDist) continue;
      if (isSolid(this.world, x, y, 26)) continue;
      return { x, y, a: vertical ? (off > 0 ? -Math.PI / 2 : Math.PI / 2) : (off > 0 ? Math.PI : 0) };
    }
    return null;
  }

  spawnTraffic(anywhere) {
    const p = this.player;
    const spot = this.randomRoadPoint(p.x, p.y, anywhere ? 0 : 620);
    if (!spot) return;
    const car = this.spawnCar(pick(this.rng, TRAFFIC_TYPES), spot.x, spot.y, spot.a, 'traffic');
    // Reconstruct lane state from the spawn point.
    let bestAxis = 'h';
    let bestCentre = 0;
    let bestD = Infinity;
    for (const c of WORLD.hy) { const d = Math.abs(spot.y - c); if (d < bestD) { bestD = d; bestAxis = 'h'; bestCentre = c; } }
    for (const c of WORLD.vx) { const d = Math.abs(spot.x - c); if (d < bestD) { bestD = d; bestAxis = 'v'; bestCentre = c; } }
    car.axis = bestAxis;
    car.centre = bestCentre;
    car.dir = bestAxis === 'h' ? (Math.cos(spot.a) >= 0 ? 1 : -1) : (Math.sin(spot.a) >= 0 ? 1 : -1);
    car.speed = car.maxSpeed * 0.55;
    return car;
  }

  randomSidewalkPoint() {
    const rng = this.rng;
    const i = Math.floor(rng() * (WORLD.vx.length - 1));
    const j = Math.floor(rng() * (WORLD.hy.length - 1));
    const r = blockRect(i, j);
    const side = Math.floor(rng() * 4);
    const t = rng();
    const inset = 13;
    if (side === 0) return { x: r.x + t * r.w, y: r.y + inset };
    if (side === 1) return { x: r.x + t * r.w, y: r.y + r.h - inset };
    if (side === 2) return { x: r.x + inset, y: r.y + t * r.h };
    return { x: r.x + r.w - inset, y: r.y + t * r.h };
  }

  spawnPed(x, y) {
    const p = this.randomSidewalkPoint();
    const ped = {
      x: x !== undefined ? x : p.x, y: y !== undefined ? y : p.y,
      a: randRange(this.rng, 0, Math.PI * 2), speed: 0,
      hp: 100, state: 'walk', tx: 0, ty: 0, fleeT: 0, downT: 0,
      color: pick(this.rng, PED_PAINTS), fare: false,
    };
    ped.tx = ped.x;
    ped.ty = ped.y;
    this.peds.push(ped);
    return ped;
  }

  // ------------------------------------------------------------- helpers

  showToast(title, sub, dur) {
    this.toasts.push({ title, sub: sub || '', t: 0, dur: dur || 3.2 });
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color: color || '#ffd166', t: 0 });
  }

  burst(x, y, n, color, speed, life, size) {
    for (let k = 0; k < n; k += 1) {
      if (this.particles.length > 320) return;
      const a = randRange(this.rng, 0, Math.PI * 2);
      const s = randRange(this.rng, speed * 0.3, speed);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        t: 0, life: randRange(this.rng, life * 0.5, life),
        size: randRange(this.rng, size * 0.6, size * 1.4), color, drag: 2.2,
      });
    }
  }

  crime(n, floor) {
    const p = this.player;
    const next = clamp(Math.max(p.wanted + n, floor || 0), 0, 5);
    if (next > p.wanted) {
      p.wanted = next;
      p.hiddenT = 0;
    }
  }

  witnessed(x, y, r) {
    const rr = r * r;
    for (const c of this.cars) if (c.driver === 'police' && dist2(x, y, c.x, c.y) < rr) return true;
    for (const pd of this.peds) if (pd.state !== 'down' && dist2(x, y, pd.x, pd.y) < rr) return true;
    return false;
  }

  damagePlayer(n) {
    const p = this.player;
    if (this.screen !== SCREEN.PLAY) return;
    let left = n;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, n * 0.6);
      p.armor -= absorbed;
      left = n - absorbed;
    }
    p.hp -= left;
    p.hurtT = 0.6;
    if (p.hp <= 0) {
      p.hp = 0;
      this.screen = SCREEN.WASTED;
      this.endT = 2.6;
      this.stats.wasted += 1;
    }
  }

  currentStep() {
    if (this.storyDone) return null;
    const m = this.missions[this.missionIndex];
    return m ? m.steps[this.stepIndex] || null : null;
  }

  runStepStart() {
    const s = this.currentStep();
    this.stepT = 0;
    this.robProgress = 0;
    if (s && s.onStart) s.onStart(this);
  }

  completeStep() {
    const s = this.currentStep();
    if (s && s.onArrive) s.onArrive(this);
    this.stepIndex += 1;
    const m = this.missions[this.missionIndex];
    if (this.stepIndex >= m.steps.length) {
      this.player.cash += m.reward;
      this.stats.earned += m.reward;
      this.addFloater(this.player.x, this.player.y - 30, `+$${m.reward}`, '#7bf1a8');
      this.showToast('Mission complete', `${m.title} — $${m.reward}`, 3.6);
      this.missionIndex += 1;
      this.stepIndex = 0;
      if (this.missionIndex >= this.missions.length) {
        this.storyDone = true;
        this.screen = SCREEN.STORY;
        this.writeSave();
        return;
      }
      const next = this.missions[this.missionIndex];
      this.showToast(next.title, next.intro, 4.5);
      this.writeSave();
    }
    this.runStepStart();
  }

  failStep() {
    const s = this.currentStep();
    if (!s) return;
    if (s.onFail) s.onFail(this);
    if (typeof s.failStep === 'number') {
      this.stepIndex = s.failStep;
      this.runStepStart();
    }
  }

  resetMission() {
    this.stepIndex = 0;
    this.player.package = false;
    this.player.passenger = false;
    this.runStepStart();
  }

  objectiveText() {
    const s = this.currentStep();
    if (this.taxi) {
      return this.taxi.phase === 'pickup' ? 'Taxi: pick up the fare (green marker)' : 'Taxi: drop off the fare (green marker)';
    }
    if (!s) return 'Free roam — Marisol is yours';
    return s.text;
  }

  /** Where the HUD marker points: mission first, then a taxi fare. */
  markerTarget() {
    const s = this.currentStep();
    if (s && s.at) return { pos: s.at(), color: '#ffd166' };
    if (this.taxi) return { pos: this.taxi.phase === 'pickup' ? this.taxi.ped : this.taxi.dest, color: '#7bf1a8' };
    if (s && s.type === 'escape') return null;
    return null;
  }

  // ------------------------------------------------------------- main step

  step(input) {
    const dt = 1 / 30;
    this.time += dt;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.toasts.length && this.toastT <= 0) {
      const t = this.toasts.shift();
      this.activeToast = t;
      this.toastT = t.dur;
    }
    if (this.activeToast) this.activeToast.t += dt;

    if (this.screen === SCREEN.TITLE) {
      if (input.menuHit) {
        const n = this.save ? 3 : 2;
        this.menuIndex = (this.menuIndex + input.menuHit + n) % n;
      }
      if (input.confirmHit) {
        const modes = this.save ? ['continue', 'new', 'free'] : ['new', 'free'];
        this.startRun(modes[this.menuIndex]);
      }
      this.updateAmbient(dt);
      return;
    }
    if (this.screen === SCREEN.STORY) {
      if (input.confirmHit) this.screen = SCREEN.PLAY;
      this.updateAmbient(dt);
      return;
    }
    if (this.screen === SCREEN.PAUSED) {
      if (input.pauseHit || input.confirmHit) this.screen = SCREEN.PLAY;
      return;
    }
    if (this.screen === SCREEN.BUSTED || this.screen === SCREEN.WASTED) {
      this.endT -= dt;
      this.updateParticles(dt);
      this.updateAmbient(dt, true);
      if (this.endT <= 0) this.respawn();
      return;
    }
    if (input.pauseHit) {
      this.screen = SCREEN.PAUSED;
      return;
    }
    this.stepT += dt;
    this.updatePlayer(dt, input);
    if (this.screen !== SCREEN.PLAY) return; // died mid-step
    this.updateCars(dt);
    this.updatePeds(dt);
    this.updatePolice(dt);
    this.updatePickups(dt);
    this.updateMission(dt, input);
    this.updateTaxi(dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    if (this.robCooldown > 0) this.robCooldown -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  updateAmbient(dt, calm) {
    // Title-screen city life: traffic and peds, nobody chasing anybody.
    for (const car of this.cars) if (car.driver === 'traffic') this.updateTrafficCar(car, dt);
    this.collideCars();
    for (const ped of this.peds) this.updatePed(ped, dt);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    if (!calm && this.rng() < dt * 0.2) { /* ambient stays topped up via play */ }
  }

  updateFloaters(dt) {
    for (const f of this.floaters) { f.t += dt; f.y -= 26 * dt; }
    this.floaters = this.floaters.filter((f) => f.t < 1.6);
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const d = Math.max(0, 1 - pt.drag * dt);
      pt.vx *= d;
      pt.vy *= d;
    }
    this.particles = this.particles.filter((pt) => pt.t < pt.life);
  }

  // ------------------------------------------------------------- player

  updatePlayer(dt, input) {
    const p = this.player;
    if (p.attackCd > 0) p.attackCd -= dt;
    p.hurtT -= dt; // runs negative: regen starts after a quiet spell
    // Slow health regen after a quiet spell.
    if (p.hurtT <= -10 && p.hp > 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 3.5 * dt);

    if (p.inCar) {
      const car = p.inCar;
      if (input.actionHit) {
        // At the respray's drive-in, E means "fix it", not "get out".
        const acc = accessOf(this.world, this.world.specials.garage);
        const atGarage = dist2(car.x, car.y, acc.x, acc.y) < 85 * 85;
        if (atGarage && (p.wanted > 0 || car.hp < 100 || car.dead) && p.cash >= TUNING.resprayCost) this.doRespray();
        else this.exitCar();
        return;
      }
      const ground = groundSpeed(this.world, car.x, car.y);
      const throttle = car.dead ? 0 : -input.my;
      if (throttle > 0) car.speed += car.accel * ground * dt;
      else if (throttle < 0) car.speed -= (car.speed > 4 ? 340 : 120) * dt;
      car.speed -= car.speed * 0.55 * dt; // drag
      if (!input.my) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt); // engine braking
      car.speed = clamp(car.speed, -88, car.maxSpeed * ground + 40);
      const steerAuthority = clamp(Math.abs(car.speed) / 130, 0, 1) * (car.speed < 0 ? -1 : 1);
      car.a += input.mx * car.grip * steerAuthority * dt;
      if (Math.abs(car.speed) > 205 && Math.abs(input.mx) > 0.4 && this.rng() < dt * 7) {
        this.burst(car.x - Math.cos(car.a) * 24, car.y - Math.sin(car.a) * 24, 1, 'rgba(230,228,220,0.5)', 26, 0.7, 7);
      }
      const dx = Math.cos(car.a) * car.speed * dt;
      const dy = Math.sin(car.a) * car.speed * dt;
      const before = Math.abs(car.speed);
      const hit = moveCircle(this.world, car, dx, dy, 25);
      if ((hit.hitX || hit.hitY) && before > 60) {
        this.damageCar(car, (before - 60) * 0.16, true);
        car.speed = -car.speed * 0.22;
        this.shake = Math.min(1, before / 300);
      } else if (hit.hitX || hit.hitY) {
        car.speed *= 0.4;
      }
      p.x = car.x;
      p.y = car.y;
      p.a = car.a;
      p.speed = Math.abs(car.speed);
      return;
    }

    // On foot.
    const mag = Math.hypot(input.mx, input.my);
    if (mag > 0.05) {
      const run = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const sp = run * groundSpeed(this.world, p.x, p.y);
      const nx = (input.mx / mag) * sp;
      const ny = (input.my / mag) * sp;
      p.vx = nx;
      p.vy = ny;
      p.a = Math.atan2(ny, nx);
      p.speed = sp;
    } else {
      p.vx = 0;
      p.vy = 0;
      p.speed = 0;
    }
    moveCircle(this.world, p, p.vx * dt, p.vy * dt, PLAYER.radius);

    if (input.actionHit) {
      const car = this.nearestCar(p.x, p.y, 52);
      if (car && !car.dead) {
        this.enterCar(car);
        return;
      }
      this.tryDoorInteraction();
    }
    if (input.attackHit && p.attackCd <= 0) this.attack();
    this.updateRobbery(dt, input);
  }

  nearestCar(x, y, maxD) {
    let best = null;
    let bestD = maxD * maxD;
    for (const c of this.cars) {
      const d = dist2(x, y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    const p = this.player;
    const wasParked = car.driver === null;
    const wasPolice = car.driver === 'police';
    if (car.driver === 'traffic') {
      // The driver bails out and runs.
      const ped = this.spawnPed(car.x + 20, car.y + 14);
      ped.state = 'flee';
      ped.fleeT = 3;
    }
    car.driver = 'player';
    car.state = 'player';
    if (car === this.markedCar) this.tookMarkedCar = true;
    p.inCar = car;
    p.speed = 0;
    this.stats.carsStolen += wasParked || wasPolice ? 1 : 0;
    if (wasPolice) this.crime(1, 2);
    else if (wasParked && !car.marked && this.witnessed(car.x, car.y, 250)) this.crime(1, 1);
    if (car.marked) car.marked = false;
  }

  exitCar() {
    const p = this.player;
    const car = p.inCar;
    if (!car) return;
    car.driver = null;
    car.state = 'parked';
    car.speed = 0;
    p.inCar = null;
    // Step out on the left side; fall back to any clear spot.
    const sideA = car.a + Math.PI / 2;
    const spots = [
      { x: car.x + Math.cos(sideA) * 36, y: car.y + Math.sin(sideA) * 36 },
      { x: car.x - Math.cos(sideA) * 36, y: car.y - Math.sin(sideA) * 36 },
      { x: car.x - Math.cos(car.a) * 40, y: car.y - Math.sin(car.a) * 40 },
    ];
    for (const s of spots) {
      if (!isSolid(this.world, s.x, s.y, PLAYER.radius)) { p.x = s.x; p.y = s.y; break; }
    }
    p.speed = 0;
    if (this.taxi && this.taxi.phase === 'dropoff') {
      this.showToast('Fare lost', 'The passenger got out and walked.', 2.6);
      this.taxi = null;
      this.taxiCooldown = 25;
    } else if (this.taxi) {
      this.taxi.ped.fare = false;
      this.taxi = null;
      this.taxiCooldown = 15;
    }
  }

  attack() {
    const p = this.player;
    if (p.weapon === 'pistol' && p.ammo > 0) {
      p.ammo -= 1;
      p.attackCd = 0.24;
      const range = 430;
      const fx = p.x + Math.cos(p.a) * 20;
      const fy = p.y + Math.sin(p.a) * 20;
      this.burst(fx, fy, 3, '#ffd166', 40, 0.12, 4);
      let bestT = range;
      let bestPed = null;
      let bestCar = null;
      const test = (x, y, r) => {
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range || d < 12) return;
        let da = Math.atan2(dy, dx) - p.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > 0.16 + Math.atan2(r, d)) return;
        // Buildings block the shot.
        for (let s = 0.25; s < 1; s += 0.25) {
          if (isSolid(this.world, p.x + dx * s, p.y + dy * s, 2)) return;
        }
        if (d < bestT) { bestT = d; return true; }
        return false;
      };
      for (const pd of this.peds) if (pd.state !== 'down' && test(pd.x, pd.y, 12)) { bestPed = pd; bestCar = null; }
      for (const c of this.cars) if (c !== p.inCar && test(c.x, c.y, 26)) { bestCar = c; bestPed = null; }
      if (bestPed) {
        bestPed.hp -= 55;
        this.burst(bestPed.x, bestPed.y, 5, '#e63946', 60, 0.4, 4);
        if (bestPed.hp <= 0) { bestPed.state = 'down'; bestPed.downT = 0; }
        else { bestPed.state = 'flee'; bestPed.fleeT = 3; }
        if (this.witnessed(p.x, p.y, 320)) this.crime(1, 2);
      } else if (bestCar) {
        this.damageCar(bestCar, 14, false);
        this.burst(bestCar.x, bestCar.y, 4, '#ffd166', 70, 0.3, 3);
        if (bestCar.driver === 'police' && this.witnessed(p.x, p.y, 340)) this.crime(1, 3);
        else if (this.witnessed(p.x, p.y, 300)) this.crime(1, 2);
        if (bestCar.driver === 'traffic') { bestCar.state = 'flee'; }
      } else if (this.witnessed(p.x, p.y, 280)) {
        this.crime(0, 1);
      }
      // Gunfire panics the street either way.
      for (const pd of this.peds) {
        if (pd.state === 'walk' && dist2(p.x, p.y, pd.x, pd.y) < 260 * 260) { pd.state = 'flee'; pd.fleeT = 2.5; }
      }
      return;
    }
    // Fists.
    p.attackCd = 0.34;
    const hx = p.x + Math.cos(p.a) * 30;
    const hy = p.y + Math.sin(p.a) * 30;
    for (const pd of this.peds) {
      if (pd.state !== 'down' && dist2(hx, hy, pd.x, pd.y) < 30 * 30) {
        pd.hp -= 45;
        this.burst(pd.x, pd.y, 3, '#e8e3d3', 50, 0.3, 3);
        if (pd.hp <= 0) { pd.state = 'down'; pd.downT = 0; if (this.witnessed(p.x, p.y, 260)) this.crime(1, 2); }
        else { pd.state = 'flee'; pd.fleeT = 3; if (this.witnessed(p.x, p.y, 260)) this.crime(1, 1); }
        return;
      }
    }
    const car = this.nearestCar(hx, hy, 34);
    if (car) {
      this.damageCar(car, 3, false);
      if (car.driver === 'traffic') car.state = 'flee';
    }
  }

  damageCar(car, n, crash) {
    car.hp -= n;
    if (car.hp <= 0 && !car.dead) {
      car.dead = true;
      car.hp = 0;
      this.burst(car.x, car.y, 16, '#3a3f4a', 60, 1.1, 9);
      if (this.player.inCar === car) this.showToast('Wrecked', 'This ride is done. Find another.', 2.6);
    }
  }

  // ------------------------------------------------------------- doors & robbery

  nearDoor(b, r) {
    const p = this.player;
    return !p.inCar && dist2(p.x, p.y, b.door.x, b.door.y) < r * r;
  }

  tryDoorInteraction() {
    const p = this.player;
    const S = this.world.specials;
    if (this.nearDoor(S.hospital, 58)) {
      if (p.hp < 100) { p.hp = 100; this.showToast('St. Solana Hospital', 'Patched up, free of charge.', 2.4); }
      return;
    }
    if (this.nearDoor(S.gunstore, 58)) {
      if (p.weapon !== 'pistol' || p.ammo < 12) {
        if (p.cash >= TUNING.gunCost) {
          p.cash -= TUNING.gunCost;
          p.weapon = 'pistol';
          p.ammo += 36;
          this.showToast('Iron & Oak Guns', 'Pistol and 36 rounds — $150.', 2.6);
        } else {
          this.showToast('Iron & Oak Guns', `A pistol costs $${TUNING.gunCost}. You are short.`, 2.6);
        }
      } else {
        this.showToast('Iron & Oak Guns', 'You are already carrying.', 2);
      }
      return;
    }
    if (this.nearDoor(S.police, 58)) {
      this.showToast('Marisol PD', 'Smile for the cameras. The armoury vest by the door is unguarded…', 2.6);
    }
  }

  updateRobbery(dt, input) {
    const p = this.player;
    const store = this.world.specials.store;
    const step = this.currentStep();
    const inSpot = this.nearDoor(store, 54) && this.robCooldown <= 0;
    if (inSpot && input.action) {
      this.robProgress += dt;
      if (this.robProgress >= 3) {
        this.robProgress = 0;
        this.robCooldown = 150;
        const take = Math.round(randRange(this.rng, 300, 520));
        p.cash += take;
        this.stats.earned += take;
        this.crime(0, 3);
        this.addFloater(p.x, p.y - 26, `+$${take} — register emptied`, '#7bf1a8');
        this.showToast('Robbery!', 'The alarm is screaming. Run.', 3);
        if (step && step.type === 'rob') this.completeStep();
      }
    } else if (this.robProgress > 0) {
      this.robProgress = Math.max(0, this.robProgress - dt * 1.6);
    }
  }

  /** The respray: pay, lose the heat, roll out in a fresh colour. */
  doRespray() {
    const p = this.player;
    p.cash -= TUNING.resprayCost;
    p.wanted = 0;
    p.hiddenT = 0;
    p.bustT = 0;
    p.inCar.hp = 100;
    p.inCar.dead = false;
    p.inCar.color = pick(this.rng, CAR_PAINTS);
    this.showToast('Bayside Respray', 'New paint, no past. The heat is gone.', 3);
  }

  // ------------------------------------------------------------- cars

  updateCars(dt) {
    const p = this.player;
    for (const car of this.cars) {
      if (car.driver === 'traffic') this.updateTrafficCar(car, dt);
      else if (car.state === 'flee' && car.driver === null) { /* a bailed car stays put */ }
      if (car.dead && this.rng() < dt * 2) {
        this.burst(car.x, car.y - 6, 1, 'rgba(40,40,46,0.55)', 22, 1.2, 10);
      }
      if (car.hp < 55 && !car.dead && this.rng() < dt * 1.4) {
        this.burst(car.x, car.y, 1, 'rgba(90,90,96,0.4)', 14, 0.9, 7);
      }
    }
    this.collideCars();
    // Pedestrians versus cars.
    for (const car of this.cars) {
      if (Math.abs(car.speed) < 12) continue;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        if (dist2(car.x, car.y, ped.x, ped.y) < 30 * 30) {
          if (Math.abs(car.speed) > 68) {
            ped.hp = 0;
            ped.state = 'down';
            ped.downT = 0;
            this.burst(ped.x, ped.y, 6, '#e63946', 60, 0.4, 4);
            if (car.driver === 'player') { this.crime(1, 2); this.shake = Math.max(this.shake, 0.5); }
            car.speed *= 0.82;
          } else {
            ped.state = 'flee';
            ped.fleeT = 2;
          }
        }
      }
    }
    // Keep the city populated around the player.
    const traffic = this.cars.filter((c) => c.driver === 'traffic');
    if (traffic.length < TUNING.trafficCount && this.rng() < dt * 0.8) this.spawnTraffic(false);
    this.cars = this.cars.filter((c) => {
      if (c.driver === 'traffic' && dist2(c.x, c.y, p.x, p.y) > 1250 * 1250) return false;
      return true;
    });
  }

  updateTrafficCar(car, dt) {
    if (car.dead) { car.speed = 0; return; }
    const along = car.axis === 'h' ? car.x : car.y;
    const crossTarget = laneCross(car.axis, car.dir, car.centre);
    const lookAhead = 95;
    const tx = car.axis === 'h' ? car.x + car.dir * lookAhead : crossTarget;
    const ty = car.axis === 'h' ? crossTarget : car.y + car.dir * lookAhead;
    const desired = Math.atan2(ty - car.y, tx - car.x);
    car.a = angleLerp(car.a, desired, clamp(3.2 * dt, 0, 1));

    // Slow for whatever is ahead in the lane.
    let target = car.maxSpeed * 0.62;
    for (const other of this.cars) {
      if (other === car) continue;
      const d2 = dist2(car.x, car.y, other.x, other.y);
      if (d2 < 105 * 105) {
        const ahead = (other.x - car.x) * Math.cos(car.a) + (other.y - car.y) * Math.sin(car.a);
        if (ahead > 0) target = Math.min(target, other.speed * 0.92);
      }
    }
    const p = this.player;
    if (p.inCar && dist2(car.x, car.y, p.x, p.y) < 100 * 100) {
      const ahead = (p.x - car.x) * Math.cos(car.a) + (p.y - car.y) * Math.sin(car.a);
      if (ahead > 0) target = Math.min(target, Math.abs(p.inCar.speed) * 0.9);
    }
    if (car.speed < target) car.speed = Math.min(target, car.speed + car.accel * 0.7 * dt);
    else car.speed = Math.max(target, car.speed - 300 * dt);

    const prevAlong = along;
    const dx = Math.cos(car.a) * car.speed * dt;
    const dy = Math.sin(car.a) * car.speed * dt;
    const hit = moveCircle(this.world, car, dx, dy, 25);
    if (hit.hitX || hit.hitY) car.speed *= 0.5;

    // Turn at intersections.
    const newAlong = car.axis === 'h' ? car.x : car.y;
    for (const c of crossings(car.axis)) {
      const crossed = car.dir > 0 ? (prevAlong < c && newAlong >= c) : (prevAlong > c && newAlong <= c);
      if (crossed && this.rng() < 0.42) {
        const oldAxis = car.axis;
        car.axis = oldAxis === 'h' ? 'v' : 'h';
        car.centre = c;
        car.dir = this.rng() < 0.5 ? 1 : -1;
        if (car.axis === 'v') car.x = laneCross('v', car.dir, c);
        else car.y = laneCross('h', car.dir, c);
        break;
      }
    }
  }

  collideCars() {
    // Two passes per step keep overlaps shallow when a chase piles up.
    this.collideCarsPass();
    this.collideCarsPass();
  }

  collideCarsPass() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const A = cars[i];
        const B = cars[j];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 50 * 50 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (50 - d) / 2;
        if (!isSolid(this.world, A.x - nx * overlap, A.y - ny * overlap, 25)) { A.x -= nx * overlap; A.y -= ny * overlap; }
        if (!isSolid(this.world, B.x + nx * overlap, B.y + ny * overlap, 25)) { B.x += nx * overlap; B.y += ny * overlap; }
        const rel = Math.abs(A.speed - B.speed) + Math.abs(A.speed) * 0.2;
        if (rel > 55) {
          this.damageCar(A, (rel - 55) * 0.1, true);
          this.damageCar(B, (rel - 55) * 0.1, true);
          this.burst((A.x + B.x) / 2, (A.y + B.y) / 2, 5, '#ffd166', 80, 0.35, 3);
          if (A.driver === 'player' || B.driver === 'player') {
            this.shake = Math.min(1, rel / 260);
            const other = A.driver === 'player' ? B : A;
            if (other.driver === 'police') this.crime(0, 2);
          }
        }
        A.speed *= 0.72;
        B.speed *= 0.72;
        if (A.driver === 'traffic') A.state = 'traffic';
        if (B.driver === 'traffic' && A.driver === 'player') { B.state = 'parked'; B.driver = null; const pd = this.spawnPed(B.x + 18, B.y + 16); pd.state = 'flee'; pd.fleeT = 3; }
      }
    }
  }

  // ------------------------------------------------------------- peds

  updatePeds(dt) {
    for (const ped of this.peds) this.updatePed(ped, dt);
    const alive = this.peds.filter((pd) => pd.state !== 'down' || pd.downT < 24);
    this.peds = alive;
    if (this.peds.length < TUNING.pedCount && this.rng() < dt * 0.7) {
      const p = this.randomSidewalkPoint();
      if (dist2(p.x, p.y, this.player.x, this.player.y) > 500 * 500) this.spawnPed(p.x, p.y);
    }
  }

  updatePed(ped, dt) {
    if (ped.state === 'down') { ped.downT += dt; return; }
    if (ped.fare) { ped.speed = 0; return; }
    let targetSpeed = 62;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const threat = this.player;
      const away = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.tx = ped.x + Math.cos(away) * 120;
      ped.ty = ped.y + Math.sin(away) * 120;
      targetSpeed = 168;
      if (ped.fleeT <= 0) ped.state = 'walk';
    } else if (dist2(ped.x, ped.y, ped.tx, ped.ty) < 14 * 14 || (ped.tx === ped.x && ped.ty === ped.y)) {
      const next = this.randomSidewalkPointNear(ped.x, ped.y);
      ped.tx = next.x;
      ped.ty = next.y;
    }
    const desired = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.a = angleLerp(ped.a, desired, clamp(6 * dt, 0, 1));
    ped.speed = targetSpeed;
    const hit = moveCircle(this.world, ped, Math.cos(ped.a) * ped.speed * dt, Math.sin(ped.a) * ped.speed * dt, 11);
    if (hit.hitX || hit.hitY) { ped.tx = ped.x; ped.ty = ped.y; }
  }

  randomSidewalkPointNear(x, y) {
    // A point on a nearby block's sidewalk ring.
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < WORLD.vx.length - 1; i += 1) {
      for (let j = 0; j < WORLD.hy.length - 1; j += 1) {
        const r = blockRect(i, j);
        const cx = clamp(x, r.x, r.x + r.w);
        const cy = clamp(y, r.y, r.y + r.h);
        const d = dist2(x, y, cx, cy);
        if (d < bestD) { bestD = d; best = r; }
      }
    }
    const t = this.rng();
    const side = Math.floor(this.rng() * 4);
    const inset = 13;
    if (!best) return { x, y };
    if (side === 0) return { x: best.x + t * best.w, y: best.y + inset };
    if (side === 1) return { x: best.x + t * best.w, y: best.y + best.h - inset };
    if (side === 2) return { x: best.x + inset, y: best.y + t * best.h };
    return { x: best.x + best.w - inset, y: best.y + t * best.h };
  }

  // ------------------------------------------------------------- police

  updatePolice(dt) {
    const p = this.player;
    const police = this.cars.filter((c) => c.driver === 'police');
    const desired = p.wanted > 0 ? Math.min(1 + p.wanted, TUNING.maxPolice) : 0;
    this.policeSpawnT -= dt;
    if (police.length < desired && this.policeSpawnT <= 0) {
      this.policeSpawnT = 2.2;
      const spot = this.randomRoadPoint(p.x, p.y, 640);
      if (spot && dist2(spot.x, spot.y, p.x, p.y) > 560 * 560) {
        const car = this.spawnCar('police', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'police');
        car.speed = 120;
      }
    }
    // Wanted decay while unseen.
    let seen = false;
    for (const c of police) if (dist2(c.x, c.y, p.x, p.y) < 545 * 545) seen = true;
    if (p.wanted > 0) {
      if (!seen) {
        p.hiddenT += dt;
        if (p.hiddenT >= TUNING.wantedDecaySeconds) {
          p.wanted -= 1;
          p.hiddenT = 2.5;
          if (p.wanted === 0) this.showToast('Heat lost', 'The streets are quiet again.', 2.4);
        }
      } else {
        p.hiddenT = 0;
      }
    }

    let boxedIn = false;
    for (const car of police) {
      if (car.dead) continue;
      if (p.wanted === 0) {
        // Stand down: cruise off and despawn.
        car.driver = 'traffic';
        car.state = 'traffic';
        car.axis = Math.abs(car.x % 1) < 0.01 ? 'v' : 'h';
        let bestD = Infinity;
        for (const c of WORLD.hy) { const d = Math.abs(car.y - c); if (d < bestD) { bestD = d; car.axis = 'h'; car.centre = c; } }
        for (const c of WORLD.vx) { const d = Math.abs(car.x - c); if (d < bestD) { bestD = d; car.axis = 'v'; car.centre = c; } }
        car.dir = 1;
        continue;
      }
      const d = Math.hypot(p.x - car.x, p.y - car.y);
      const lead = clamp(d / 320, 0, 0.55);
      const tx = p.x + (p.inCar ? Math.cos(p.inCar.a) * p.inCar.speed * lead : 0);
      const ty = p.y + (p.inCar ? Math.sin(p.inCar.a) * p.inCar.speed * lead : 0);
      let desiredA = Math.atan2(ty - car.y, tx - car.x);
      // If a building blocks the nose, swing wide.
      const probeX = car.x + Math.cos(car.a) * 86;
      const probeY = car.y + Math.sin(car.a) * 86;
      if (isSolid(this.world, probeX, probeY, 24)) {
        const left = desiredA + 1.0;
        const right = desiredA - 1.0;
        const lx = car.x + Math.cos(left) * 86;
        const ly = car.y + Math.sin(left) * 86;
        desiredA = isSolid(this.world, lx, ly, 24) ? right : left;
      }
      car.a = angleLerp(car.a, desiredA, clamp(3.4 * dt, 0, 1));
      let target = car.maxSpeed;
      if (d > 430) target = car.maxSpeed * 1.12;
      if (d < 62) target = Math.min(target, Math.max(30, p.speed * 0.92));
      if (car.speed < target) car.speed = Math.min(target, car.speed + car.accel * dt);
      else car.speed = Math.max(target, car.speed - 380 * dt);
      const hit = moveCircle(this.world, car, Math.cos(car.a) * car.speed * dt, Math.sin(car.a) * car.speed * dt, 25);
      if (hit.hitX || hit.hitY) {
        car.speed *= 0.35;
        car.stuckT += dt;
        if (car.stuckT > 1.4) { car.a += Math.PI * 0.9; car.stuckT = 0; }
      } else {
        car.stuckT = 0;
      }
      if (d < 100 && p.speed < 40) boxedIn = true;
      // Officers fire at three stars and up.
      if (p.wanted >= 3 && d < 300) {
        car.fireT -= dt;
        if (car.fireT <= 0) {
          car.fireT = 0.55;
          if (this.rng() < 0.42) {
            this.damagePlayer(p.inCar ? 1.6 : 2.6);
            this.burst(p.x, p.y, 2, '#ffd166', 50, 0.15, 3);
          } else {
            this.burst(car.x + Math.cos(car.a) * 28, car.y + Math.sin(car.a) * 28, 2, '#ffe9a8', 60, 0.1, 3);
          }
        }
      }
    }
    if (boxedIn && p.wanted > 0) {
      p.bustT += dt;
      if (p.bustT >= TUNING.bustSeconds) {
        this.screen = SCREEN.BUSTED;
        this.endT = 2.6;
        this.stats.busts += 1;
        return;
      }
    } else {
      p.bustT = Math.max(0, p.bustT - dt * 1.4);
    }
    // Retire distant units so the pack stays near the action.
    this.cars = this.cars.filter((c) => !(c.driver === 'police' && dist2(c.x, c.y, p.x, p.y) > 1500 * 1500));
  }

  respawn() {
    const p = this.player;
    const S = this.world.specials;
    const spot = this.screen === SCREEN.BUSTED ? accessOf(this.world, S.police) : accessOf(this.world, S.hospital);
    if (this.screen === SCREEN.BUSTED) p.cash = Math.round(p.cash * (1 - TUNING.bustPenalty));
    else p.cash = Math.round(p.cash * (1 - TUNING.hospitalPenalty));
    if (p.inCar) {
      p.inCar.driver = null;
      p.inCar.state = 'parked';
      p.inCar = null;
    }
    p.x = spot.x;
    p.y = spot.y;
    p.hp = 100;
    p.armor = 0;
    p.wanted = 0;
    p.bustT = 0;
    p.hiddenT = 0;
    p.speed = 0;
    this.cars = this.cars.filter((c) => c.driver !== 'police');
    this.taxi = null;
    this.resetMission();
    this.screen = SCREEN.PLAY;
    this.showToast('Back on the street', 'The city does not wait. Neither do you.', 3);
    this.writeSave();
  }

  // ------------------------------------------------------------- pickups, missions, taxi

  updatePickups(dt) {
    const p = this.player;
    for (const pk of this.pickups) {
      if (!pk.active) {
        pk.respawnT -= dt;
        if (pk.respawnT <= 0) pk.active = true;
        continue;
      }
      if (p.inCar) continue;
      if (dist2(p.x, p.y, pk.x, pk.y) < 26 * 26) {
        if (pk.kind === 'cash') {
          p.cash += pk.amount;
          this.stats.earned += pk.amount;
          this.addFloater(pk.x, pk.y - 18, `+$${pk.amount}`, '#7bf1a8');
        } else if (pk.kind === 'pistol') {
          if (p.weapon === 'pistol') continue;
          p.weapon = 'pistol';
          p.ammo += 24;
          this.showToast('Pistol', 'Picked up a pistol, 24 rounds. J to fire.', 2.6);
        } else if (pk.kind === 'health') {
          if (p.hp >= 100) continue;
          p.hp = Math.min(100, p.hp + 55);
          this.addFloater(pk.x, pk.y - 18, '+ health', '#7bf1a8');
        } else if (pk.kind === 'armor') {
          if (p.armor >= 60) continue;
          p.armor = 60;
          this.addFloater(pk.x, pk.y - 18, '+ armour', '#98c1d9');
        }
        pk.active = false;
        pk.respawnT = pk.respawn;
      }
    }
  }

  updateMission(dt, input) {
    this.lastActionHit = !!input.actionHit;
    const s = this.currentStep();
    if (!s) return;
    const p = this.player;
    if (s.timer) {
      if (this.stepT > s.timer) {
        this.failStep();
        return;
      }
    }
    switch (s.type) {
      case 'goto': {
        const at = s.at();
        if (dist2(p.x, p.y, at.x, at.y) < s.r * s.r) this.completeStep();
        break;
      }
      case 'enterMarked': {
        if (this.tookMarkedCar) this.completeStep();
        break;
      }
      case 'drive': {
        const at = s.at();
        if (p.inCar && dist2(p.x, p.y, at.x, at.y) < s.r * s.r) this.completeStep();
        break;
      }
      case 'pickup': {
        const at = s.at();
        if (!p.inCar && dist2(p.x, p.y, at.x, at.y) < s.r * s.r) {
          p.package = true;
          this.showToast('Package aboard', 'Keep it moving.', 2.4);
          this.completeStep();
        }
        break;
      }
      case 'rob': {
        // Completion fires from updateRobbery.
        break;
      }
      case 'escape': {
        if (p.wanted === 0 && this.stepT > 1) this.completeStep();
        break;
      }
      default:
        break;
    }
  }

  updateTaxi(dt) {
    const p = this.player;
    if (this.taxiCooldown > 0) this.taxiCooldown -= dt;
    if (!this.taxi) {
      const step = this.currentStep();
      const busyStep = step && (step.type === 'drive' || step.type === 'rob');
      if (p.inCar && !busyStep && this.taxiCooldown <= 0) {
        let candidate = null;
        for (const ped of this.peds) {
          if (ped.state === 'walk' && !ped.fare && dist2(p.x, p.y, ped.x, ped.y) < 700 * 700) { candidate = ped; break; }
        }
        if (candidate && this.rng() < dt * 0.25) {
          candidate.fare = true;
          candidate.state = 'walk';
          this.taxi = { phase: 'pickup', ped: candidate, dest: null, fare: 0 };
          this.showToast('Taxi fare', 'A rider is waiting — green marker.', 2.6);
        }
      }
      return;
    }
    const t = this.taxi;
    if (t.phase === 'pickup') {
      if (t.ped.state === 'down') { this.taxi = null; this.taxiCooldown = 20; return; }
      if (p.inCar && dist2(p.x, p.y, t.ped.x, t.ped.y) < 62 * 62 && Math.abs(p.inCar.speed) < 30) {
        t.phase = 'dropoff';
        const dests = Object.values(this.world.specials);
        const dest = pick(this.rng, dests);
        t.dest = accessOf(this.world, dest);
        const d = Math.hypot(t.dest.x - p.x, t.dest.y - p.y);
        t.fare = Math.round(36 + d * 0.055);
        t.started = this.time;
        this.peds = this.peds.filter((pd) => pd !== t.ped);
        this.showToast('Fare aboard', `Ride worth about $${t.fare}. Drive clean for a tip.`, 2.8);
      }
    } else if (t.phase === 'dropoff') {
      if (p.inCar && dist2(p.x, p.y, t.dest.x, t.dest.y) < 85 * 85 && Math.abs(p.inCar.speed) < 40) {
        const tip = this.time - t.started < 75 && p.inCar.hp > 80 ? Math.round(t.fare * 0.35) : 0;
        p.cash += t.fare + tip;
        this.stats.earned += t.fare + tip;
        this.stats.fares += 1;
        this.addFloater(p.x, p.y - 30, `+$${t.fare + tip} fare`, '#7bf1a8');
        this.showToast('Fare paid', tip ? `+$${t.fare} plus a $${tip} tip.` : `+$${t.fare}.`, 2.6);
        this.taxi = null;
        this.taxiCooldown = 30;
      }
    }
  }
}
