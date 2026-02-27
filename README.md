# Attendance Register — Cloud Edition
### Faculty of Management Sciences, Polokwane
### Powered by Supabase + Netlify

Data is stored in the cloud. **Any lecturer, on any device, anywhere, logs in and sees their data.**

---

## ✅ COMPLETE SETUP GUIDE (one-time, ~20 minutes)

---

### STEP 1 — Create a Free Supabase Account

1. Go to **https://supabase.com**
2. Click **"Start your project"** → Sign up with GitHub or email
3. Once logged in, click **"New Project"**
4. Fill in:
   - **Name:** `attendance-register`
   - **Database Password:** Choose a strong password (save it somewhere safe)
   - **Region:** Choose the closest to South Africa — `ap-southeast-1` (Singapore) is closest available
5. Click **"Create new project"**
6. Wait about 2 minutes for the project to spin up

---

### STEP 2 — Set Up the Database

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-schema.sql` (in this project folder) and **copy the entire contents**
4. Paste it into the SQL editor
5. Click the green **"Run"** button
6. You should see: `Success. No rows returned`
7. Your database tables are now ready ✅

---

### STEP 3 — Get Your API Keys

1. In Supabase, click **"Project Settings"** (gear icon, bottom of left sidebar)
2. Click **"API"**
3. Copy these two values — you'll need them in the next step:
   - **Project URL** — looks like: `https://abcdefghijkl.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

---

### STEP 4 — Deploy to Netlify

#### Option A: Drag & Drop (Easiest)
1. Install Node.js from https://nodejs.org if you don't have it
2. Open a terminal/command prompt in this folder
3. Run:
   ```
   npm install
   npm run build
   ```
4. Go to **https://app.netlify.com**
5. Drag the `build` folder onto the Netlify dashboard
6. Your site will be live at a URL like `https://random-name-123.netlify.app`

#### Option B: GitHub + Netlify (Recommended for easy updates)
1. Push this project to a GitHub repository
2. Go to https://app.netlify.com → **"Add new site"** → **"Import an existing project"**
3. Connect GitHub and select your repo
4. Build settings:
   - Build command: `npm run build`
   - Publish directory: `build`
5. Click **"Deploy site"**

---

### STEP 5 — Add Your Supabase Keys to Netlify

**This is the critical step that connects your app to the database.**

1. In Netlify, go to your site → **Site Settings** → **Environment variables**
2. Click **"Add a variable"** and add each of these:

   | Key | Value |
   |-----|-------|
   | `REACT_APP_SUPABASE_URL` | Your Supabase Project URL from Step 3 |
   | `REACT_APP_SUPABASE_ANON_KEY` | Your Supabase anon public key from Step 3 |

3. After adding both, go to **Deploys** → click **"Trigger deploy"** → **"Deploy site"**
4. Wait for the build to finish (~2 minutes)

---

### STEP 6 — First Login & Admin Setup

1. Open your Netlify URL
2. You'll see the **"Set Up Admin Account"** screen — this only appears once
3. Create your real admin username and password
4. You're in! ✅

---

## 🔑 HOW LECTURER LOGIN WORKS

- The admin registers lecturers and 5 passwords are auto-generated
- Lecturers log in with their **email + any one of their 5 passwords**
- This works from **any computer, any browser, anywhere**
- If a lecturer loses their passwords, the admin can view or regenerate them

---

## 📱 HOW STUDENT CHECK-IN WORKS

1. Lecturer starts a session → a QR code appears with a URL
2. Students open that URL on their phone (scan QR or type the URL)
3. They enter their student number
4. Attendance is recorded instantly in the cloud
5. Arrivals **after 10 minutes** are marked **LATE**

---

## 🔄 REAL-TIME UPDATES

When a session is live, the lecturer's screen updates **automatically in real-time** as students scan in — even if the lecturer is viewing from a different device than the one that started the session.

---

## 📁 EXCEL UPLOAD FORMAT

| Column A | Column B |
|----------|----------|
| Student Number | Surname and Initials |
| 20210001 | Khumalo T.S. |
| 20210002 | Sithole L.R. |

---

## 🛠 LOCAL DEVELOPMENT

```bash
# 1. Copy .env.example to .env
cp .env.example .env

# 2. Add your Supabase credentials to .env

# 3. Install and run
npm install
npm start
```

---

## ❓ TROUBLESHOOTING

**"Cannot connect to database" error:**
- Check that both environment variables are added in Netlify
- Make sure you redeployed after adding them
- Check the Supabase project is not paused (free tier pauses after 1 week of inactivity)

**Supabase free tier note:**
- Projects pause after **7 days of no activity**
- Go to https://supabase.com → your project → click **"Restore project"**
- Or upgrade to Pro ($25/month) to prevent pausing

**Lecturer can't log in:**
- Make sure admin has registered them and they have the correct email
- Admin can view their passwords in the Lecturers tab

---

## 📞 NEED HELP?

If you get stuck on any step, the most common issues are:
1. Missing environment variables in Netlify → recheck Step 5
2. Supabase schema not run → redo Step 2
3. Project paused → log into Supabase and restore it
