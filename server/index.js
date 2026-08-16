const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const generate = require('./generate');

const PORT = process.env.PORT || 3000;
const PASSCODE = process.env.PASSCODE || '';

if (!PASSCODE) {
  console.error('PASSCODE is not set — refusing to start. See .env.example.');
  process.exit(1);
}

const contentPath = path.join(__dirname, '..', 'content.json');
const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

const app = express();
app.use(express.json({ limit: '256kb' }));

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requirePasscode(req, res, next) {
  const provided = req.header('x-passcode') || '';
  if (!provided || !safeEqual(provided, PASSCODE)) {
    return res.status(401).json({ error: 'invalid passcode' });
  }
  next();
}

const progressLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/content', async (req, res) => {
  try {
    const generated = await db.getGeneratedContent();
    const merged = {};
    for (const key of Object.keys(content)) {
      merged[key] = [...content[key], ...(generated[key] || [])];
    }
    res.json(merged);
  } catch (e) {
    console.error('GET /api/content failed', e);
    res.status(500).json({ error: 'failed to load content' });
  }
});

app.post('/api/content/generate', generateLimiter, requirePasscode, async (req, res) => {
  const { category, count } = req.body || {};
  if (!generate.SCHEMAS[category]) {
    return res.status(400).json({ error: 'invalid category' });
  }
  const n = Math.min(Math.max(parseInt(count, 10) || 10, 1), 20);
  try {
    const generatedSoFar = await db.getGeneratedContent();
    const existing = [...(content[category] || []), ...(generatedSoFar[category] || [])];
    const newItems = await generate.generateItems(category, existing, n);
    if (newItems.length) await db.appendGeneratedItems(category, newItems);
    res.json({ items: newItems, total: existing.length + newItems.length });
  } catch (e) {
    console.error('POST /api/content/generate failed', e);
    res.status(500).json({ error: e.message || 'failed to generate content' });
  }
});

app.get('/api/progress', progressLimiter, requirePasscode, async (req, res) => {
  try {
    const data = await db.getProgress();
    res.json(data);
  } catch (e) {
    console.error('GET /api/progress failed', e);
    res.status(500).json({ error: 'failed to load progress' });
  }
});

app.post('/api/progress', progressLimiter, requirePasscode, async (req, res) => {
  if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'body must be a JSON object' });
  }
  try {
    await db.setProgress(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/progress failed', e);
    res.status(500).json({ error: 'failed to save progress' });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`En Voz Alta listening on :${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to initialize database', e);
    process.exit(1);
  });
