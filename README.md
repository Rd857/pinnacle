# Pinnacle

A vertical-city tower sim you play in the browser. Place rooms, run elevators, collect rent, and chase a five-star rating.

Inspired by the classic *SimTower* — original mechanics and presentation, not a clone of the old assets.

![Pinnacle](public/og.jpg)

---

## Run it on your computer

No account, no extra apps. You download the code, install its libraries, and open it in a browser.

### 1. Install Git and Node.js

You need both of these:

| Tool | What it’s for | Download |
| --- | --- | --- |
| **Git** | Downloads this project | [git-scm.com/downloads](https://git-scm.com/downloads) |
| **Node.js 22 or newer** | Runs the game. Comes with `npm`. | [nodejs.org](https://nodejs.org) — pick **22.x** or newer |

After installing, **close and reopen** your terminal so it can see them.

Check that they work. On a Mac or Linux open **Terminal**. On Windows open **PowerShell** or **Command Prompt**. Type these one at a time:

```bash
git --version
node --version
npm --version
```

`node --version` should look like `v22.4.1` or `v24.1.0` — anything **22 or higher**. If you see `v18` or `v20`, install Node 22 from [nodejs.org](https://nodejs.org) and try again in a new terminal.

### 2. Download the project

```bash
git clone https://github.com/Rd857/pinnacle.git
cd pinnacle
```

That creates a `pinnacle` folder and moves you into it. Stay in that folder for the next steps.

No Git? On the GitHub page click the green **Code** button → **Download ZIP**. Unzip it, then in the terminal `cd` into the unzipped folder (the one that contains `package.json`).

### 3. Install the libraries (once)

```bash
npm install
```

This takes a minute or two. It only needs to run once, and again later if you download updates. When it finishes you should see a `node_modules` folder and no red error at the end.

### 4. Start the game

```bash
npm run dev
```

Leave that window running. When it says the server is ready, open your browser and go to:

**[http://localhost:8080](http://localhost:8080)**

You should see the Pinnacle title screen. Click **New tower**.

### 5. Stop

Click the terminal window and press `Ctrl+C`.

To play again later, `cd pinnacle` (if you aren’t already there) and run `npm run dev`. You do **not** need `git clone` or `npm install` again unless you deleted the folder.

---

## Play

Start with a lobby on the ground floor, raise a shaft, and fill the tower.

- **Offices** pay rent when workers can reach them. A cafe keeps them from walking out at lunch.
- **Hotels** come in singles (⅓ of an office), doubles (⅔), and suites (full office width).
- **Three stars** need a boutique and a restaurant — both unlock at two stars.
- **Ballroom** (four stars) hosts galas, weddings, and recitals. Guests arrive in the evening; you get paid when the night is over. A restaurant on site sweetens the take.
- **Express elevators** (two stars) are faster, hold 16, and only stop every 5 floors.
- **Extra cars** share a shaft and pass through each other. Click a shaft and hit *Add car* (up to 8).
- Widen the lot from either end when floors get tight.
- Progress saves in the browser (`localStorage`). Clearing site data erases your tower.

**Controls:** click a tool once and stamp it as many times as you want. Right-click or Esc puts it down. Drag to pan, scroll or pinch to zoom, WASD or arrows to move. Space pauses. 1 / 2 / 3 set speed.

Starting funds: Tight ($24k), Standard ($40k), or Loaded ($80k). Pause also has a treasury inject if you want more runway.

---

## If something goes wrong

**`git` / `node` / `npm` is not recognized**  
The program isn’t installed, or this terminal was opened before you installed it. Install it, then close the terminal and open a new one.

**`node --version` is below v22**  
This project needs Node 22+. Install it from [nodejs.org](https://nodejs.org). If you use nvm: `nvm install 22` then `nvm use`.

**`npm install` fails**  
Make sure you are inside the `pinnacle` folder (`ls` / `dir` should show `package.json`). Then:

```bash
rm -rf node_modules
npm install
```

On Windows PowerShell, use `Remove-Item -Recurse -Force node_modules` instead of `rm -rf node_modules`.

**The browser can’t open localhost:8080**  
Did `npm run dev` stay running? If it printed that port 8080 is already in use, quit the other program using 8080 (or another copy of this game) and try `npm run dev` again.

**Blank page or a stack of errors**  
You skipped `npm install`, or Node is too old. Run `node --version`, then `npm install`, then `npm run dev`.

**I downloaded a newer version and it broke**  
From inside `pinnacle`:

```bash
git pull
npm install
npm run dev
```

---

## Other commands

These are optional. You do not need them just to play.

| Command | What it does |
| --- | --- |
| `npm run build` | Builds a production copy of the game |
| `npm run preview` | Serves that build at [http://localhost:8081](http://localhost:8081) |
| `npm run typecheck` | Checks the TypeScript, doesn’t start the game |

## Stack

React, TanStack Start, Vite, Tailwind, HTML5 canvas. No login. Saves stay in your browser.

## License

MIT. *SimTower* is a trademark of its respective owners; this is an independent game.
