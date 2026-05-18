require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.use(cookieParser());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

let LOCATIONS = {};
try {
  const LOCATIONS_FILE = path.join(__dirname, 'public', 'locations.json');
  LOCATIONS = JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf8'));
} catch (err) {
  console.log("Locations file not loaded");
  LOCATIONS = {};
}

function isValidLocation(area, city) {
  return Array.isArray(LOCATIONS?.[area]) && LOCATIONS[area].includes(city);
}

const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

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

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/submit", submitLimiter, async (req, res) => {
  try {
    const { problem, area, city, consent } = req.body;

    if (!problem?.trim()) return res.status(400).json({ error: "Empty" });
    if (!isValidLocation(area, city)) return res.status(400).json({ error: "Invalid location" });
    if (!consent) return res.status(400).json({ error: "Consent required" });

    const { error } = await supabase
      .from("submissions")
      .insert([{
        id: crypto.randomUUID(),
        problem: problem.trim(),
        area,
        city,
        created_at: new Date().toISOString(),
      }]);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Wrong password" });

  const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
  res.json({ ok: true });
});

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

app.delete("/api/admin/logout", (req, res) => {
  res.clearCookie("token", { httpOnly: true, secure: true, sameSite: "none" });
  res.json({ ok: true });
});

app.get("/api/admin/submissions", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ submissions: data });
});

app.delete("/api/admin/submissions/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;