# Anonymous Submissions

A tiny website where anyone can submit a problem anonymously. A separate,
password-protected admin panel lets you (the developer) review submissions.

- **No accounts.** No login for submitters, no email, no IP storage.
- **Each submission stores only:** problem text, selected region, timestamp.
- **Admin panel** at `/admin.html` is protected by a password you set in `.env`.
- **Storage** is a single JSON file at `data/submissions.json` (easy to back up
  or move to SQLite later — see *Extending* below).

## Project structure

```
anonymous-submissions/
├── server.js              # Express backend (API + static file server)
├── package.json
├── .env.example           # Copy to .env and edit
├── .gitignore
├── data/
│   └── submissions.json   # Auto-created on first run
└── public/
    ├── index.html         # Public submission form
    ├── admin.html         # Password-protected admin view
    ├── css/style.css
    └── js/
        ├── main.js        # Form logic
        └── admin.js       # Admin login + list + delete logic
```

## Run it locally (Windows PowerShell)

1. **Install Node.js 18+** from <https://nodejs.org/>.

2. Open PowerShell in this folder and install dependencies:
   ```powershell
   npm install
   ```

3. Copy the example env file and edit it:
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```
   At minimum set:
   - `ADMIN_PASSWORD` — the password you'll use to open the admin panel.
   - `JWT_SECRET` — any long random string (used to sign admin JWT cookies).
     Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. Start the server:
   ```powershell
   npm start
   ```

5. Open the pages in your browser:
   - Public form: <http://localhost:3000/>
   - Admin panel: <http://localhost:3000/admin.html>

Stop the server with `Ctrl+C`.

## Run it locally (macOS / Linux)

Same as above, but step 3 is:

```bash
cp .env.example .env
$EDITOR .env
```

## How it works

### Public flow
1. The user types a problem, picks a region, ticks the consent box, and clicks
   *Submit anonymously*.
2. `main.js` does basic validation, then `POST`s JSON to `/api/submit`.
3. `server.js` re-validates everything, builds an anonymous record, and
   appends it to `data/submissions.json`.
4. The browser hides the form and shows a "Thank you" message.

### Admin flow
1. You open `/admin.html` and enter the password.
2. `POST /api/admin/login` checks the password (bcrypt) and returns a
   **signed JWT in an httpOnly cookie** (`admin_token`). The cookie is the
   proof of admin status — the server keeps no session state.
3. The page calls `GET /api/admin/submissions`; the server verifies the
   JWT signature and returns the list. You can filter, refresh, or delete.
4. *Log out* clears the cookie.

Because auth is stateless, **the server can restart without logging you out**
— as long as `JWT_SECRET` stays the same.

### Security & privacy
- Helmet adds standard security headers.
- `express-rate-limit` throttles both submissions (5/min/IP) and admin login
  attempts (10 per 15 min/IP). The limiter uses IP only for rate-limiting —
  IPs are never written to disk.
- The admin password is **never stored on disk**; only its bcrypt hash is held
  in memory at runtime.
- JWT cookies are `httpOnly`, `sameSite=lax`, and `Secure` on HTTPS.
- All admin output is HTML-escaped client-side to prevent XSS from any text a
  submitter pastes.

## Deploying to Render (or any reverse-proxy host)

Render terminates HTTPS at its load balancer and forwards plain HTTP to your
app. The code already handles this — `app.set('trust proxy', 1)` is in
`server.js` so `req.secure` correctly reflects HTTPS for cookie flags and
rate limiting.

**Steps:**

1. Push this folder to a GitHub repo and create a **New → Web Service** on
   Render, pointing at that repo.
2. Build command: `npm install` &nbsp; · &nbsp; Start command: `npm start`
3. In the Render dashboard, open **Environment** and add:

   | Key              | Value                                                              |
   | ---------------- | ------------------------------------------------------------------ |
   | `ADMIN_PASSWORD` | a strong password you'll remember                                  |
   | `JWT_SECRET`     | a long random string (≥ 32 chars)                                  |
   | `COOKIE_SECURE`  | `true`                                                             |
   | `NODE_ENV`       | `production`                                                       |

   `PORT` is provided by Render automatically — don't set it.

4. **Manual Deploy → Deploy latest commit**.

After it boots, the public form is at `https://<your-service>.onrender.com/`
and the admin panel at `https://<your-service>.onrender.com/admin.html`.

**Two Render free-tier caveats to know:**

- **The container sleeps after ~15 min of inactivity.** First request after a
  nap takes 30–60 s to wake up. Your admin login still works after wake —
  the JWT cookie keeps you signed in across restarts.
- **The filesystem is ephemeral on the free tier.** `data/submissions.json`
  is wiped on every restart/redeploy. For real production, attach a Render
  Persistent Disk to `/opt/render/project/src/data` (paid), or swap the JSON
  store for a database (see *Extending*).

## Extending

- **Switch to SQLite.** Replace `readSubmissions()` / `writeSubmissions()` in
  `server.js` with `better-sqlite3` calls — the rest of the code does not
  need to change.
- **Add categories or tags.** Add an `<option>` to the `<select>` in
  `index.html` *and* a string to `ALLOWED_REGIONS` in `server.js`. Both lists
  must match.
- **Export submissions.** Add a `GET /api/admin/export.csv` endpoint that
  serializes `readSubmissions()` to CSV.
- **Multiple admins.** Replace the single `ADMIN_PASSWORD` with a users table
  and use `bcrypt.compareSync` against each row.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser says "Cannot reach site" | Server isn't running, or wrong port. |
| Login always says "Incorrect password" | Server is still using the old `ADMIN_PASSWORD`. Restart the server after editing `.env`. On Render, change the env var in the dashboard and trigger a redeploy. |
| Log in succeeds, then immediately kicked back to login | The auth cookie wasn't sent on the next request. On localhost: do **not** set `COOKIE_SECURE=true`. On HTTPS deployments: **do** set `COOKIE_SECURE=true`. Also make sure you're hitting the admin page via the same origin that serves the API (same hostname + port + scheme). |
| "Logged out" after every server restart | `JWT_SECRET` isn't set, so the server generated a random one on boot. Set it explicitly in your env. |
| `data/submissions.json` is missing | It's auto-created when the server starts. On Render free tier the file is wiped on every restart — use a Persistent Disk or a database. |
