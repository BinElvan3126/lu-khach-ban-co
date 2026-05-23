# Lu Khach Ban Co Architecture

This prototype uses `ondras/rri` only as a technical reference pattern: small TypeScript modules, a PWA shell, separated client/server code, shared game logic, WebSocket multiplayer, and score visualization. It does not copy Railroad Ink gameplay.

## Frontend

- `index.html` loads the application shell from `src/app.ts`.
- `src/app.ts` renders the Firebase Email/Password auth flow, guild hub, matchmaking screen, 5-day x 3-slot board, 5-card draft hand, resource HUD, score preview, history archive, and itinerary output.
- `src/client/multi.ts` contains the WebSocket JSON-RPC 2.0 client used internally by the multiplayer flow. Technical labels are hidden from the player UI.
- `src/shared/cloud/firebase.ts` manages Firebase Auth, player profiles, match history, and leaderboard records.
- `src/styles/prototype.css` contains the fantasy guild hall and tactical travel board UI.
- `vite.config.js` keeps the installable PWA and static asset caching strategy.

## Shared Logic

- `src/shared/game/types.ts` defines cards, board cells, resources, players, room snapshots, and itinerary entries.
- `src/shared/game/board.ts` validates 5-day grid placement and geographic distance penalties.
- `src/shared/game/rules.ts` validates card usage and applies resource/on-play effects.
- `src/shared/game/score.ts` calculates base VP, combo VP, penalties, resource VP, and converts a board into a travel timeline.
- `src/shared/game/dice.ts` provides deterministic daily card dealing and random-event simulation hooks.

## Backend

- `server/server.ts` is the Deno HTTP entry point and WebSocket upgrade endpoint.
- `server/player.ts` dispatches JSON-RPC messages such as `room.create`, `room.join`, `room.start`, `player.placeCard`, and `player.skipSlot`.
- `server/game.ts` owns room FSM state, up to 4 players, draft-pick-pass flow, server-side validation, snapshots, score finalization, and winner itinerary conversion.

## Data

- `src/data/cards_bundle.json` is the travel-card bundle with `card_id`, `name`, `tags`, `cost`, `victory_point`, `on_play_effect`, and `coordinates`.
- Firestore stores `players/{playerId}`, `players/{playerId}/history/{historyId}`, and `leaderboard/{leaderboardId}`. The app uses Firebase `auth.uid` as `playerId`.

## Runtime

- Run commands from `D:\CodexWorkspace`. The previous `Web/` wrapper folder is no longer part of the project layout.
- Frontend: `npm run dev`
- Production build: `npm run build`
- Multiplayer server: `npm run server` after installing Deno.
