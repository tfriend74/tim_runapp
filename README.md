# Tim's Run Dashboard — PWA

A personal running dashboard that syncs automatically from Apple Health
via the **Health Auto Export** iOS app. Tap **Update** in the app and
it pulls your latest runs, heart rate, and stats live.

---

## 🏗 Architecture

```
iPhone (Health Auto Export app)
        │  POST JSON every X hours
        ▼
Vercel Serverless Function  (/api/health-webhook)
        │  saves to
        ▼
Vercel KV  (key-value store, free tier)
        │  fetched by
        ▼
PWA Update button  (/api/dashboard-data)
        │
        ▼
Dashboard re-renders with live data ✓
```

---

## 🚀 Deploy to Vercel (one-time setup ~15 min)

### Step 1 — Push to GitHub
```bash
cd rundash
git init
git add .
git commit -m "Initial run dashboard"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/run-dashboard.git
git push -u origin main
```

### Step 2 — Deploy on Vercel
1. Go to **vercel.com** → sign in with GitHub
2. Click **Add New → Project** → select `run-dashboard`
3. Leave all defaults → click **Deploy**
4. You get a URL like `https://run-dashboard-abc.vercel.app`

### Step 3 — Add Vercel KV (free storage)
1. In your Vercel project dashboard → **Storage** tab
2. Click **Create Database** → choose **KV**
3. Name it `run-dashboard-kv` → click **Create**
4. Click **Connect to Project** → select your project
5. Vercel auto-adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars ✓

### Step 4 — Set your webhook secret
1. In Vercel project → **Settings → Environment Variables**
2. Add: `WEBHOOK_SECRET` = any random string you make up
   (example: `tim-run-secret-abc123`)
3. Click **Save** → then **Redeploy** the project

---

## 📱 Set up Health Auto Export (iPhone)

1. Buy and install **Health Auto Export** ($3.99) from the App Store
2. Open the app → tap **Automations** → **Add Automation**
3. Configure:
   - **Export format:** JSON
   - **Trigger:** Every 1 hour (or on demand)
   - **Destination:** Webhook / REST API
   - **URL:** `https://your-app.vercel.app/api/health-webhook`
   - **Method:** POST
   - **Headers:** Add header → `x-webhook-secret` = `tim-run-secret-abc123`
4. Under **Metrics**, select at minimum:
   - Workouts
   - Heart Rate
   - Resting Heart Rate
   - Walking + Running Distance
5. Tap **Save** → tap **Export Now** to do a first sync

### Verify it worked
Open: `https://your-app.vercel.app/api/dashboard-data`
You should see JSON with your run data. Then tap **Update** in the PWA.

---

## 📱 Install on iPhone

1. Open your Vercel URL in **Safari**
2. Tap the **Share** button → **Add to Home Screen** → **Add**

Full-screen app, own icon, no browser chrome.
Tap **Update** anytime to pull the latest data from Health Auto Export.

---

## 🔄 How updates work

- Health Auto Export runs in the background and POSTs your HealthKit
  data to your Vercel webhook on a schedule (hourly recommended)
- When you tap **Update** in the PWA, it calls `/api/dashboard-data`
  which returns what was last saved by the webhook
- Dashboard re-renders with your real live data
- A green **● LIVE** indicator appears in the header

---

## 🗂 Project Structure

```
rundash/
├── api/
│   ├── health-webhook.js    ← Receives Health Auto Export POST
│   └── dashboard-data.js    ← GET endpoint for the Update button
├── public/
│   ├── favicon.svg
│   └── icons/               ← Add icon-192.png and icon-512.png here
├── src/
│   ├── data.js              ← Static fallback (shown before first sync)
│   ├── App.jsx              ← Dashboard UI + live fetch logic
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
└── package.json
```

---

## 📦 Local Development

```bash
npm install
npm run dev      # http://localhost:5173  (uses static fallback data)
npm run build
npm run preview
```

Note: The live Update button only works when deployed to Vercel —
it needs the serverless API routes and KV store.

---

## 📌 App Icons

Add two PNGs to `public/icons/`:
- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

Free generator: **realfavicongenerator.net**
