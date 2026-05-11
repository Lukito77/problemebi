/**
 * server.js
 * ---------
 * Express backend for the anonymous submissions site.
 *
 * Endpoints:
 *   GET   /                            -> public submission form (static)
 *   GET   /admin.html                  -> admin panel (static; JS handles auth)
 *   POST  /api/submit                  -> public: save an anonymous submission
 *   POST  /api/admin/login             -> exchange password for a session cookie
 *   POST  /api/admin/logout            -> destroy the admin session
 *   GET   /api/admin/me                -> is the current visitor logged in?
 *   GET   /api/admin/submissions       -> protected: list all submissions
 *   DELETE /api/admin/submissions/:id  -> protected: delete one submission
 *
 * Storage: a single JSON file at ./data/submissions.json. Each record is
 * fully anonymous - we never store IP addresses, user-agents, or anything
 * that could identify the submitter.
 */

require('dotenv').config();

const express     = require('express');
const session     = require('express-session');
const rateLimit   = require('express-rate-limit');
const bcrypt      = require('bcryptjs');
const helmet      = require('helmet');
const path        = require('path');
const fs          = require('fs');
const crypto      = require('crypto');

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ---------------------------------------------------------------------------
// 1. Storage setup: ensure ./data/submissions.json exists
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

// Write to a temp file then rename — prevents corruption if the process dies
// in the middle of a write.
function writeSubmissions(arr) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------------------------------------------------------------------
// 2. Admin password (hashed in memory, never stored in plain text on disk)
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const ADMIN_HASH     = bcrypt.hashSync(ADMIN_PASSWORD, 10);

if (ADMIN_PASSWORD === 'changeme') {
  console.warn(
    '[WARN] Using the default admin password "changeme". ' +
    'Set ADMIN_PASSWORD in a .env file before going live.'
  );
}

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[WARN] SESSION_SECRET not set; using a random one. ' +
    'All admins will be logged out whenever the server restarts.'
  );
}

// ---------------------------------------------------------------------------
// 3. Allowed locations - single source of truth shared with the browser.
//    Shape: { Area: { Region: [City, City, ...] } }
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

function isValidLocation(area, region, city) {
  if (typeof area !== 'string' || typeof region !== 'string' ||
      typeof city !== 'string') return false;
  const regions = LOCATIONS[area];
  if (!regions) return false;
  const cities = regions[region];
  if (!Array.isArray(cities)) return false;
  return cities.indexOf(city) !== -1;
}

// ---------------------------------------------------------------------------
// 4. Middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  // The default CSP would block our small inline favicons / future tweaks.
  // We rely on Helmet's other security headers, which are on by default.
  contentSecurityPolicy: false,
}));

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(session({
  name: 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 4, // 4-hour admin session
  },
}));

// Rate limiting: keeps abusers from spamming the form or brute-forcing login.
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
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Not authorized.' });
}

// ---------------------------------------------------------------------------
// 5. Static frontend (served from /public)
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// 6. PUBLIC: submission endpoint
// ---------------------------------------------------------------------------
app.post('/api/submit', submitLimiter, (req, res) => {
  const { problem, area, region, city, consent } = req.body || {};

  // --- Validation ---
  if (typeof problem !== 'string' || !problem.trim()) {
    return res.status(400).json({ error: 'Please describe your problem.' });
  }
  if (problem.length > 5000) {
    return res.status(400).json({ error: 'Problem text is too long (5000 chars max).' });
  }
  if (!area)   return res.status(400).json({ error: 'Please select an area.' });
  if (!region) return res.status(400).json({ error: 'Please select a region.' });
  if (!city)   return res.status(400).json({ error: 'Please select a city.' });
  if (!isValidLocation(area, region, city)) {
    return res.status(400).json({
      error: 'Selected area, region, and city do not match.'
    });
  }
  if (consent !== true && consent !== 'true' && consent !== 'on') {
    return res.status(400).json({ error: 'You must agree to the guidelines.' });
  }

  // --- Anonymous record: ONLY what we need, nothing else ---
  const entry = {
    id: crypto.randomUUID(),
    problem: problem.trim(),
    area,
    region,
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
  req.session.isAdmin = true;
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  // Newest first
  const all = readSubmissions().slice().reverse();
  res.json({ submissions: all, count: all.length });
});

app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const id  = req.params.id;
  const all = readSubmissions();
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
  console.log(` Anonymous submissions server`);
  console.log(` Public form : http://localhost:${PORT}/`);
  console.log(` Admin panel : http://localhost:${PORT}/admin.html`);
  console.log('--------------------------------------------------------');
});
