# Lu Khach Ban Co

`Lu Khach Ban Co` is a fantasy multiplayer travel-planning board game prototype. Players sign in with Firebase Email/Password, draft travel cards, build a 5-day expedition itinerary, score the final board, and save finished trip history to Firestore.

Live site:

```text
https://BinElvan3126.github.io/lu-khach-ban-co/
```

## Current Stack

- Vite + TypeScript
- Firebase Authentication
- Cloud Firestore for player profiles, history, and leaderboard data
- Deno local multiplayer server
- Vite PWA plugin
- GitHub Pages deployment with `gh-pages`

## Project Layout

```text
D:\CodexWorkspace
├── index.html
├── src/
│   ├── app.ts
│   ├── client/multi.ts
│   ├── data/cards_bundle.json
│   ├── shared/cloud/firebase.ts
│   ├── shared/game/
│   └── styles/prototype.css
├── server/
├── ARCHITECTURE.md
├── FIREBASE_SETUP.md
├── package.json
└── vite.config.js
```

The old `Web/` wrapper folder has been removed. Run all commands from `D:\CodexWorkspace`.

## Run Locally

```powershell
cd D:\CodexWorkspace
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/lu-khach-ban-co/
```

The Vite base path is `/lu-khach-ban-co/` to match GitHub Pages.

## Firebase Setup

The app does not use guest accounts. Players must register and sign in with Firebase Email/Password.

Create a `.env` file from `.env.example`, add the Firebase web config, then restart the dev server.

See `FIREBASE_SETUP.md` for:

- Firebase Auth setup
- Firestore rules
- player profile documents
- saved match history
- leaderboard data

## Multiplayer Server

The local multiplayer server uses Deno.

```powershell
cd D:\CodexWorkspace
npm run server
```

For local multiplayer testing, run the server once and open the app in 2-4 browser tabs.

## Build And Deploy

Build the app:

```powershell
npm run build
```

Deploy to GitHub Pages:

```powershell
npm run deploy
```

GitHub Pages should be configured to publish from the `gh-pages` branch.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

