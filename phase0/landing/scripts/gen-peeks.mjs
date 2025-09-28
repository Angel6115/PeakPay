// scripts/gen-peeks.mjs — v2.2
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PHOTOS = path.resolve(__dirname, '../public/photos');
const OUT    = path.resolve(__dirname, '../public/peeks.json');

// 👉 Solo estas categorías activas:
const CAT_KNOWN = new Set([
  'arte', 'artistico', 'cosplay', 'fitness', 'lenceria'
]);

const exists  = async p => { try { await fs.access(p); return true; } catch { return false; } };
const readdir = async p => (await fs.readdir(p, { withFileTypes:true }))
  .filter(d => d.isDirectory()).map(d => d.name);
const readJson = async p => { try { return JSON.parse(await fs.readFile(p,'utf-8')); } catch { return null; } };
const pick = async (base, names) => { for (const n of names) { const p = path.join(base, n); if (await exists(p)) return n; } return null; };
const nice = s => (s||'').replace(/[-_]/g,' ').trim();
const url  = (...parts) => '/public/' + parts.join('/').replace(/^\/+/, '').replace(/\/+/g,'/');

async function buildCreator(relBase, hintedCategory = null) {
  const abs = path.join(PHOTOS, relBase);
  if (!(await exists(abs))) return null;

  const parts    = relBase.split('/').filter(Boolean);
  const id       = parts.at(-1);
  const category = hintedCategory || (parts.length === 2 && CAT_KNOWN.has(parts[0]) ? parts[0] : '');

  const metaC   = await readJson(path.join(abs, 'meta.json')) || {};
  const name    = metaC.name ? String(metaC.name) : nice(id);
  const handle  = metaC.handle || `@${id.replace(/-/g,'.')}`;
  const country = metaC.country || '';
  const verified = !!metaC.verified;
  const tags    = Array.isArray(metaC.tags) ? metaC.tags : [];

  const stats = {
    rating:  metaC.rating  ?? 4.8,
    reviews: metaC.reviews ?? 0,
    subs:    metaC.subs    ?? 0,
    posts:   metaC.posts   ?? 0,
    likes:   metaC.likes   ?? 0,
    revealed:metaC.revealed?? 0,
  };

  const sets = [];
  const setsAbs = path.join(abs, 'sets');

  // --- SETS (si existe /sets)
  if (await exists(setsAbs)) {
    const setDirs = await readdir(setsAbs);
    for (const slug of setDirs) {
      const baseAbs = path.join(setsAbs, slug);

      // full.* es obligatorio
      const fullName = await pick(baseAbs, ['full.webp','full.jpg']);
      if (!fullName) {
        console.log(`    ↪︎  ${relBase}/sets/${slug}: sin full.webp|jpg — omitido.`);
        continue;
      }

      // Preferencias para thumb/cover (admite .jpg y .webp)
      const thumbName = await pick(baseAbs, ['thumb.jpg','thumb.webp','cover.jpg','cover.webp']) || fullName;
      const coverName = await pick(baseAbs, ['cover.webp','cover.jpg']) || thumbName || fullName;

      const metaS = await readJson(path.join(baseAbs, 'meta.json')) || {};

      sets.push({
        slug,
        title: metaS.title || nice(slug),
        blurb: metaS.blurb || '',
        grid:  Number(metaS.grid || 4),
        tags:  Array.isArray(metaS.tags) ? metaS.tags : [],
        thumb: url('photos', relBase, 'sets', slug, thumbName),
        cover: url('photos', relBase, 'sets', slug, coverName),
        full:  url('photos', relBase, 'sets', slug, fullName),
      });
    }
  }

  // --- Fallback raíz: si no hay /sets pero sí full.* en la raíz
  if (sets.length === 0) {
    const fullRoot  = await pick(abs, ['full.webp','full.jpg']);
    if (fullRoot) {
      const thumbRoot = await pick(abs, ['thumb.jpg','thumb.webp','cover.jpg','cover.webp']) || fullRoot;
      const coverRoot = await pick(abs, ['cover.webp','cover.jpg']) || thumbRoot || fullRoot;

      sets.push({
        slug:  'default',
        title: metaC.title || name,
        blurb: metaC.blurb || '',
        grid:  Number(metaC.grid || 4),
        tags,
        thumb: url('photos', relBase, thumbRoot),
        cover: url('photos', relBase, coverRoot),
        full:  url('photos', relBase, fullRoot),
      });

      console.log(`  • ${relBase}  → sets:1 (fallback raíz)`);
    }
  }

  if (sets.length === 0) {
    console.log(`    ↪︎  ${relBase}: sin full.webp|jpg (ni en raíz ni en sets) — omitido.`);
    return null;
  }

  if (await exists(setsAbs)) console.log(`  • ${relBase}  → sets:${sets.length}`);

  // Thumb para tarjeta = thumb del primer set (o cover si no hubiera)
  const first = sets[0];
  const cardThumb = first.thumb || first.cover || '/public/peak1.PNG';

  return {
    id,
    category,
    summary: {
      id,
      name,
      thumb: cardThumb,
      profile: `./peek.html?creator=${encodeURIComponent(id)}&s=${encodeURIComponent(first.slug)}`,
      tags
    },
    detail: { name, handle, country, verified, stats, tags, sets }
  };
}

async function main() {
  console.log('gen-peeks.mjs @', __filename);
  console.log('Escaneando PHOTOS @', PHOTOS);

  const data = { creators: [], creatorsDetail: {}, categories: {} };

  if (!(await exists(PHOTOS))) {
    await fs.writeFile(OUT, JSON.stringify(data, null, 2));
    console.log('⚠️  No existe /public/photos. JSON vacío.');
    return;
  }

  const top = await readdir(PHOTOS);
  const seen = new Set();

  // 1) category-first
  for (const cat of top) {
    if (!CAT_KNOWN.has(cat)) continue;
    const creatorsInCat = await readdir(path.join(PHOTOS, cat));
    if (!creatorsInCat.length) continue;

    console.log(`→ Categoria ${cat} (${creatorsInCat.length} carpetas)`);

    for (const creator of creatorsInCat) {
      const rel = `${cat}/${creator}`;
      const rec = await buildCreator(rel, cat);
      if (!rec) continue;

      if (!data.categories[cat]) data.categories[cat] = [];
      data.categories[cat].push({
        id: rec.id,
        name: rec.detail.name,
        thumb: rec.summary.thumb,
        profile: rec.summary.profile,
        tags: rec.summary.tags || []
      });

      if (!seen.has(rec.id)) {
        seen.add(rec.id);
        data.creators.push(rec.summary);
        data.creatorsDetail[rec.id] = rec.detail;
      }
    }
  }

  // 2) creator-first (carpetas sueltas en /photos)
  for (const d of top) {
    if (CAT_KNOWN.has(d)) continue; // ya cubierto en category-first
    if (seen.has(d)) continue;      // ya agregado por estar dentro de una categoría

    const rec = await buildCreator(d, '');
    if (!rec) continue;

    data.creators.push(rec.summary);
    data.creatorsDetail[rec.id] = rec.detail;
  }

  await fs.writeFile(OUT, JSON.stringify(data, null, 2));
  const catCount = Object.keys(data.categories)
    .map(k => `${k}:${data.categories[k].length}`)
    .join(', ') || '—';

  console.log('✅ peeks.json generado en:', OUT);
  console.log('   Categorías →', catCount);
  console.log('   Creadores  →', data.creators.length);
}

main().catch(err => {
  console.error('❌ Error generando peeks.json:', err);
  process.exit(1);
});
