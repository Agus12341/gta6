// Staged, deterministic scenes behind ?shot=title|drive|chase|mission.
// Each one builds a real game, plays the real rules forward with a
// simple autopilot for a fixed number of steps, and leaves the game in
// the frame the screenshot shows — the same seed always gives the same
// frame, in a browser or in the offline harness.

import { Game, SCREEN } from './game.js';
import { blankInput } from './input.js';
import { clamp } from './config.js';

function steerToward(game, tx, ty, throttle) {
  const p = game.player;
  const car = p.inCar;
  const input = blankInput();
  input.my = throttle;
  if (car) {
    let da = Math.atan2(ty - car.y, tx - car.x) - car.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    input.mx = clamp(da * 2.4, -1, 1);
  }
  return input;
}

function putPlayerInCar(game, type, x, y, a) {
  const car = game.spawnCar(type, x, y, a, null);
  car.driver = 'player';
  car.state = 'player';
  game.player.inCar = car;
  game.player.x = x;
  game.player.y = y;
  return car;
}

function placeTraffic(game, type, x, y, axis, centre, dir) {
  const car = game.spawnCar(type, x, y, axis === 'h' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), 'traffic');
  car.axis = axis;
  car.centre = centre;
  car.dir = dir;
  car.speed = car.maxSpeed * 0.5;
  return car;
}

export function stageShot(name, seed) {
  const game = new Game(seed || 7, null);
  const idle = blankInput();

  if (name === 'drive') {
    game.startRun('new');
    game.toasts = [];
    game.activeToast = null;
    game.toastT = 0;
    game.missionIndex = 1;
    game.stepIndex = 2;
    game.player.package = true;
    game.runStepStart(); // the delivery run starts at two stars
    putPlayerInCar(game, 'sports', 1500, 1248, 0);
    placeTraffic(game, 'sedan', 1750, 1184, 'h', 1216, -1);
    placeTraffic(game, 'taxi', 2912, 760, 'v', 2944, 1);
    placeTraffic(game, 'van', 1150, 1184, 'h', 1216, -1);
    for (let k = 0; k < 128; k += 1) {
      game.step(steerToward(game, 2900, 1248, -1));
    }
    return game;
  }

  if (name === 'chase') {
    game.startRun('free');
    game.toasts = [];
    game.activeToast = null;
    game.toastT = 0;
    putPlayerInCar(game, 'coupe', 2350, 672, 0);
    game.crime(0, 3);
    const cop1 = game.spawnCar('police', 2140, 640, 0, 'police');
    cop1.speed = 200;
    const cop2 = game.spawnCar('police', 1980, 700, 0, 'police');
    cop2.speed = 210;
    const cop3 = game.spawnCar('police', 2912, 240, Math.PI / 2, 'police');
    cop3.speed = 170;
    placeTraffic(game, 'sedan', 2900, 608, 'h', 640, -1);
    for (let k = 0; k < 92; k += 1) {
      const target = game.player.x < 3350 ? { x: 3450, y: 672 } : { x: 3520, y: 1500 };
      game.step(steerToward(game, target.x, target.y, -1));
    }
    return game;
  }

  if (name === 'mission') {
    game.startRun('new');
    game.toasts = [];
    game.activeToast = null;
    game.toastT = 0;
    game.missionIndex = 2;
    game.stepIndex = 1;
    game.runStepStart();
    const door = game.world.specials.store.door;
    game.player.x = door.x + 16;
    game.player.y = door.y + 6;
    game.player.a = Math.PI; // facing the register
    game.robProgress = 1.85;
    // One unit is already rolling toward the silent alarm.
    game.crime(0, 1);
    const cop = game.spawnCar('police', door.x - 560, door.y + 120, 0, 'police');
    cop.speed = 170;
    for (let k = 0; k < 42; k += 1) {
      const input = blankInput();
      input.action = true; // holding E at the register
      game.step(input);
    }
    for (let k = 0; k < 46; k += 1) {
      const input = blankInput();
      input.mx = 1;
      input.run = true;
      game.step(input);
    }
    return game;
  }

  // 'title' and anything else: the living city behind the menu.
  game.screen = SCREEN.TITLE;
  for (let k = 0; k < 120; k += 1) game.step(idle);
  return game;
}
