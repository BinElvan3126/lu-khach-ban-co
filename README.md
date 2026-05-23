# Lu Khach Ban Co

A fantasy multiplayer travel-planning board game where players draft destination cards, build tactical itineraries, manage resources, and turn the winning board into a real travel timeline.

Live demo: [BinElvan3126.github.io/lu-khach-ban-co](https://BinElvan3126.github.io/lu-khach-ban-co/)

## Overview

`Lu Khach Ban Co` combines a tactical board game with a travel planning simulator. Players sign in, join a multiplayer match, draft cards, place destinations onto a 5-day expedition board, resolve simulation events, and save completed trip history to the cloud.

Core flow:

```text
Login -> Hub -> Play -> Matching -> Game Board -> Simulation -> Result / Itinerary
```

## Features

- Firebase Email/Password authentication
- Cloud Firestore player profiles, leaderboard data, and match history
- Multiplayer matchmaking prototype
- Circular card-passing draft system
- 5-day itinerary board with morning, afternoon, and evening slots
- Xu, stamina, debt, and VP resource tracking
- Simulation and scoring phase
- Fantasy guild hall UI direction
- PWA build support
- GitHub Pages deployment

## Tech Stack

- Vite
- TypeScript
- Firebase
- Cloud Firestore
- Deno server for local multiplayer testing
- Vite PWA
- GitHub Pages

## Project Structure

```text
.
├── index.html
├── src/
│   ├── app.ts
│   ├── client/
│   ├── data/
│   ├── shared/
│   └── styles/
├── server/
├── ARCHITECTURE.md
├── FIREBASE_SETUP.md
├── package.json
└── vite.config.js
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the local multiplayer server:

```bash
npm run server
```

Open the local Vite URL shown in the terminal. For multiplayer testing, run the server once and open the app in multiple browser tabs.

## Firebase Setup

This project requires Firebase Email/Password authentication. Guest accounts are not used.

Create a `.env` file from `.env.example` and add your Firebase web app config.

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for Firestore rules and cloud data setup.

## Available Scripts

```bash
npm run dev
npm run server
npm run typecheck
npm run lint
npm run build
npm run deploy
```

## Deploy

The app is configured for GitHub Pages with the base path:

```text
/lu-khach-ban-co/
```

Deploy with:

```bash
npm run deploy
```

GitHub Pages should publish from the `gh-pages` branch.

## Render Server Deployment

The multiplayer server can be deployed as a Render Web Service using Docker.

Recommended Render settings:

```text
Language: Docker
Branch: main
Root Directory: leave blank
Dockerfile Path: ./Dockerfile
Instance Type: Free
```

After deploy, test the health endpoint:

```text
https://your-render-service.onrender.com/health
```

The multiplayer WebSocket endpoint will be:

```text
wss://your-render-service.onrender.com/ws
```
