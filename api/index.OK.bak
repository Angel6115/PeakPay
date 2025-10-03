// api/index.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

/* ========= CORS ========= */
const extra = (process.env.CORS_ORIGINS || '')
  .split(',').map(s=>s.trim()).filter(Boolean);
const ALLOW = new Set([
  'http://localhost:3000','http://127.0.0.1:3000',
  'http://localhost:5173','http://127.0.0.1:5173',
  ...extra
]);
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if (origin && ALLOW.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); }
  else if (!origin) { res.setHeader('Access-Control-Allow-Origin', '*'); }
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-PP-UID');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* ========= DB opcional (solo sets) ========= */
const rawDbUrl  = process.env.DATABASE_URL || '';
const HAS_DB_URL = !!rawDbUrl && !/USER:PASS@HOST/.test(rawDbUrl);
if (!HAS_DB_URL) console.warn('[warn] DATABASE_URL no configurada real; rutas DB harán fallback.');
let pool = null;
if (HAS_DB_URL) {
  pool = new Pool({ connectionString: rawDbUrl });
  pool.on('error', (e)=>console.error('[pg] unexpected', e));
}

/* ========= Utils ========= */
const STATIC_BASE  = (process.env.STATIC_BASE  || 'http://localhost:5173').replace(/\/+$/,'');
const ASSET_PREFIX = (process.env.ASSET_PREFIX || 'photos/arte').replace(/^\/+|\/+$/g,'');
const LEGACY_RAW   = (process.env.LEGACY_API_BASE || '').replace(/\/+$/,'');
const LEGACY = LEGACY_RAW.endsWith('/public') ? LEGACY_RAW.replace(/\/public$/,'') : LEGACY_RAW;

/* ========= Debug ========= */
app.get('/__who', (_req,res)=> res.json({
  pid: process.pid,
  env: { PORT: process.env.PORT, LEGACY_API_BASE: LEGACY || null, STATIC_BASE, ASSET_PREFIX, HAS_DB_URL }
}));
app.get('/__routes', (_req,res)=>{
  const out = [];
  (app._router?.stack || []).forEach((l)=>{
    if (l.route && l.route.path) {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      out.push(`${methods} ${l.route.path}`);
    }
  });
  res.type('text/plain').send(out.sort().join('\n'));
});

/* ========= Health ========= */
app.get('/api/health', (_req,res)=> res.json({ ok:true }));

/* ========= Sets ========= */
app.get('/api/sets/signed-full', async (req,res)=>{
  const id       = (req.query.id || '').toString().trim();
  const qCreator = (req.query.creator || '').toString().trim();
  const qSet     = (req.query.set || '').toString().trim();

  const norm = (p) => String(p || '')
    .replace(/^\/+/,'')
    .replace(/^public\/+/,'')
    .replace(/^photos\/+/,''); // ASSET_PREFIX manda

  const makeUrl = (rel, source) => {
    const clean = norm(rel);
    const url = `${STATIC_BASE}/${ASSET_PREFIX}/${clean}`.replace(/([^:]\/)\/+/g,'$1');
    return res.json({ ok:true, url, source });
  };

  if (HAS_DB_URL && id) {
    try {
      const { rows } = await pool.query(
        `SELECT id, full_asset_key, full_path
         FROM sets
         WHERE id = $1 AND is_active = TRUE`,
        [id]
      );
      if (rows.length && rows[0].full_path) return makeUrl(rows[0].full_path, 'db-full_path');
    } catch (e) {
      console.error('[GET /api/sets/signed-full] DB error:', e.message);
    }
  } else {
    console.warn('[signed-full] DB no configurada; usando fallbacks.');
  }

  if (qCreator && qSet) return makeUrl(`${qCreator}/sets/${qSet}/full.jpg`, 'query-fallback');
  if (id === '697dc6d3-4008-4221-8259-4a7779c2a0ea')
    return makeUrl('ink-aria/sets/set-01/full.jpg', 'demo-uuid-fallback');

  return res.status(404).json({ ok:false, error:'not_found', hint:'Pasa ?creator=&set= o configura DATABASE_URL' });
});

/* ========= Créditos / Unlock ========= */
function getUID(req){ return (req.header('X-PP-UID') || 'test-user-123').toString(); }
const USD_PER_CREDIT = 0.25;

const mem = { users: new Map() };
function ensureUser(uid){
  if (!mem.users.has(uid)) mem.users.set(uid, { credits: 0, points: 0, history: [], lastBonusYmd: null });
  return mem.users.get(uid);
}

function normalizeItem(it){
  const base = { ts: it.ts, type: it.type };
  if (it.type === 'topup') {
    const credits = it.credits_added ?? it.amount ?? 0;
    const usd = it.usd ?? null;
    return { ...base,
      pack: it.pack ?? null,
      usd,
      credits,                 // <- alias requerido por tu wallet
      credits_added: credits,
      credits_delta: +credits,
      points_delta: it.points_delta ?? Math.round(credits/5),
      label: `Pack $${(usd??0).toFixed ? usd.toFixed(2) : usd} (+${credits} cr)`
    };
  }
  if (it.type === 'unlock') {
    return { ...base,
      set_id: it.set_id,
      count: it.count,
      credits: -(it.count||0), // para la columna derecha
      credits_delta: -(it.count || 0),
      points_delta: 0,
      label: `Desbloqueo ${it.count||0} celda`
    };
  }
  if (it.type === 'streak-bonus') {
    return { ...base,
      points_delta: it.points || it.points_delta || 1,
      credits_delta: 0,
      label: `Bono diario (+${it.points || it.points_delta || 1} pt)`
    };
  }
  return { ...base, label: 'event' };
}

if (!LEGACY) {
  console.log('[demo] Créditos/Unlock locales habilitados');

  // Balance (retro-compatible: balance como número)
  app.get('/api/credits/balance', (req,res)=>{
    const u = ensureUser(getUID(req));
    res.json({
      ok: true,
      credits: u.credits,
      points:  u.points,
      balance: u.credits,                          // <- número
      balance_detail: { credits:u.credits, points:u.points },
      usd_equiv: +(u.credits * USD_PER_CREDIT).toFixed(2)
    });
  });

  // Points
  app.get('/api/credits/points', (req,res)=>{
    const u = ensureUser(getUID(req));
    res.json({ ok:true, points: u.points });
  });

  // Historial
  app.get('/api/credits/history', (req,res)=>{
    const u = ensureUser(getUID(req));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const items = u.history.slice(-limit).map(normalizeItem).reverse();
    res.json({ ok:true, items });
  });

  // Topup
  app.post('/api/credits/topup', (req,res)=>{
    const uid = getUID(req);
    const u = ensureUser(uid);
    const q = req.query || {};
    const b = req.body || {};

    const PACKS = {
      '5':  { usd: 5,  cr: 20 },  'p1': { usd: 5,  cr: 20 },
      '10': { usd: 10, cr: 50 },  'p2': { usd: 10, cr: 50 },
      '20': { usd: 20, cr: 120 }, 'p3': { usd: 20, cr: 120 },
    };

    let packRaw = String(q.pack ?? b.pack ?? '').trim().toLowerCase();
    let creditsToAdd = 0;
    let usd = null;

    if (packRaw && PACKS[packRaw]) { creditsToAdd = PACKS[packRaw].cr; usd = PACKS[packRaw].usd; }
    else {
      const amount = Number(q.amount ?? b.amount ?? q.credits ?? b.credits ?? 0);
      if (Number.isFinite(amount) && amount > 0) { creditsToAdd = Math.floor(amount); usd = +(creditsToAdd * USD_PER_CREDIT).toFixed(2); packRaw = null; }
    }
    if (!creditsToAdd) return res.status(400).json({ ok:false, error:'invalid_amount' });

    u.credits += creditsToAdd;
    const pts = Math.round(creditsToAdd / 20);
    u.points += pts;

    u.history.push({ ts: Date.now(), type:'topup', uid, pack:packRaw, usd, credits_added:creditsToAdd, points_delta:pts });

    res.json({
      ok: true,
      credits: u.credits,
      points:  u.points,
      balance: u.credits,            // <- número para front
      added:   creditsToAdd,         // usado por tu wallet en el mensaje
      credits_added: creditsToAdd,
      pack:    packRaw,
      usd
    });
  });

  // Bono diario
  app.post('/api/credits/streak-bonus', (req,res)=>{
    const uid = getUID(req);
    const u = ensureUser(uid);
    const ymd = new Date().toISOString().slice(0,10);
    if (u.lastBonusYmd === ymd) return res.json({ ok:true, granted:false, points: u.points });
    u.lastBonusYmd = ymd;
    u.points += 1;
    u.history.push({ ts: Date.now(), type:'streak-bonus', uid, points:1 });
    res.json({ ok:true, granted:true, points: u.points });
  });

  // Unlock
  app.get('/api/unlock', (req,res)=>{
    const uid = getUID(req);
    const u = ensureUser(uid);
    const count = Math.max(1, Number(req.query.count || 1));
    const setId = (req.query.set_id || 'unknown').toString();

    if (u.credits < count) return res.status(402).json({ ok:false, error:'insufficient_credits' });

    u.credits -= count;
    u.history.push({ ts: Date.now(), type:'unlock', set_id:setId, count, uid });

    res.json({
      ok: true,
      unlocked: count,
      credits:  u.credits,
      balance:  u.credits,         // <- número para front
      credits_delta: -count
    });
  });

} else {
  // Proxy
  const LEG = LEGACY;
  async function forward(req,res){
    try{
      const target = LEG + req.originalUrl;
      const hdrs = {};
      if (req.headers['content-type']) hdrs['content-type'] = req.headers['content-type'];
      if (req.headers['x-pp-uid'])     hdrs['x-pp-uid']     = req.headers['x-pp-uid'];
      const init = { method:req.method, headers:hdrs };
      if (!['GET','HEAD'].includes(req.method)) init.body = req.is('application/json') ? JSON.stringify(req.body||{}) : req.body;
      const r = await fetch(target, init);
      const ct = r.headers.get('content-type') || 'application/json; charset=utf-8';
      const buf = Buffer.from(await r.arrayBuffer());
      const origin = req.headers.origin;
      if (origin && ALLOW.has(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary','Origin'); }
      else if (!origin) { res.set('Access-Control-Allow-Origin','*'); }
      res.status(r.status).set('content-type', ct).send(buf);
    }catch(e){
      console.error('[proxy]', e);
      res.status(502).json({ ok:false, error:'bad_gateway' });
    }
  }
  app.use('/api/credits', forward);
  app.use('/api/unlock',  forward);
}

/* ========= Arranque ========= */
const PORT = Number(process.env.PORT || 4000);
const server = app.listen(PORT, ()=>{
  console.log('[api] listening on :'+PORT, LEGACY ? `(proxy -> ${LEGACY})` : '(no proxy)');
});
process.on('SIGINT',  ()=>{ server.close(()=>process.exit(0)); });
process.on('SIGTERM', ()=>{ server.close(()=>process.exit(0)); });
