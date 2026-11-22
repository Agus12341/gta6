// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Check the screenshot set before anything is copied or scored. shots.json names one
// file per staged scene; each of those files has to sit in screenshots/, be a real
// JPEG or PNG (checked by magic bytes, not by its name), and fit the scorer's
// 256 KiB per-screenshot cap. A set that fails here would be refused by the scorer
// anyway, so fail now and say exactly which file is wrong.
const SHOT_LIMIT = 262144; // 256 KiB
const scenes = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
for (const scene of scenes) {
  const shotFile = join(here, 'screenshots', scene.name);
  if (!existsSync(shotFile)) {
    throw new Error(`shots.json lists "${scene.name}" but screenshots/${scene.name} does not exist`);
  }
  const shot = readFileSync(shotFile);
  if (shot.length > SHOT_LIMIT) {
    throw new Error(`screenshots/${scene.name} is ${shot.length} bytes, over the 256 KiB cap`);
  }
  const jpeg = shot[0] === 0xff && shot[1] === 0xd8;
  const png = shot.length > 3 && shot[0] === 0x89 && shot[1] === 0x50 && shot[2] === 0x4e && shot[3] === 0x47;
  if (!jpeg && !png) {
    throw new Error(`screenshots/${scene.name} is not a JPEG or PNG image`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
