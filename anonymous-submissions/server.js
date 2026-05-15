require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// -------------------- ENV --------------------
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zatkasdavajvi';

// -------------------- MIDDLEWARE --------------------
app.use(cookieParser());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

// -------------------- STORAGE --------------------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeSubmissions(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------- LOCATIONS --------------------
const LOCATIONS_FILE = path.join(__dirname, 'public', 'locations.json');
let LOCATIONS = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));

function isValidLocation(area, region, city) {
  return (
    LOCATIONS?.[area]?.[region]?.includes(city)
  );
}

// -------------------- RATE LIMIT --------------------
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

// -------------------- AUTH --------------------
function requireAdmin(req, res, next) {
  const token = req.cookies?.token;

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(401).json({ error: 'Invalid' });

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// -------------------- STATIC --------------------
app.use(express.static(path.join(__dirname, 'public')));

// -------------------- SUBMIT --------------------
app.post('/api/submit', submitLimiter, (req, res) => {
  const { problem, area, region, city, consent } = req.body;

  if (!problem?.trim()) return res.status(400).json({ error: 'Empty' });
  if (!isValidLocation(area, region, city)) {
    return res.status(400).json({ error: 'Invalid location' });
  }
  if (!consent) return res.status(400).json({ error: 'Consent required' });

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

  res.json({ ok: true });
});

// -------------------- LOGIN --------------------
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  const token = jwt.sign(
    { isAdmin: true },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });

  res.json({ ok: true });
});

// -------------------- ME --------------------
app.get('/api/admin/me', (req, res) => {
  const token = req.cookies?.token;

  if (!token) return res.json({ isAdmin: false });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: decoded.isAdmin });
  } catch {
    res.json({ isAdmin: false });
  }
});

// -------------------- SUBMISSIONS --------------------
app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const all = readSubmissions().reverse();
  res.json({ submissions: all });
});

// -------------------- DELETE --------------------
app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const all = readSubmissions();
  const filtered = all.filter(x => x.id !== req.params.id);

  writeSubmissions(filtered);

  res.json({ ok: true });
});

// -------------------- START --------------------
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});