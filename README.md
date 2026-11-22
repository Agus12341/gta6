# gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Agus12341/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Agus12341/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Marisol Heat** — an original open-world crime game set in Marisol, a sun-soaked coastal city of pastel blocks, palm-lined avenues and one long beach. You play Reyes, newly arrived and already in debt to the city: work four story missions for your cousin Marco (fetch his coupe, run a hot package to Club Marisol, empty the QuickMart register, and drive a nervous accountant to Casa Del Mar), or ignore him and free-roam — steal cars, pick up taxi fares, rob the store anyway, buy a pistol at Iron & Oak Guns, and shake the Marisol PD's five-star wanted system by going unseen or paying Bayside Respray for a new colour and a clean slate. Traffic and pedestrians live their loops, police hunt in packs and box you in, and getting busted or wasted costs you a cut of your cash. Progress saves in the browser.

Everything is hand-written vanilla JS on a single canvas: a seeded, deterministic city (avenue grid, downtown towers, industrial docks, a park, a parking lot, the beach), fixed-step simulation, and a HUD with a live minimap, wanted stars, cash, health and objective banner. No libraries, no assets, no network — the whole game is the `game/` folder.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Controls: WASD/arrows to walk and drive, Shift to run, E to enter cars and interact, J (or Space) to attack, P to pause, Enter to confirm. Story progress auto-saves to localStorage.

To hand the entry in (copies `game/` and `screenshots/` to the output directory and writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
