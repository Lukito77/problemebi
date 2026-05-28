if (process.env.NODE_ENV !== 'production') require('dotenv').config();
 
const express      = require('express');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const path         = require('path');
const crypto       = require('crypto');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs           = require('fs');
const multer       = require('multer');
const mongoose     = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
 
// MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));
 
const submissionSchema = new mongoose.Schema({
  problem:    { type: String, required: true },
  area:       { type: String, required: true },
  city:       { type: String, required: true },
  image_url:  { type: String, default: null },
  created_at: { type: Date, default: Date.now },
});
 
const Submission = mongoose.model('Submission', submissionSchema);
 
// Supabase (მხოლოდ Storage-ისთვის)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
 
const app = express();
 
const JWT_SECRET     = process.env.JWT_SECRET     || "super_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "submission-images";
const IS_PROD        = process.env.NODE_ENV === 'production';
 
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: IS_PROD ? 'none' : 'lax',
};
 
app.use(cookieParser());
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
 
let LOCATIONS = {};
try {
  const possiblePaths = [
    path.join(__dirname, 'public', 'locations.json'),
    path.join(process.cwd(), 'public', 'locations.json'),
    path.join(__dirname, '..', 'public', 'locations.json'),
  ];

  let loaded = false;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      LOCATIONS = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log('Locations loaded from:', p);
      loaded = true;
      break;
    }
  }
  if (!loaded) {
    console.log('Locations file not found. Checked paths:');
    possiblePaths.forEach(p => console.log(' -', p));
  }
} catch (err) {
  console.log("Locations file not loaded:", err.message);
}
 
function isValidLocation(area, city) {
  return Array.isArray(LOCATIONS?.[area]) && LOCATIONS[area].includes(city);
}
 
const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
const loginLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
 
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    var allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('invalid_type'));
  },
});
 
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
 
app.post("/api/submit", submitLimiter, upload.single('image'), async (req, res) => {
  try {
    const { problem, area, city, consent } = req.body;
 
    if (!problem?.trim())             return res.status(400).json({ error: "Empty" });
    if (!isValidLocation(area, city)) return res.status(400).json({ error: "Invalid location" });
    if (!consent)                     return res.status(400).json({ error: "Consent required" });
 
    let image_url = null;
 
    if (req.file) {
      const ext      = req.file.mimetype.split('/')[1];
      const filename = `${crypto.randomUUID()}.${ext}`;
 
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });
 
      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return res.status(500).json({ error: 'ფოტოს ატვირთვა ვერ მოხერხდა.' });
      }
 
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filename);
 
      image_url = urlData.publicUrl;
    }
 
    await Submission.create({
      problem: problem.trim(),
      area,
      city,
      image_url,
    });
 
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
 
app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Wrong password" });
 
  const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, COOKIE_OPTIONS);
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
  res.clearCookie("token", COOKIE_OPTIONS);
  res.json({ ok: true });
});
 
app.get("/api/admin/submissions", requireAdmin, async (req, res) => {
  try {
    const submissions = await Submission.find().sort({ created_at: -1 });
    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
 
app.delete("/api/admin/submissions/:id", requireAdmin, async (req, res) => {
  try {
    await Submission.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
 
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
 
module.exports = app;
