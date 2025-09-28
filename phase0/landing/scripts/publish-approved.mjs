#!/usr/bin/env node
// scripts/publish-approved.mjs
// Publica los approved del mock API creando carpetas en /public/photos y regenerando peeks.json

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const API  = process.env.API || 'http://localhost:8787';
const OUT  = path.resolve(__dirname, '../public/photos');
const GEN  = path.resolve(__dirname, './gen-peeks.mjs');
const MARK = path.resolve(__dirname, '../server/.data/published-ids.json'); // simple marcador

async function ensureDir(p){ await fs.mkdir(p, { recursive:true }); }
async function exists(p){ try{ await fs.access(p); return true; }catch{ return false; } }

async function loadJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
  return r.json();
}
async function readJsonFile(p){ try{ return JSON.parse(await fs.readFile(p,'utf-8')); }catch{ return null; } }
async function writeJsonFile(p, obj){ await ensureDir(path.dirname(p)); await fs.writeFile(p, JSON.stringify(obj,null,2)); }

function runNode(file){
  return new Promise((resolve,reject)=>{
    const ps = spawn(process.execPath, [file], { stdio:'inherit' });
    ps.on('exit', code => code===0 ? resolve() : reject(new Error(`gen failed (${code})`)));
  });
}

function cleanHandle(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }

async function main(){
  console.log('→ Leyendo aprobados desde API:', API);
  const res = await loadJSON(`${API}/api/submissions`);
  const items = (res.items||[]).filter(x=>x.status==='approved');

  const publishedMark = (await readJsonFile(MARK)) || { ids: [] };
  const already = new Set(publishedMark.ids || []);

  let created = 0;
  for (const it of items){
    if (already.has(it.id)) continue;

    const handle = cleanHandle(it?.account?.handle);
    if (!handle){ console.log(`  • ${it.id}: sin handle → skip`); continue; }

    const dir = path.join(OUT, handle);
    await ensureDir(dir);

    const metaPath = path.join(dir, 'meta.json');
    const meta = {
      name: it?.profile?.displayName || `${it?.identity?.firstName||''} ${it?.identity?.lastName||''}`.trim() || handle,
      handle: `@${handle}`,
      country: it?.identity?.country || '',
      verified: true,
      rating: it?.autoReview?.score ? Math.max(4.5, Math.min(5, 4 + it.autoReview.score/100)) : 4.8,
      reviews: 0, subs: 0, posts: 0, likes: 0, revealed: 0,
      tags: (it?.profile?.categories||[]),
      title: it?.profile?.displayName || '',
      blurb: it?.profile?.bio || '',
      grid: 4
    };

    // Si ya existía meta.json, respetarlo (solo completar vacíos)
    let existing = await readJsonFile(metaPath);
    if (existing) Object.assign(existing, Object.fromEntries(Object.entries(meta).filter(([k,v])=>existing[k]==null||existing[k]==='')));
    else existing = meta;

    await writeJsonFile(metaPath, existing);
    console.log(`  ✓ Publicado base → ${path.relative(path.resolve(__dirname,'..'), dir)}/`);

    // Marca como publicado
    publishedMark.ids.push(it.id);
    created++;
  }

  // guarda marcador
  await writeJsonFile(MARK, publishedMark);

  if (created===0){
    console.log('No hay nuevos aprobados para publicar.');
  } else {
    console.log('→ Regenerando peeks.json…');
    await runNode(GEN);
    console.log('✅ Publicación lista. Nuevos creadores:', created);
  }
}

main().catch(err=>{ console.error('❌ publish-approved:', err); process.exit(1); });
