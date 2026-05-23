# Firebase setup

This project requires Firebase keys for player login. Gameplay is locked until a player signs in with Email/Password.

## 1. Create Firebase project

1. Go to the Firebase Console.
2. Create a Web app.
3. Enable Authentication.
4. Enable Email/Password sign-in.
5. Create a Cloud Firestore database.

## 2. Add local environment

Copy `.env.example` to `.env` and fill in the values from Firebase project settings.

```powershell
cd D:\CodexWorkspace
cp .env.example .env
```

Vite exposes only variables that start with `VITE_`.
Restart `npm run dev` after changing `.env`; Vite reads environment variables when the dev server starts.

## 3. Firestore collections

The prototype expects these paths:

```text
players/{playerId}
players/{playerId}/history/{historyId}
leaderboard/{leaderboardId}
```

Suggested document shapes:

```json
{
  "playerId": "firebase-auth-uid",
  "name": "Traveler ABCD",
  "email": "traveler@email.com",
  "mode": "password",
  "authUid": "firebase-auth-uid"
}
```

```json
{
  "date": "2026-05-23",
  "destination": "Traveler's winning expedition",
  "finalVp": 126,
  "itinerary": "Coffee -> Museum -> Night food",
  "timeline": [
    {
      "day": 1,
      "slot": "morning",
      "title": "Banh Trang Nuong Ho Con Rua",
      "note": "Good early Food bridge for same-day combos.",
      "estimatedCost": 50000
    }
  ],
  "winnerName": "Traveler ABCD",
  "resultLabel": "Winner"
}
```

```json
{
  "name": "Traveler ABCD",
  "totalWins": 2,
  "highestVp": 126,
  "recent": "Won Saigon route"
}
```

## 4. Prototype security rules

Use stricter rules before production. For early testing, this keeps leaderboard readable and only allows signed-in users to manage their own player document/history.

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /leaderboard/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /players/{playerId} {
      allow read, write: if request.auth != null && request.auth.uid == playerId;

      match /history/{historyId} {
        allow read, write: if request.auth != null && request.auth.uid == playerId;
      }
    }
  }
}
```

The app uses Firebase `auth.uid` as the game `playerId`, so each account owns only its own profile and history.
