// api/index.js  (ESM)
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], override: true });

import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

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
  res.setHeader('Access-Control-Allow-Headers','Content-Type, X-PP-UID, Authorization');
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
// Recomendado en .env: STATIC_BASE=http://localhost:5173/public  y  ASSET_PREFIX=photos
const STATIC_BASE  = (process.env.STATIC_BASE  || 'http://localhost:5173/public').replace(/\/+$/,'');
const ASSET_PREFIX = (process.env.ASSET_PREFIX || 'photos').replace(/^\/+|\/+$/g,'');
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
      const methods = Object.keys(l.route.methods || {}).map(m=>m.toUpperCase()).join(',');
      out.push(`${methods||'GET'} ${l.route.path}`);
    }
  });
  res.type('text/plain').send(out.sort().join('\n'));
});

/* ========= Health ========= */
const healthPayload = () => ({ ok:true, ts: Date.now() });
app.get('/health', (_req,res)=> res.json(healthPayload()));     // plano
app.get('/api/health', (_req,res)=> res.json(healthPayload())); // compat

/* ========= Sets ========= */
/**
 * GET /api/sets/signed-full
 * Admite:
 *   - ?u=cat/creator&set=set-01
 *   - ó ?cat=arte&creator=ink-aria&set=set-01
 *   - opcional: ?id=UUID (usa DB si está configurada)
 *   - opcional: ?ext=webp|jpg  (por defecto webp)
 * Responde { ok:true, url, source }
 */
app.get('/api/sets/signed-full', async (req,res)=>{
  const id       = (req.query.id || '').toString().trim();
  const qU       = (req.query.u  || '').toString().trim();   // "cat/creator" o sólo "creator"
  const qCreator = (req.query.creator || '').toString().trim();
  const qSet     = (req.query.set || '').toString().trim();
  const qCat     = (req.query.cat || '').toString().trim();

  // extensión preferida (por defecto .webp)
  const rawExt = (req.query.ext || 'webp').toString().trim().toLowerCase();
  const ext = rawExt === 'jpg' ? 'jpg' : 'webp'; // solo permitimos webp|jpg

  const norm = (p) => String(p || '')
    .replace(/^\/+/,'')
    .replace(/^public\/+/,'')
    .replace(/^photos\/+/,''); // ASSET_PREFIX controla el prefijo

  const makeUrl = (rel, source) => {
    const clean = norm(rel);
    // STATIC_BASE suele incluir /public; ASSET_PREFIX = photos
    const url = `${STATIC_BASE}/${ASSET_PREFIX}/${clean}`.replace(/([^:]\/)\/+/g,'$1');
    return res.json({ ok:true, url, source });
  };

  // 1) DB lookup (si existe)
  if (HAS_DB_URL && id) {
    try {
      const { rows } = await pool.query(
        `SELECT id, full_asset_key, full_path
         FROM sets
         WHERE id = $1 AND is_active = TRUE`,
        [id]
      );
      if (rows.length && rows[0].full_path) {
        return makeUrl(rows[0].full_path, 'db-full_path');
      }
    } catch (e) {
      console.error('[GET /api/sets/signed-full] DB error:', e.message);
    }
  } else if (id) {
    console.warn('[signed-full] DB no configurada; usando fallbacks. id=', id);
  }

  // 2) Fallbacks por query
  // a) Si u="cat/creator" y hay set
  if (qU && qU.includes('/') && qSet) {
    // qU ya trae cat/creator
    return makeUrl(`${qU}/sets/${qSet}/full.${ext}`, 'u-catcreator-fallback');
  }

  // b) Si cat + creator + set vienen separados
  if ((qCat || qCreator) && qSet) {
    const catPart = qCat ? `${qCat}/` : '';             // cat opcional
    const creatorPart = qCreator || qU || 'unknown';    // creator
    return makeUrl(`${catPart}${creatorPart}/sets/${qSet}/full.${ext}`, 'query-fallback');
  }

  // c) Si u="creator" sin cat y hay set → asume creador directo bajo ASSET_PREFIX (poco común)
  if (qU && !qU.includes('/') && qSet) {
    return makeUrl(`${qU}/sets/${qSet}/full.${ext}`, 'u-creator-only-fallback');
  }

  // d) Demo UUID conocido
  if (id === '697dc6d3-4008-4221-8259-4a7779c2a0ea') {
    // demo en arte/ink-aria
    return makeUrl(`arte/ink-aria/sets/set-01/full.${ext}`, 'demo-uuid-fallback');
  }

  return res.status(404).json({ ok:false, error:'not_found', hint:'Pasa ?u=cat/creator&set= o ?cat=&creator=&set=; o configura DATABASE_URL' });
});

/* ========= Arranque ========= */
const PORT = Number(process.env.PORT || 4000);
const server = app.listen(PORT, ()=>{
  console.log('[api] listening on :'+PORT, LEGACY ? `(proxy -> ${LEGACY})` : '(no proxy)');
});
process.on('SIGINT',  ()=>{ server.close(()=>process.exit(0)); });
process.on('SIGTERM', ()=>{ server.close(()=>process.exit(0)); });
