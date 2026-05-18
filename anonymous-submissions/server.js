require('dotenv').config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://weftuyznrwzddwrxegxl.supabase.co/rest/v1/",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlZnR1eXpucnd6ZGR3cnhlZ3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMzQ5MDQsImV4cCI6MjA5NDYxMDkwNH0.csmXkhGI-cVnkbjej9X1dIO7HcYmhcmj5HCq56S4s3k"
);

const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');

const app = express();

// -------------------- ENV --------------------
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// -------------------- MIDDLEWARE --------------------
app.use(cookieParser());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// -------------------- IN-MEMORY STORAGE (Vercel-safe) --------------------
let submissions = [];

// -------------------- LOCATIONS (SAFE LOAD) --------------------
let LOCATIONS = {};

try {
  const LOCATIONS_FILE = path.join(__dirname, 'public', 'locations.json');
  LOCATIONS = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
} catch (err) {
  console.log("Locations file not loaded");
  LOCATIONS = {};
}

function isValidLocation(area, region, city) {
  return LOCATIONS?.[area]?.[region]?.includes(city);
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

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) return res.status(401).json({ error: "Invalid" });

    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// -------------------- STATIC --------------------
app.use(express.static(path.join(__dirname, "public")));

// -------------------- SUBMIT --------------------
app.post("/api/submit", submitLimiter, (req, res) => {
  const { problem, area, region, city, consent } = req.body;

  if (!problem?.trim()) return res.status(400).json({ error: "Empty" });

  if (!isValidLocation(area, region, city)) {
    return res.status(400).json({ error: "Invalid location" });
  }

  if (!consent) return res.status(400).json({ error: "Consent required" });

  const entry = {
    id: crypto.randomUUID(),
    problem: problem.trim(),
    area,
    region,
    city,
    timestamp: new Date().toISOString(),
  };

  submissions.push(entry);

  res.json({ ok: true });
});

// -------------------- LOGIN --------------------
app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password" });
  }

  const token = jwt.sign({ isAdmin: true }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });

  res.json({ ok: true });
});

// -------------------- ME --------------------
app.get("/api/admin/me", (req, res) => {
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
app.get("/api/admin/submissions", requireAdmin, (req, res) => {
  res.json({ submissions: submissions.slice().reverse() });
});

// -------------------- DELETE --------------------
app.delete("/api/admin/submissions/:id", requireAdmin, (req, res) => {
  submissions = submissions.filter((x) => x.id !== req.params.id);
  res.json({ ok: true });
});

// -------------------- EXPORT --------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;