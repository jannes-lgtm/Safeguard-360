# SafeGuard360 — Setup Guide

## 1. Install dependencies

Open a terminal, navigate to this `safeguard360/` folder, then run:

```bash
npm install
```

## 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** — give it any name (e.g. `safeguard360`)
3. Wait ~2 minutes for the project to provision

## 3. Run the database setup

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Open the file `supabase_setup.sql` from this folder
3. Paste the entire contents into the SQL Editor and click **Run**
4. This creates all tables, RLS policies, the auth trigger, and seeds your demo data

## 4. Add your Supabase credentials

1. In Supabase, go to **Project Settings → API**
2. Copy your **Project URL** and **anon/public key**
3. In this folder, create a file called `.env` (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...your_key_here
```

## 5. Create your admin user

1. In Supabase, go to **Authentication → Users → Invite user**
2. Enter your email address and send the invite
3. After you receive the email and set your password, go to **Table Editor → profiles**
4. Find your row and change the `role` column from `traveller` to `admin`

## 6. Seed training progress for your user

1. In Supabase, go to **Authentication → Users** and copy your user's UUID
2. Open `supabase_setup.sql` and scroll to Section 5 (SEED TRAINING PROGRESS)
3. Uncomment those lines, replace `YOUR_USER_ID_HERE` with your UUID, and run just that block in the SQL Editor

## 7. Start the app locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 8. Deploy to Vercel

1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **New Project** → import your repository
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
5. Click **Deploy**

Your app will be live at `https://safeguard360.vercel.app` (or similar).

---

## Before your client demo — checklist

- [ ] App loads and shows the login page in an Incognito window
- [ ] You can log in and reach the Dashboard
- [ ] The 4 sample alerts appear on the Risk Alerts page
- [ ] The 4 policies appear on the Policy Library page
- [ ] Training modules appear on the ISO Training page
- [ ] The Staff Tracker is visible when logged in as admin
- [ ] You can add a trip on the Itinerary page and it saves to Supabase
- [ ] Your client's email has been added via Supabase → Authentication → Invite User

## Items to complete manually (per the spec)

- **Add your logo** — replace the `SG360` text placeholder in `Layout.jsx` and `Login.jsx` with your actual image
- **Upload real policy PDFs** — in Supabase Table Editor, update the `file_url` column in each policies row with the actual PDF link (Supabase Storage or Google Drive)
- **Add client user** — use Supabase → Authentication → Invite User to send your client a login link
- **Custom domain** (optional) — configure in Vercel → Domains

---

## Project structure

```
safeguard360/
├── src/
│   ├── components/
│   │   ├── Layout.jsx          ← Sidebar + navigation
│   │   ├── ProtectedRoute.jsx  ← Auth guard
│   │   ├── MetricCard.jsx      ← Stat card
│   │   ├── AlertCard.jsx       ← Alert display card
│   │   ├── SeverityBadge.jsx   ← Coloured severity badge
│   │   └── ProgressBar.jsx     ← Progress bar
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Itinerary.jsx
│   │   ├── Alerts.jsx
│   │   ├── Policies.jsx
│   │   ├── Training.jsx
│   │   └── Tracker.jsx         ← Admin only
│   ├── lib/
│   │   └── supabase.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── supabase_setup.sql           ← Run this in Supabase SQL Editor
├── .env.example                 ← Copy to .env and fill in your keys
├── package.json
├── vite.config.js
├── tailwind.config.js
└── SETUP.md                     ← You are here
```
