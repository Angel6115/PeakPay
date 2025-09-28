import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ======= Config =======
const PORT         = Number(process.env.PORT || 8787);
const FRONT_ORIGIN = process.env.FRONT_ORIGIN || 'http://localhost:5173';
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN  || 'dev-admin';

// Persistencia simple en disco (para sobrevivir reinicios)
const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE  = path.join(DATA_DIR, 'submissions.json');

// ======= Estado =======
/** @type {Array<any>} */
let SUBMISSIONS = [];

// ======= Util =======
async function ensureData() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    SUBMISSIONS = JSON.parse(raw);
  } catch {
    SUBMISSIONS = [];
    await fs.writeFile(DB_FILE, JSON.stringify(SUBMISSIONS, null, 2));
  }
}
async function persist() {
  await fs.writeFile(DB_FILE, JSON.stringify(SUBMISSIONS, null, 2));
}
function newId() {
  const ts  = new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  const rnd = Math.random().toString(36).slice(2,6);
  return `sub_${ts}_${rnd}`;
}

// Auth SOLO para métodos reales (no preflight)
function requireAdmin(req, res, next) {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const token = req.header('x-admin-token');
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok:false, error:'unauthorized' });
  next();
}

// ======= App =======
const app = express();

// CORS global
const corsCfg = {
  origin: FRONT_ORIGIN,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','x-admin-token'],
  maxAge: 86400,
};
app.use(cors(corsCfg));
// ⚠️ Express 5 ya no acepta "*" como ruta. Usa RegExp para cubrir /api/**
app.options(/^\/api\/.*$/, cors(corsCfg));

app.use(express.json({ limit: '5mb' }));

// Log básico
app.use((req,res,next)=>{
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Health
app.get('/api/health', (req,res)=>{
  res.json({ ok:true, time:new Date().toISOString() });
});

// Listar bandeja
app.get('/api/submissions', async (req,res)=>{
  res.json({ ok:true, items: SUBMISSIONS });
});

// Crear (desde studio-onboarding.html)
app.post('/api/submissions', async (req,res)=>{
  const body = req.body || {};
  if (!body?.account?.email || !body?.account?.handle) {
    return res.status(400).json({ ok:false, error:'missing email/handle' });
  }
  const id  = newId();
  const now = new Date().toISOString();
  const rec = {
    id,
    createdAt: now,
    status: 'pending',          // pending | approved | rejected | hold
    autoReview: {
      score: 70,                // demo
      verdict: 'manual_review', // demo
      notes: []
    },
    ...body,
  };
  SUBMISSIONS.unshift(rec);
  await persist();
  res.status(201).json({ ok:true, id, item: rec });
});

// Leer una
app.get('/api/submissions/:id', async (req,res)=>{
  const it = SUBMISSIONS.find(s=>s.id===req.params.id);
  if (!it) return res.status(404).json({ ok:false, error:'not_found' });
  res.json({ ok:true, item: it });
});

// Decidir (solo admin)
app.post('/api/submissions/:id/decision', requireAdmin, async (req,res)=>{
  const it = SUBMISSIONS.find(s=>s.id===req.params.id);
  if (!it) return res.status(404).json({ ok:false, error:'not_found' });

  const { decision, notes } = req.body || {};
  if (!['approve','reject','hold'].includes(decision)) {
    return res.status(400).json({ ok:false, error:'invalid_decision' });
  }
  it.status = decision === 'approve' ? 'approved'
           : decision === 'reject'  ? 'rejected'
           : 'hold';
  it.review = it.review || {};
  it.review.decisionAt = new Date().toISOString();
  it.review.notes = notes || '';
  await persist();
  res.json({ ok:true, item: it });
});

// Reset bandeja (solo admin)
app.post('/api/submissions/reset', requireAdmin, async (req,res)=>{
  SUBMISSIONS = [];
  await persist();
  res.json({ ok:true });
});

// Arranque
await ensureData();
app.listen(PORT, ()=>{
  console.log(`▶︎ Mock API en http://localhost:${PORT}`);
  console.log(`   FRONT_ORIGIN = ${FRONT_ORIGIN}`);
  console.log(`   ADMIN_TOKEN  = ${ADMIN_TOKEN}`);
});
