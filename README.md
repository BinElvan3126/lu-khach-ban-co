# Lu Khach Ban Co

A fantasy multiplayer travel-planning board game prototype. Players sign in with Firebase Email/Password, draft travel cards, plan a 5-day itinerary board, score the trip, and save finished expedition history to Firestore.

## Current Project Layout

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
└── package.json
```

The old `Web/` wrapper folder has been removed from the project structure. Run commands from `D:\CodexWorkspace`.

## Run Frontend

```powershell
cd D:\CodexWorkspace
npm install
npm run dev
```

Open the Vite URL, usually `http://127.0.0.1:5173/peview-web/`.

## Firebase Login

The app requires Firebase Email/Password auth. Add Firebase keys to `.env` using the variables in `.env.example`, then restart the dev server.

See `FIREBASE_SETUP.md` for Auth, Firestore, and security rules.

## Multiplayer Server

The local multiplayer server uses Deno.

```powershell
npm run server
```

If `deno` is not recognized, install Deno first or test only the frontend UI flow.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```
