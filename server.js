/**
 * server.js
 * ---------
 * Express backend for the anonymous submissions site.
 *
 * Admin auth uses a SIGNED JWT stored in an httpOnly cookie.
 * No server-side session store - the cookie itself is the proof of admin.
 * This is what fixes the "log in, instantly bounced out" problem on
 * Render / Railway / Fly / any platform that:
 *   - terminates HTTPS at a reverse proxy, and/or
 *   - has an ephemeral filesystem and restarts your process at will.
 *
 * Endpoints:
 *   GET    /                          public form (static)
 *   GET    /admin.html                admin panel (static; JS handles auth)
 *   POST   /api/submit                save an anonymous submission
 *   POST   /api/admin/login           exchange password for an admin cookie
 *   POST   /api/admin/logout          clear the admin cookie
 *   GET    /api/admin/me              am I logged in?
 *   GET    /api/admin/submissions     [auth] list all submissions
 *   DELETE /api/admin/submissions/:id [auth] delete one submission
 */

require('dotenv').config();

const express   = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const helmet    = require('helmet');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Render / Heroku / Railway / Fly all sit behind a TLS-terminating proxy.
// Telling Express to trust one proxy hop lets it correctly read
// X-Forwarded-Proto (so req.secure is true on HTTPS) and X-Forwarded-For
// (so express-rate-limit uses the real client IP, not the proxy's).
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// 1. Storage: data/submissions.json (atomic writes via temp file + rename)
// ---------------------------------------------------------------------------
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readSubmissions() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error('Could not read submissions file:', err.message);
    return [];
  }
}

function writeSubmissions(arr) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------------------------------------------------------------------
// 2. Admin password + JWT signing secret
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const ADMIN_HASH     = bcrypt.hashSync(ADMIN_PASSWORD, 10);

if (ADMIN_PASSWORD === 'changeme') {
  console.warn(
    '[WARN] Using the default admin password "changeme". ' +
    'Set ADMIN_PASSWORD before going live.'
  );
}

// The signing key for admin JWTs. Accepts the legacy SESSION_SECRET name too.
// If neither is set, a random one is generated - which means EVERY restart
// invalidates all admin cookies. Set this in production!
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_SECRET && !process.env.SESSION_SECRET) {
  console.warn(
    '[WARN] JWT_SECRET not set; using a random one. ' +
    'All admins will be logged out whenever the server restarts. ' +
    'Set JWT_SECRET in your environment (e.g. Render dashboard).'
  );
}

const COOKIE_NAME       = 'admin_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 4; // 4 hours

function signAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

// Tiny no-dependency cookie reader: pulls one named value out of the
// `Cookie:` header.
function readAdminToken(req) {
  const header = req.headers.cookie || '';
  const prefix = COOKIE_NAME + '=';
  const parts  = header.split(/;\s*/);
  for (const piece of parts) {
    if (piece.startsWith(prefix)) {
      return decodeURIComponent(piece.slice(prefix.length));
    }
  }
  return null;
}

function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return !!(payload && payload.role === 'admin');
  } catch (e) {
    return false;
  }
}

// Decide whether to mark the auth cookie as Secure.
//   COOKIE_SECURE=true   -> always Secure  (use on HTTPS deployments)
//   COOKIE_SECURE=false  -> never Secure   (use only for local HTTP dev)
//   unset                -> auto: Secure when the request is HTTPS
// Auto-detect works once `trust proxy` is configured (above).
function shouldUseSecureCookie(req) {
  const env = process.env.COOKIE_SECURE;
  if (env === 'true')  return true;
  if (env === 'false') return false;
  return !!req.secure;
}

// ---------------------------------------------------------------------------
// 3. Allowed locations - single source of truth shared with the browser.
//    Shape: { Area: [City, City, ...] }   (Region level was removed.)
//    Editing public/locations.json updates BOTH the frontend dropdowns and
//    this server-side validation; no code changes needed.
// ---------------------------------------------------------------------------
const LOCATIONS_FILE = path.join(__dirname, 'public', 'locations.json');
let LOCATIONS = {};
try {
  LOCATIONS = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
} catch (err) {
  console.error('Failed to load locations.json:', err.message);
  process.exit(1);
}

function isValidLocation(area, city) {
  if (typeof area !== 'string' || typeof city !== 'string') return false;
  const cities = LOCATIONS[area];
  if (!Array.isArray(cities)) return false;
  return cities.indexOf(city) !== -1;
}

// ---------------------------------------------------------------------------
// 4. Middleware
// ---------------------------------------------------------------------------
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please slow down.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

function requireAdmin(req, res, next) {
  if (verifyAdminToken(readAdminToken(req))) return next();
  return res.status(401).json({ error: 'Not authorized.' });
}

// Diagnostic logger for admin routes - safe to keep on; logs no PII.
app.use('/api/admin', (req, res, next) => {
  const token = readAdminToken(req);
  console.log(
    `[admin] ${req.method} ${req.path}  ` +
    `cookie=${token ? 'yes' : 'no'}  ` +
    `valid=${verifyAdminToken(token)}  ` +
    `secure=${req.secure}`
  );
  next();
});

// ---------------------------------------------------------------------------
// 5. Static frontend (served from /public)
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// 6. PUBLIC: submission endpoint
// ---------------------------------------------------------------------------
app.post('/api/submit', submitLimiter, (req, res) => {
  // NOTE: `region` is no longer accepted - submissions now carry area + city.
  const { problem, area, city, consent } = req.body || {};

  if (typeof problem !== 'string' || !problem.trim()) {
    return res.status(400).json({ error: 'Please describe your problem.' });
  }
  if (problem.length > 5000) {
    return res.status(400).json({ error: 'Problem text is too long (5000 chars max).' });
  }
  if (!area) return res.status(400).json({ error: 'Please select an area.' });
  if (!city) return res.status(400).json({ error: 'Please select a city.' });
  if (!isValidLocation(area, city)) {
    return res.status(400).json({
      error: 'Selected area and city do not match.'
    });
  }
  if (consent !== true && consent !== 'true' && consent !== 'on') {
    return res.status(400).json({ error: 'You must agree to the guidelines.' });
  }

  const entry = {
    id: crypto.randomUUID(),
    problem: problem.trim(),
    area,
    city,
    timestamp: new Date().toISOString(),
  };

  const all = readSubmissions();
  all.push(entry);
  writeSubmissions(all);

  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 7. ADMIN: auth + data endpoints
// ---------------------------------------------------------------------------
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Password required.' });
  }
  if (!bcrypt.compareSync(password, ADMIN_HASH)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const token  = signAdminToken();
  const secure = shouldUseSecureCookie(req);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secure,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });

  console.log(`[admin] login OK  secure=${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  // Match the attributes used to set the cookie so the browser actually
  // clears it (otherwise it stays around with the old value).
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    path: '/',
  });
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ isAdmin: verifyAdminToken(readAdminToken(req)) });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const all = readSubmissions().slice().reverse(); // newest first
  res.json({ submissions: all, count: all.length });
});

app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const id   = req.params.id;
  const all  = readSubmissions();
  const kept = all.filter(s => s.id !== id);
  if (kept.length === all.length) {
    return res.status(404).json({ error: 'Submission not found.' });
  }
  writeSubmissions(kept);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 8. Start the server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log('--------------------------------------------------------');
  console.log(` Anonymous submissions server listening on :${PORT}`);
  console.log(` Public form : http://localhost:${PORT}/`);
  console.log(` Admin panel : http://localhost:${PORT}/admin.html`);
  console.log('--------------------------------------------------------');
});
