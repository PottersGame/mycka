# DishwasherDuty 🍽️

Family dishwasher chore tracker. When the Bosch dishwasher finishes, the next kid in rotation gets notified. If they ignore it, their phone gets locked.

## How it works

1. The **backend** listens to the Bosch Home Connect API via a live event stream.
2. When the dishwasher program finishes, it assigns the next kid in rotation and sends a push notification.
3. If the kid ignores it, escalating reminders fire every 30 minutes.
4. After 2 hours → the whole family gets a "shame" notification.
5. After 3 hours → the kid's **phone screen gets locked** via Android Device Admin.
6. The kid opens the app, presses **"I'M DONE"**, and the lock is released.

---

## Setup — Step by step

### 1. Bosch Home Connect developer account

1. Go to https://developer.home-connect.com/ and create a free account.
2. Create a new application with:
   - **OAuth flow**: Authorization Code
   - **Redirect URI**: `https://YOUR-APP.railway.app/auth/callback`  
     (fill in the Railway URL after deploying — you can update it later)
3. Note your **Client ID** and **Client Secret**.
4. Make sure your dishwasher is linked in the Home Connect phone app and note its **Appliance ID** (haId) — found under Appliances → your dishwasher → Settings.

### 2. Deploy the backend to Railway (free)

1. Create a free account at https://railway.app
2. Click **New Project** → **Deploy from GitHub repo** → select this repo → choose the `backend/` folder.
3. Set these environment variables in Railway (from your `.env.example`):

```
HOMECONNECT_CLIENT_ID=...
HOMECONNECT_CLIENT_SECRET=...
HOMECONNECT_REDIRECT_URI=https://YOUR-APP.railway.app/auth/callback
HOMECONNECT_DISHWASHER_HAIM=BOSCH-XXXXXXXXXXXXXXXXXX
FAMILY_KIDS=Emma,Liam,Sophia,Noah
PARENT_NAME=Mom
PARENT_SECRET=pick_any_long_random_string_here
```

4. Deploy. Note the Railway URL (e.g. `https://dishwasher-duty.railway.app`).
5. Update the **Redirect URI** in the Home Connect developer portal to match.

### 3. Link your Home Connect account

Visit `https://YOUR-APP.railway.app/auth/start` in a browser and log in with your Home Connect credentials. The server will start listening for your dishwasher events.

### 4. Build and install the Android app on each kid's phone

**Prerequisites:** Node.js 18+, Expo CLI, EAS CLI

```bash
cd mobile
npm install
npm install -g eas-cli
eas login          # create a free Expo account at expo.dev
eas build --platform android --profile preview
```

EAS will give you a QR code / download link for the APK. Install it on each kid's phone.

### 5. Configure the app on each phone

Open the app → **Settings** tab:
- **Your name**: must exactly match one of the `FAMILY_KIDS` names (e.g. `Emma`)
- **Server URL**: `https://YOUR-APP.railway.app`
- **Activate Phone Lock**: tap this and tap "Activate" on the system dialog (do this on every kid's phone)

### 6. Test it

From the **Settings** tab on your phone (parent):
- Enable parent mode and enter the `PARENT_SECRET` value.
- Tap **"Trigger new cycle"** — the next kid in rotation will receive a notification immediately.

---

## Escalation timeline

| Time after dishwasher finishes | What happens |
|---|---|
| 0 min | Kid gets initial notification |
| 30 min | First reminder (louder) |
| 60 min | Second reminder |
| 90 min | Third reminder + parent is notified |
| 120 min | **All family members** get a "shame" notification |
| 175 min | Kid gets a "5-minute warning" before lock |
| 180 min | **Phone screen is locked** via Device Admin |

All times configurable via `ESCALATION_*` env vars.

---

## Rotation order

Kids rotate in the order you put them in `FAMILY_KIDS`. After the last kid, it cycles back to the first. The rotation is persisted in the SQLite database so server restarts don't reset it.

## Parent controls (app Settings tab)

| Action | What it does |
|---|---|
| Trigger cycle | Same as dishwasher finishing — assigns next kid |
| Skip kid | Skips current kid, assigns to next one |
| Reset cycle | Clears active cycle (use if stuck) |

---

## Project structure

```
dishwasher-duty/
├── backend/              Node.js server (deploy to Railway)
│   ├── src/
│   │   ├── index.js      Entry point, server boot
│   │   ├── db.js         SQLite schema & helpers
│   │   ├── homeconnect.js  Bosch Home Connect OAuth + SSE
│   │   ├── rotation.js   Round-robin rotation logic
│   │   ├── notifications.js  Expo push notification sender
│   │   ├── escalation.js   Escalation cron job
│   │   └── routes/
│   │       ├── auth.js   /auth/* — OAuth flow
│   │       └── api.js    /api/* — REST endpoints
│   └── .env.example      Copy to .env and fill in
│
└── mobile/               React Native (Expo) Android app
    ├── src/
    │   ├── App.js         Root component, notification wiring
    │   ├── screens/
    │   │   ├── HomeScreen.js      Current assignee + "Mark done"
    │   │   ├── LockScreen.js      Full-screen blocking overlay
    │   │   ├── HistoryScreen.js   Past cycle history
    │   │   └── SettingsScreen.js  Name, URL, parent controls
    │   └── services/
    │       ├── api.js             Backend HTTP client
    │       ├── notifications.js   Expo push setup
    │       └── deviceAdmin.js     Native screen-lock bridge
    └── android/
        └── app/src/main/java/com/dishwasher/
            ├── DeviceAdminReceiver.java   Android Device Admin entry point
            ├── DeviceAdminModule.java     React Native native module
            └── DeviceAdminPackage.java    Package registration
```
