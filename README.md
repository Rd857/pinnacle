# Pinnacle

A vertical-city tower sim you play in the browser. Place rooms, run elevators, collect rent, and chase a five-star rating.

Inspired by the classic *SimTower* — original mechanics and presentation, not a clone of the old assets.

![Pinnacle](public/og.jpg)

## Play

Start with a lobby on the ground floor, raise a shaft, and fill the tower.

- **Offices** pay rent when workers can reach them. A cafe keeps them from walking out at lunch.
- **Hotels** come in singles (⅓ of an office), doubles (⅔), and suites (full office width).
- **Three stars** need a boutique and a restaurant — both unlock at two stars.
- **Ballroom** (four stars) hosts galas, weddings, and recitals. Guests arrive in the evening; you get paid when the night is over. A restaurant on site sweetens the take.
- **Express elevators** (two stars) are faster, hold 16, and only stop every 5 floors.
- **Extra cars** share a shaft and pass through each other. Click a shaft and hit *Add car* (up to 8).
- Widen the lot from either end when floors get tight.
- Progress saves in the browser.

**Controls:** click a tool once and stamp it as many times as you want. Right-click or Esc puts it down. Drag to pan, scroll or pinch to zoom, WASD or arrows to move. Space pauses. 1 / 2 / 3 set speed.

Starting funds: Tight ($24k), Standard ($40k), or Loaded ($80k). Pause also has a treasury inject if you want more runway.

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080).

```bash
npm run build     # production build
npm run preview   # serve the built app
npm run typecheck
```

Requires Node 22.

## Stack

React, TanStack Start, Vite, Tailwind, HTML5 canvas. Simulation runs on a fixed timestep; people path to the nearest useful elevator and extra cars split hall calls.

No account, no server save — everything lives in `localStorage`.

## License

MIT. *SimTower* is a trademark of its respective owners; this is an independent game.
