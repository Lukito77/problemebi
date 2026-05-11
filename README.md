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
   - `SESSION_SECRET` — any long random string (used to sign session cookies).

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
2. `POST /api/admin/login` checks the password (bcrypt hash compare) and
   sets a signed, `httpOnly`, `sameSite=lax` session cookie.
3. The page calls `GET /api/admin/submissions` (which requires the session)
   and renders the list. You can filter, refresh, or delete entries.
4. *Log out* destroys the session.

### Security & privacy
- Helmet adds standard security headers.
- `express-rate-limit` throttles both submissions (5/min/IP) and admin login
  attempts (10 per 15 min/IP). The limiter uses IP only for rate-limiting —
  IPs are never written to disk.
- The admin password is **never stored on disk**; only its bcrypt hash is held
  in memory at runtime.
- Session cookies are `httpOnly` and (in production) `secure`.
- All admin output is HTML-escaped client-side to prevent XSS from any text a
  submitter pastes.

## Going to production

- Set `NODE_ENV=production` in `.env`. This enables `Secure` cookies, so you
  **must** terminate HTTPS in front of Node (a reverse proxy like Caddy,
  Nginx, or a platform like Render/Railway/Fly).
- Pick a long random `SESSION_SECRET` and a strong `ADMIN_PASSWORD`.
- Keep your `data/submissions.json` backed up — that's your only data store.
- Consider running the process under `pm2`, `systemd`, or a platform's
  process manager so it restarts on crash.

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
| Login always says "Incorrect password" | Server is still using the old `ADMIN_PASSWORD`. Restart `npm start` after editing `.env`. |
| Admin panel boots straight to login after refresh in production | `Secure` cookie is set but you're on plain `http://`. Either disable HTTPS-only by setting `NODE_ENV=development`, or serve the site over HTTPS. |
| `data/submissions.json` is missing | It's auto-created on first successful submission, or when the server starts. |
