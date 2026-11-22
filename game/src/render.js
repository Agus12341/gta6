// Marisol Heat — rendering. Draws the city, traffic, the chase, and the
// HUD (minimap, wanted stars, cash, objective banner) with plain
// Canvas2D: fills, paths, arcs, gradients and text only, so the same
// code runs in a browser and in the offline screenshot harness.

import { WORLD, PALETTE, clamp, TUNING } from './config.js';
import { groundAt } from './world.js';
import { SCREEN, accessOf } from './game.js';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const rad = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

export function clockMinutes(game) {
  return 540 + (game.time % 630); // 09:00 → 19:30, then wraps
}

function clockText(game) {
  const m = Math.floor(clockMinutes(game));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function sunTint(game) {
  const m = clockMinutes(game);
  if (m < 620) return 'rgba(255, 176, 92, 0.07)'; // morning gold
  if (m < 960) return 'rgba(255, 244, 200, 0.03)'; // bright day
  if (m < 1080) return 'rgba(255, 150, 70, 0.10)'; // afternoon glow
  return 'rgba(214, 96, 120, 0.14)'; // sunset
}

export function render(ctx, game, w, h) {
  const world = game.world;
  const p = game.player;
  let camX;
  let camY;
  if (game.screen === SCREEN.TITLE) {
    camX = 3080 + Math.sin(game.time * 0.05) * 120;
    camY = 1240 + Math.cos(game.time * 0.037) * 70;
  } else {
    camX = p.x + (p.inCar ? Math.cos(p.inCar.a) * p.inCar.speed * 0.22 : 0);
    camY = p.y + (p.inCar ? Math.sin(p.inCar.a) * p.inCar.speed * 0.22 : 0);
  }
  if (game.shake > 0) {
    camX += Math.sin(game.time * 61) * game.shake * 7;
    camY += Math.cos(game.time * 53) * game.shake * 7;
  }
  camX = clamp(camX, w / 2 - 200, WORLD.w - w / 2 + 200);
  camY = clamp(camY, h / 2 - 200, WORLD.h - h / 2 + 200);
  const ox = Math.round(w / 2 - camX);
  const oy = Math.round(h / 2 - camY);
  const view = { x: camX - w / 2 - 90, y: camY - h / 2 - 90, w: w + 180, h: h + 180 };
  const inView = (x, y, pad) => x > view.x - pad && x < view.x + view.w + pad && y > view.y - pad && y < view.y + view.h + pad;

  // --- ground -------------------------------------------------------
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(ox, oy);
  // Land mass.
  ctx.fillStyle = PALETTE.blockBase;
  ctx.fillRect(0, 0, WORLD.beachX, WORLD.h);
  // Sand and sea.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.beachX, 0, WORLD.waterX - WORLD.beachX, WORLD.h);
  const sea = ctx.createLinearGradient(WORLD.waterX, 0, WORLD.w, 0);
  sea.addColorStop(0, PALETTE.water);
  sea.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(WORLD.waterX, 0, WORLD.w - WORLD.waterX, WORLD.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 26; k += 1) {
    const y = 40 + k * 102 + Math.sin(game.time * 0.7 + k) * 8;
    const x = WORLD.waterX + 26 + ((k * 53) % 120);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 22, y - 9, x + 44, y);
    ctx.stroke();
  }
  // Park and promenade.
  if (world.park) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(world.park.x, world.park.y, world.park.w, world.park.h);
    ctx.fillStyle = PALETTE.grassDark;
    ctx.fillRect(world.park.x + 30, world.park.y + 30, world.park.w - 60, 10);
    ctx.fillRect(world.park.x + 30, world.park.y + world.park.h - 40, world.park.w - 60, 10);
  }
  const promY = WORLD.hy[WORLD.hy.length - 1] + WORLD.roadW / 2;
  ctx.fillStyle = PALETTE.plaza;
  ctx.fillRect(0, promY, WORLD.beachX, WORLD.h - promY);
  // Parking lot.
  ctx.fillStyle = PALETTE.asphaltDark;
  const lotI = 4;
  const lotJ = 0;
  const lx = WORLD.vx[lotI] + WORLD.roadW / 2;
  const ly = WORLD.hy[lotJ] + WORLD.roadW / 2;
  const lw = WORLD.vx[lotI + 1] - WORLD.vx[lotI] - WORLD.roadW;
  const lh = WORLD.hy[lotJ + 1] - WORLD.hy[lotJ] - WORLD.roadW;
  ctx.fillRect(lx, ly, lw, lh);
  ctx.strokeStyle = 'rgba(232,227,211,0.5)';
  ctx.lineWidth = 2;
  for (const s of world.lotSpots) {
    ctx.strokeRect(s.x - 20, s.y - 26, 40, 52);
  }
  // Block sidewalks.
  ctx.fillStyle = PALETTE.sidewalk;
  for (let i = 0; i < WORLD.vx.length - 1; i += 1) {
    for (let j = 0; j < WORLD.hy.length - 1; j += 1) {
      const x = WORLD.vx[i] + WORLD.roadW / 2;
      const y = WORLD.hy[j] + WORLD.roadW / 2;
      const bw = WORLD.vx[i + 1] - WORLD.vx[i] - WORLD.roadW;
      const bh = WORLD.hy[j + 1] - WORLD.hy[j] - WORLD.roadW;
      if (!inView(x + bw / 2, y + bh / 2, 340)) continue;
      if ((i === 1 && j === 2) || (i === 4 && j === 0)) continue;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = PALETTE.blockBase;
      ctx.fillRect(x + 26, y + 26, bw - 52, bh - 52);
      ctx.fillStyle = PALETTE.sidewalk;
    }
  }
  // Roads.
  ctx.fillStyle = PALETTE.asphalt;
  for (const cx of WORLD.vx) ctx.fillRect(cx - WORLD.roadW / 2, 0, WORLD.roadW, WORLD.h);
  for (const cy of WORLD.hy) ctx.fillRect(0, cy - WORLD.roadW / 2, WORLD.beachX + 64, WORLD.roadW);
  ctx.fillStyle = PALETTE.lane;
  for (const cx of WORLD.vx) {
    for (let y = 8; y < WORLD.h; y += 48) ctx.fillRect(cx - 2, y, 4, 24);
  }
  for (const cy of WORLD.hy) {
    for (let x = 8; x < WORLD.beachX; x += 48) ctx.fillRect(x, cy - 2, 24, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(232,227,211,0.55)';
  for (const cx of WORLD.vx) {
    for (const cy of WORLD.hy) {
      if (!inView(cx, cy, 60)) continue;
      for (let s = -52; s <= 52; s += 16) {
        ctx.fillRect(cx + s - 5, cy - 76, 10, 12);
        ctx.fillRect(cx + s - 5, cy + 64, 10, 12);
        ctx.fillRect(cx - 76, cy + s - 5, 12, 10);
        ctx.fillRect(cx + 64, cy + s - 5, 12, 10);
      }
    }
  }
  // Beach boardwalk line.
  ctx.fillStyle = PALETTE.sandDark;
  ctx.fillRect(WORLD.beachX + 2, 0, 7, WORLD.h);

  // --- buildings ------------------------------------------------------
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    const shX = b.ht * 0.30;
    const shY = b.ht * 0.36;
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(b.x + shX, b.y + shY, b.w, b.h);
    ctx.fillStyle = shade(b.roof.startsWith('#') ? b.roof : '#cccccc', 0.62);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.strokeStyle = 'rgba(40,36,30,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = 'rgba(60,58,52,0.35)';
    for (const ac of b.ac) ctx.fillRect(ac.x, ac.y, ac.w, ac.h);
    if (b.kind === 'hospital') {
      ctx.fillStyle = '#d64550';
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      ctx.fillRect(cx - 6, cy - 22, 12, 44);
      ctx.fillRect(cx - 22, cy - 6, 44, 12);
    }
    if (b.kind === 'police') {
      ctx.fillStyle = '#274b73';
      ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, 20);
    }
    if (b.kind && b.name && b.w > 120) {
      ctx.fillStyle = 'rgba(30,28,26,0.66)';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + (b.kind === 'hospital' ? 40 : 0));
    }
    // Door tick.
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(b.door.x - 4, b.door.y - 4, 8, 8);
  }

  // --- props ----------------------------------------------------------
  for (const pl of world.palms) {
    if (!inView(pl.x, pl.y, 40)) continue;
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(pl.x + 7, pl.y + 9, 15 * pl.s, 6 * pl.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d6a4f';
    ctx.lineWidth = 3.4 * pl.s;
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + pl.x * 0.01;
      ctx.beginPath();
      ctx.moveTo(pl.x, pl.y);
      ctx.quadraticCurveTo(
        pl.x + Math.cos(a) * 13 * pl.s, pl.y + Math.sin(a) * 13 * pl.s - 5,
        pl.x + Math.cos(a) * 21 * pl.s, pl.y + Math.sin(a) * 21 * pl.s + 3,
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#7a5c3e';
    ctx.beginPath();
    ctx.arc(pl.x, pl.y, 3.6 * pl.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8a6f4d';
  for (const bn of world.benches) {
    if (!inView(bn.x, bn.y, 30)) continue;
    ctx.save();
    ctx.translate(bn.x, bn.y);
    ctx.rotate(bn.a);
    ctx.fillRect(-13, -4, 26, 8);
    ctx.restore();
  }
  ctx.fillStyle = '#2f3542';
  for (const lp of world.lamps) {
    if (!inView(lp.x, lp.y, 12)) continue;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- pickups & markers ----------------------------------------------
  for (const pk of game.pickups) {
    if (!pk.active || !inView(pk.x, pk.y, 40)) continue;
    const bob = Math.sin(game.time * 3 + pk.x) * 3;
    ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 20 + Math.sin(game.time * 4) * 3, 0, Math.PI * 2);
    ctx.fill();
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2f9e44';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eaffea';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + bob + 1);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#f4f6f6';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d64550';
      ctx.fillRect(pk.x - 3, pk.y + bob - 8, 6, 16);
      ctx.fillRect(pk.x - 8, pk.y + bob - 3, 16, 6);
    } else if (pk.kind === 'armor') {
      ctx.fillStyle = '#457b9d';
      rrect(ctx, pk.x - 9, pk.y - 11 + bob, 18, 22, 5);
      ctx.fill();
    } else if (pk.kind === 'pistol') {
      ctx.fillStyle = '#22262e';
      ctx.fillRect(pk.x - 11, pk.y - 4 + bob, 20, 6);
      ctx.fillRect(pk.x + 3, pk.y + bob, 6, 10);
    }
  }

  const marker = game.markerTarget();
  if (marker && game.screen === SCREEN.PLAY) {
    const mp = marker.pos;
    if (inView(mp.x, mp.y, 60)) {
      const grad = ctx.createLinearGradient(0, mp.y - 190, 0, mp.y);
      grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
      grad.addColorStop(1, 'rgba(255, 209, 102, 0.35)');
      ctx.fillStyle = marker.color === '#ffd166' ? grad : 'rgba(123, 241, 168, 0.30)';
      ctx.fillRect(mp.x - 13, mp.y - 190, 26, 190);
      ctx.strokeStyle = marker.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 26 + Math.sin(game.time * 4) * 4, 0, Math.PI * 2);
      ctx.stroke();
      const cy = mp.y - 52 + Math.sin(game.time * 3.2) * 7;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.moveTo(mp.x, cy + 16);
      ctx.lineTo(mp.x - 13, cy - 6);
      ctx.lineTo(mp.x + 13, cy - 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- cars -------------------------------------------------------------
  for (const car of game.cars) {
    if (!inView(car.x, car.y, 90)) continue;
    drawCar(ctx, game, car);
  }

  // --- peds -------------------------------------------------------------
  for (const ped of game.peds) {
    if (!inView(ped.x, ped.y, 30)) continue;
    drawPed(ctx, game, ped);
  }

  // --- player -----------------------------------------------------------
  if (!p.inCar) {
    drawPlayer(ctx, game);
  }

  // --- particles & floaters ---------------------------------------------
  for (const pt of game.particles) {
    const lifeF = 1 - pt.t / pt.life;
    ctx.globalAlpha = clamp(lifeF, 0, 1) * 0.9;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * (1.6 - lifeF * 0.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floaters) {
    ctx.globalAlpha = clamp(1.4 - f.t / 1.6, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // --- sun tint & hurt flash ---------------------------------------------
  ctx.fillStyle = sunTint(game);
  ctx.fillRect(0, 0, w, h);
  if (p.hurtT > 0) {
    ctx.fillStyle = `rgba(214, 40, 57, ${clamp(p.hurtT, 0, 0.45)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (p.hp < 30 && game.screen === SCREEN.PLAY) {
    ctx.fillStyle = `rgba(160, 10, 30, ${0.10 + Math.sin(game.time * 5) * 0.04})`;
    ctx.fillRect(0, 0, w, h);
  }

  drawHud(ctx, game, w, h);
  if (game.screen === SCREEN.TITLE) drawTitle(ctx, game, w, h);
  if (game.screen === SCREEN.PAUSED) drawCentredCard(ctx, w, h, 'PAUSED', 'Enter — resume', [
    `Cash $${Math.round(p.cash)} · Missions done: ${game.missionIndex} · Fares: ${game.stats.fares}`,
    `Busted ${game.stats.busts} · Wasted ${game.stats.wasted} · Cars taken ${game.stats.carsStolen}`,
  ]);
  if (game.screen === SCREEN.BUSTED) drawCentredCard(ctx, w, h, 'BUSTED', 'The Marisol PD sends its regards.', ['The fine stings. The record stings more.']);
  if (game.screen === SCREEN.WASTED) drawCentredCard(ctx, w, h, 'WASTED', 'You wake up at St. Solana Hospital.', ['The bill comes out of your pocket.']);
  if (game.screen === SCREEN.STORY) drawCentredCard(ctx, w, h, 'STORY COMPLETE', 'Reyes runs Marisol now.', ['Press Enter — the city stays open: fares, robberies, resprays.']);
}

function drawCar(ctx, game, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.a);
  ctx.fillStyle = 'rgba(30,28,24,0.30)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 30, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#3c4048' : car.color;
  rrect(ctx, -27, -14, 54, 28, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.45)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Cabin and glass.
  ctx.fillStyle = 'rgba(24,30,38,0.88)';
  rrect(ctx, -9, -11, 24, 22, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,200,220,0.5)';
  ctx.fillRect(11, -10, 5, 20);
  ctx.fillRect(-15, -10, 4, 20);
  if (car.type === 'police') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-27, -14, 13, 28);
    ctx.fillRect(16, -14, 11, 28);
    const phase = Math.floor(game.time * 5) % 2 === 0;
    ctx.fillStyle = phase ? '#ff3b30' : '#3a86ff';
    ctx.fillRect(-4, -9, 8, 6);
    ctx.fillStyle = phase ? '#3a86ff' : '#ff3b30';
    ctx.fillRect(-4, 3, 8, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PD', 0, 0);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#22262e';
    ctx.fillRect(-5, -5, 5, 5);
    ctx.fillRect(0, 0, 5, 5);
  }
  if (car.marked) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    rrect(ctx, -31, -18, 62, 36, 10);
    ctx.stroke();
  }
  // Headlights.
  ctx.fillStyle = 'rgba(255, 240, 180, 0.9)';
  ctx.fillRect(25, -10, 3, 6);
  ctx.fillRect(25, 4, 3, 6);
  ctx.restore();
  if (car.hp < 45 && !car.dead) {
    ctx.fillStyle = 'rgba(30,30,34,0.25)';
    ctx.beginPath();
    ctx.arc(car.x + 16, car.y - 8, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPed(ctx, game, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.a + Math.PI / 2);
    ctx.fillStyle = shade(ped.color.startsWith('#') ? ped.color : '#cccccc', 0.7);
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(30,28,24,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(ped.a);
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(2.5, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (ped.fare) {
    ctx.fillStyle = '#7bf1a8';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', ped.x, ped.y - 24 + Math.sin(game.time * 4) * 3);
  }
}

function drawPlayer(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(30,28,24,0.30)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.a);
  ctx.fillStyle = '#0e7c7b';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(3, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  if (p.weapon === 'pistol') {
    ctx.fillStyle = '#22262e';
    ctx.fillRect(8, -2, 13, 4);
  }
  ctx.restore();
  if (p.package) {
    ctx.fillStyle = '#9a6b3f';
    ctx.fillRect(p.x - 7, p.y - 24, 14, 11);
    ctx.strokeStyle = '#6e4a26';
    ctx.strokeRect(p.x - 7, p.y - 24, 14, 11);
  }
  if (p.passenger) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PASSENGER ABOARD', p.x, p.y - 34);
  }
}

function drawHud(ctx, game, w, h) {
  if (game.screen === SCREEN.TITLE) return;
  const p = game.player;
  ctx.textBaseline = 'alphabetic';

  // Clock, top-left.
  ctx.fillStyle = 'rgba(16,20,26,0.55)';
  rrect(ctx, 14, 14, 86, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(clockText(game), 57, 38);

  // Cash and wanted, top-right.
  ctx.fillStyle = 'rgba(16,20,26,0.55)';
  rrect(ctx, w - 218, 14, 204, 66, 10);
  ctx.fill();
  ctx.fillStyle = '#7bf1a8';
  ctx.font = 'bold 27px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`$${Math.round(p.cash).toLocaleString('en-US')}`, w - 28, 47);
  for (let k = 0; k < 5; k += 1) {
    const cx = w - 178 + k * 36;
    const cy = 66;
    ctx.fillStyle = k < p.wanted ? '#ffd166' : 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    star(ctx, cx, cy, 11, k < p.wanted);
    if (k >= p.wanted) star(ctx, cx, cy, 11, false);
  }
  if (p.wanted > 0 && p.hiddenT > 0.4) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(w - 196, 76, 168, 3);
    ctx.fillStyle = '#98c1d9';
    ctx.fillRect(w - 196, 76, 168 * clamp(p.hiddenT / TUNING.wantedDecaySeconds, 0, 1), 3);
  }

  // Objective banner, top-centre.
  const objective = game.objectiveText();
  ctx.font = 'bold 18px system-ui, sans-serif';
  const tw = Math.min(560, objective.length * 9.6 + 44);
  ctx.fillStyle = 'rgba(16,20,26,0.62)';
  rrect(ctx, w / 2 - tw / 2, 14, tw, 40, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'center';
  ctx.fillText(objective, w / 2, 41);
  const step = game.currentStep();
  if (step && step.timer) {
    const left = Math.max(0, step.timer - game.stepT);
    ctx.fillStyle = 'rgba(16,20,26,0.62)';
    rrect(ctx, w / 2 - 110, 60, 220, 16, 8);
    ctx.fill();
    ctx.fillStyle = left < 25 ? '#ff5d5d' : '#7bf1a8';
    ctx.fillRect(w / 2 - 104, 64, 208 * (left / step.timer), 8);
  }

  // Toast.
  if (game.activeToast && game.toastT > 0) {
    const t = game.activeToast;
    ctx.font = 'bold 20px system-ui, sans-serif';
    const titleW = ctx.measureText(t.title).width;
    ctx.font = '15px system-ui, sans-serif';
    const subW = t.sub ? ctx.measureText(t.sub).width : 0;
    const boxW = Math.min(w - 48, Math.max(500, titleW + 48, subW + 48));
    ctx.fillStyle = 'rgba(16,20,26,0.72)';
    rrect(ctx, w / 2 - boxW / 2, 88, boxW, t.sub ? 62 : 40, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(t.title, w / 2, 114);
    if (t.sub) {
      ctx.fillStyle = '#d8dee6';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText(t.sub, w / 2, 136);
    }
  }

  drawMinimap(ctx, game, w, h);

  // Health and armour under the minimap.
  const bx = 16;
  const by = h - 178;
  ctx.fillStyle = 'rgba(16,20,26,0.55)';
  rrect(ctx, bx - 2, by - 2, 196, 30, 7);
  ctx.fill();
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(bx + 2, by + 2, 190, 10);
  ctx.fillStyle = p.hp > 30 ? '#51cf66' : '#ff5d5d';
  ctx.fillRect(bx + 2, by + 2, 190 * clamp(p.hp / 100, 0, 1), 10);
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(bx + 2, by + 15, 190, 7);
  ctx.fillStyle = '#74c0e8';
  ctx.fillRect(bx + 2, by + 15, 190 * clamp(p.armor / 60, 0, 1), 7);

  // Weapon, bottom-right.
  ctx.fillStyle = 'rgba(16,20,26,0.55)';
  rrect(ctx, w - 158, h - 52, 144, 38, 9);
  ctx.fill();
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.weapon === 'pistol' ? `PISTOL · ${p.ammo}` : 'FISTS', w - 86, h - 28);

  // Context prompt, bottom-centre.
  const prompt = promptFor(game);
  if (prompt) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const pw = prompt.length * 9.4 + 36;
    ctx.fillStyle = 'rgba(16,20,26,0.66)';
    rrect(ctx, w / 2 - pw / 2, h - 54, pw, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prompt, w / 2, h - 30);
  }
  // Robbery progress.
  if (game.robProgress > 0) {
    ctx.fillStyle = 'rgba(16,20,26,0.66)';
    rrect(ctx, w / 2 - 130, h - 104, 260, 20, 9);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(w / 2 - 124, h - 99, 248 * clamp(game.robProgress / 3, 0, 1), 10);
  }
  // Bust meter.
  if (p.bustT > 0.15) {
    ctx.fillStyle = 'rgba(120,10,20,0.75)';
    rrect(ctx, w / 2 - 150, 170, 300, 34, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THEY ARE BOXING YOU IN — MOVE!', w / 2, 193);
    ctx.fillStyle = '#ff5d5d';
    ctx.fillRect(w / 2 - 140, 196, 280 * clamp(p.bustT / TUNING.bustSeconds, 0, 1), 5);
  }
}

function promptFor(game) {
  const p = game.player;
  const S = game.world.specials;
  if (game.screen !== SCREEN.PLAY) return '';
  if (p.inCar) {
    const acc = accessOf(game.world, S.garage);
    const d2 = (p.x - acc.x) ** 2 + (p.y - acc.y) ** 2;
    if (d2 < 85 * 85 && (p.wanted > 0 || p.inCar.hp < 100 || p.inCar.dead)) {
      return p.cash >= TUNING.resprayCost ? `E — Respray & lose the heat ($${TUNING.resprayCost})` : 'Respray needs $100';
    }
    return '';
  }
  const near = (b, r) => (p.x - b.door.x) ** 2 + (p.y - b.door.y) ** 2 < r * r;
  const car = game.nearestCar(p.x, p.y, 52);
  if (car && !car.dead) return 'E — Take the car';
  if (near(S.store, 54) && game.robCooldown <= 0) return 'Hold E — Empty the register';
  if (near(S.hospital, 58)) return 'E — Get patched up (free)';
  if (near(S.gunstore, 58)) return `E — Pistol & ammo ($${TUNING.gunCost})`;
  if (near(S.police, 58)) return 'Marisol PD — mind the cameras';
  return '';
}

function drawMinimap(ctx, game, w, h) {
  const mw = 192;
  const mh = 120;
  const mx = 16;
  const my = h - 312;
  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;
  ctx.fillStyle = 'rgba(14,18,24,0.78)';
  rrect(ctx, mx - 3, my - 3, mw + 6, mh + 6, 10);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#8f887a';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(mx + WORLD.waterX * sx, my, (WORLD.w - WORLD.waterX) * sx, mh);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(mx + WORLD.beachX * sx, my, (WORLD.waterX - WORLD.beachX) * sx, mh);
  if (game.world.park) {
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(mx + game.world.park.x * sx, my + game.world.park.y * sy, game.world.park.w * sx, game.world.park.h * sy);
  }
  ctx.strokeStyle = 'rgba(240,238,230,0.75)';
  ctx.lineWidth = 2;
  for (const cx of WORLD.vx) {
    ctx.beginPath();
    ctx.moveTo(mx + cx * sx, my);
    ctx.lineTo(mx + cx * sx, my + mh);
    ctx.stroke();
  }
  for (const cy of WORLD.hy) {
    ctx.beginPath();
    ctx.moveTo(mx, my + cy * sy);
    ctx.lineTo(mx + mw, my + cy * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx + x * sx, my + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (game.player.wanted > 0) dot(accessOf(game.world, game.world.specials.garage).x, accessOf(game.world, game.world.specials.garage).y, '#ff70a6', 3);
  for (const c of game.cars) if (c.driver === 'police') dot(c.x, c.y, '#3a86ff', 3);
  const marker = game.markerTarget();
  if (marker) dot(marker.pos.x, marker.pos.y, marker.color, 4 + Math.sin(game.time * 5) * 1.2);
  // Player arrow.
  const p = game.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.a);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.6);
  ctx.lineTo(-5, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N', mx + mw - 14, my + 15);
}

function drawCentredCard(ctx, w, h, title, line1, lines) {
  ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h / 2 - 60);
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(line1, w / 2, h / 2 + 4);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#d8dee6';
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + 44 + i * 26));
  ctx.textBaseline = 'alphabetic';
}

function drawTitle(ctx, game, w, h) {
  const grad = ctx.createLinearGradient(0, h * 0.42, 0, h);
  grad.addColorStop(0, 'rgba(12,14,22,0)');
  grad.addColorStop(0.55, 'rgba(12,14,22,0.55)');
  grad.addColorStop(1, 'rgba(12,14,22,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  const titleGrad = ctx.createLinearGradient(0, h * 0.40, 0, h * 0.58);
  titleGrad.addColorStop(0, '#ffe9a8');
  titleGrad.addColorStop(0.55, '#ffb35c');
  titleGrad.addColorStop(1, '#ff5d7e');
  ctx.fillStyle = titleGrad;
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('MARISOL HEAT', w / 2, h * 0.47);
  ctx.fillStyle = '#f4f6f6';
  ctx.font = '21px system-ui, sans-serif';
  ctx.fillText('An open-world crime story in the sun-soaked city of Marisol', w / 2, h * 0.47 + 66);
  const options = game.save ? ['Continue', 'New Game', 'Free Roam'] : ['New Game', 'Free Roam'];
  ctx.font = 'bold 25px system-ui, sans-serif';
  options.forEach((opt, i) => {
    const y = h * 0.47 + 128 + i * 40;
    ctx.fillStyle = i === game.menuIndex ? '#ffd166' : 'rgba(230,234,240,0.75)';
    ctx.fillText(`${i === game.menuIndex ? '▶ ' : ''}${opt}`, w / 2, y);
  });
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(230,234,240,0.8)';
  ctx.fillText('WASD drive & walk · Shift run · E enter car / interact · J attack · P pause', w / 2, h - 58);
  ctx.fillText('Steal cars, run packages, empty registers, lose the heat — or just cruise the shore.', w / 2, h - 34);
  ctx.textBaseline = 'alphabetic';
}
