if (process.env.NODE_ENV !== 'production') require('dotenv').config();
 
const express      = require('express');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const path         = require('path');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs           = require('fs');
const multer       = require('multer');
const mongoose     = require('mongoose');
const cloudinary   = require('cloudinary').v2;

// Cloudinary კონფიგურაცია
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
 
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
 
// შესწორებული ხაზი Vercel-ისთვის (Serverless გარემოსთვის)
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);
 
const app = express();
 
const JWT_SECRET     = process.env.JWT_SECRET     || "super_secret_key";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
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
  const locPath = path.join(__dirname, 'public', 'locations.json');
  LOCATIONS = JSON.parse(fs.readFileSync(locPath, 'utf8'));
  console.log('Locations loaded from:', locPath);
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
  limits: { fileSize: 50 * 1024 * 1024 },
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
 
app.get('/locations.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(LOCATIONS);
});
 
app.post("/api/submit", submitLimiter, upload.single('image'), async (req, res) => {
  try {
    const { problem, area, city, consent } = req.body;
 
    if (!problem?.trim())             return res.status(400).json({ error: "Empty" });
    if (!isValidLocation(area, city)) return res.status(400).json({ error: "Invalid location" });
    if (!consent)                     return res.status(400).json({ error: "Consent required" });
 
    let image_url = null;
 
    if (req.file) {
      // Cloudinary-ზე ატვირთვა buffer-იდან
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'problemebi', resource_type: 'image' },
          { error, result } => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });
      image_url = result.secure_url;
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