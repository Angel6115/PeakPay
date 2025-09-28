// scripts/make-thumbs.mjs
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ROOT    = path.resolve(__dirname, '../public/photos');
const OUTJSON = path.resolve(__dirname, '../public/peeks.json');

// ---------- utils ----------
const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const readdirDirs = async (p) =>
  (await fs.readdir(p, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);

function log(...args){ console.log(...args); }

// Dinámico para no crashear si falta sharp
async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch (e) {
    console.error('❌ Falta la dependencia "sharp". Instala con: npm i sharp');
    throw e;
  }
}

async function ensureThumbsForBase(sharp, base, srcName) {
  // base: carpeta donde está el full (p.ej: .../sets/<slug> o .../<creator>)
  const srcPath = path.join(base, srcName);
  if (!(await exists(srcPath))) return false;

  const thumbJpg = path.join(base, 'thumb.jpg');
  const coverJpg = path.join(base, 'cover.jpg');

  // thumb.jpg (ancho máx 640)
  if (!(await exists(thumbJpg))) {
    await sharp(srcPath)
      .resize({ width: 640, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toFile(thumbJpg);
    log('  ✓ thumb.jpg ->', thumbJpg);
  } else {
    log('  · thumb.jpg existe ->', thumbJpg);
  }

  // cover.jpg (1200x800 crop cover)
  if (!(await exists(coverJpg))) {
    await sharp(srcPath)
      .resize(1200, 800, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 85, progressive: true })
      .toFile(coverJpg);
    log('  ✓ cover.jpg ->', coverJpg);
  } else {
    log('  · cover.jpg existe ->', coverJpg);
  }

  return true;
}

async function findFullName(base) {
  for (const n of ['full.jpg', 'full.webp', 'full.jpeg', 'full.png']) {
    if (await exists(path.join(base, n))) return n;
  }
  return null;
}

// Toma el primer thumb de un creador dentro de la categoría para usarlo de cover de la categoría
async function ensureCategoryCoverFromCreators(catDir) {
  const coverJpg = path.join(catDir, 'cover.jpg');
  if (await exists(coverJpg)) return;

  // Busca thumbs en sets primero, luego en raíz del creador
  const creators = await readdirDirs(catDir);
  for (const c of creators) {
    const creatorDir = path.join(catDir, c);

    // 1) sets/*/thumb.jpg
    const setsDir = path.join(creatorDir, 'sets');
    if (await exists(setsDir)) {
      const sets = await readdirDirs(setsDir);
      for (const s of sets) {
        const t = path.join(setsDir, s, 'thumb.jpg');
        if (await exists(t)) {
          await fs.copyFile(t, coverJpg);
          log('  ✓ cover.jpg de categoría ->', coverJpg, '(origen:', t, ')');
          return;
        }
      }
    }
    // 2) raíz del creador thumb.jpg
    const t2 = path.join(creatorDir, 'thumb.jpg');
    if (await exists(t2)) {
      await fs.copyFile(t2, coverJpg);
      log('  ✓ cover.jpg de categoría ->', coverJpg, '(origen:', t2, ')');
      return;
    }
  }
}

// ---------- main ----------
async function main() {
  if (!(await exists(ROOT))) {
    console.log('⚠️  No existe /public/photos — nada que hacer.');
    return;
  }

  const sharp = await loadSharp();
  const cats  = await readdirDirs(ROOT);
  let totalProcessed = 0;

  for (const cat of cats) {
    const catDir = path.join(ROOT, cat);
    const creators = await readdirDirs(catDir);
    if (creators.length === 0) continue;

    console.log(`→ Categoría ${cat} (${creators.length} creadores)`);

    for (const creator of creators) {
      const creatorDir = path.join(catDir, creator);
      const setsDir    = path.join(creatorDir, 'sets');
      let hadAny = false;

      // 1) sets
      if (await exists(setsDir)) {
        const sets = await readdirDirs(setsDir);
        for (const s of sets) {
          const base = path.join(setsDir, s);
          const fullName = await findFullName(base);
          if (fullName) {
            console.log(`  • ${cat}/${creator}/sets/${s}`);
            await ensureThumbsForBase(sharp, base, fullName);
            totalProcessed++;
            hadAny = true;
          }
        }
      }

      // 2) raíz del creador (fallback)
      const fullRoot = await findFullName(creatorDir);
      if (fullRoot) {
        console.log(`  • ${cat}/${creator} (raíz)`);
        await ensureThumbsForBase(sharp, creatorDir, fullRoot);
        totalProcessed++;
        hadAny = true;
      }

      if (!hadAny) {
        console.log(`    ↪︎  ${cat}/${creator}: no hay full.* — omitido.`);
      }
    }

    // cover de categoría, si falta
    await ensureCategoryCoverFromCreators(catDir);
  }

  console.log('—');
  console.log('✅ Miniaturas generadas donde faltaban. Total bases procesadas:', totalProcessed);
  console.log('ℹ️  Ahora se regenerará peeks.json…');
}

await main().catch(err => {
  console.error('❌ Error en make-thumbs:', err);
  process.exit(1);
});
