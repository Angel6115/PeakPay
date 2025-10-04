#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Crea un set nuevo para PeekPay con estructura y archivos base.

USO:
  new_peek_set.sh --cat <categoria> --creator <slug-creador> [--set <slug-set>]
                  [--full <ruta_full_img>] [--cover <ruta_cover_img>]

ARGUMENTOS:
  --cat       Categoría (arte, fitness, cosplay, lenceria, artistico, etc.)
  --creator   Slug del creador (p.ej. ink-aria)
  --set       Slug del set (default: set-01)
  --full      Imagen base para mosaico (JPG/PNG/WebP). Si solo pasas esta, también se usa para cover.
  --cover     Imagen de portada (opcional). Si no la pasas, se genera desde --full.

DETALLES:
  - Crea: public/photos/<cat>/<creator>/sets/<set>/
  - Genera: full.jpg, cover.jpg y (si tienes cwebp) full.webp/cover.webp.
  - Requiere macOS con 'sips'. Si tienes 'cwebp', también hace WebP.
EOF
  exit 1
}

CAT=""; CREATOR=""; SET_SLUG="set-01"; FULL_SRC=""; COVER_SRC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cat) CAT="${2:-}"; shift 2 ;;
    --creator) CREATOR="${2:-}"; shift 2 ;;
    --set) SET_SLUG="${2:-}"; shift 2 ;;
    --full) FULL_SRC="${2:-}"; shift 2 ;;
    --cover) COVER_SRC="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Flag no reconocido: $1"; usage ;;
  esac
done

[[ -z "$CAT" || -z "$CREATOR" ]] && usage

TARGET_DIR="public/photos/${CAT}/${CREATOR}/sets/${SET_SLUG}"
mkdir -p "$TARGET_DIR"
echo "➡️  Destino: $TARGET_DIR"

have() { command -v "$1" >/dev/null 2>&1; }

to_jpg() {
  local src="$1" dst="$2"
  if have sips; then
    sips -s format jpeg "$src" --out "$dst" >/dev/null
  else
    echo "❌ Falta 'sips' (macOS). No pude convertir $src a JPG."
    exit 1
  fi
}

mk_webp() {
  local src="$1" dst="$2"
  if have cwebp; then
    cwebp -quiet "$src" -o "$dst"
  else
    echo "⚠️  cwebp no instalado; omitimos ${dst##*/}"
  fi
}

resize_cover_like() {
  local src="$1" dst="$2"
  if have sips; then
    sips -Z 1200 "$src" --out "$dst" >/dev/null
  else
    cp -f "$src" "$dst"
  fi
}

# full.jpg
if [[ -n "$FULL_SRC" ]]; then
  if printf '%s\n' "$FULL_SRC" | tr '[:upper:]' '[:lower:]' | grep -qE '\.jpe?g$'; then
    cp -f "$FULL_SRC" "${TARGET_DIR}/full.jpg"
  else
    echo "🖼  Convirtiendo FULL a JPG…"
    to_jpg "$FULL_SRC" "${TARGET_DIR}/full.jpg"
  fi
else
  echo "❗ No pasaste --full. Creando placeholder."
  if have convert; then
    convert -size 1600x1600 xc:white "${TARGET_DIR}/full.jpg"
  else
    sips -s format jpeg /System/Library/CoreServices/DefaultDesktop.jpg --out "${TARGET_DIR}/full.jpg" >/dev/null 2>&1 || true
  fi
fi

# cover.jpg
if [[ -n "$COVER_SRC" ]]; then
  if printf '%s\n' "$COVER_SRC" | tr '[:upper:]' '[:lower:]' | grep -qE '\.jpe?g$'; then
    cp -f "$COVER_SRC" "${TARGET_DIR}/cover.jpg"
  else
    echo "🖼  Convirtiendo COVER a JPG…"
    to_jpg "$COVER_SRC" "${TARGET_DIR}/cover.jpg"
  fi
else
  echo "🎯 Generando cover desde full.jpg…"
  resize_cover_like "${TARGET_DIR}/full.jpg" "${TARGET_DIR}/cover.jpg"
fi

# WebP opcional
mk_webp "${TARGET_DIR}/full.jpg"  "${TARGET_DIR}/full.webp"  || true
mk_webp "${TARGET_DIR}/cover.jpg" "${TARGET_DIR}/cover.webp" || true

echo "✅ Archivos creados:"
ls -lh "${TARGET_DIR}/" | sed 's/^/   /'

echo
echo "🔎 Prueba local:"
echo "  http://localhost:5173/public/peek.html?cat=${CAT}&creator=${CREATOR}&s=${SET_SLUG}"
echo
echo "📦 Commit (opcional):"
echo "  git add '${TARGET_DIR}' && git commit -m 'chore: nuevo set ${CAT}/${CREATOR}/${SET_SLUG}'"

# --- Actualiza public/peeks.json ------------------------------------------
PEEKS_JSON="public/peeks.json"
NODE_BIN=$(command -v node || true)

# Exporta para que Node vea las variables
export CAT CREATOR SET_SLUG TARGET_DIR

if [ -n "$NODE_BIN" ]; then
  "$NODE_BIN" <<'NODE'
const fs = require('fs');
const path = require('path');

const { CAT, CREATOR, SET_SLUG } = process.env;
if (!CAT || !CREATOR || !SET_SLUG) {
  console.log('[peeks.json] variables incompletas, omito actualización');
  process.exit(0);
}

// rutas para prod/local
const prodFull   = `/photos/${CAT}/${CREATOR}/sets/${SET_SLUG}/full.jpg`;
const prodCover  = `/photos/${CAT}/${CREATOR}/sets/${SET_SLUG}/cover.jpg`;
const localFull  = `/public/photos/${CAT}/${CREATOR}/sets/${SET_SLUG}/full.jpg`;
const localCover = `/public/photos/${CAT}/${CREATOR}/sets/${SET_SLUG}/cover.jpg`;

const file = path.resolve('public/peeks.json');
let data = { creatorsDetail: {} };

try {
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    data = JSON.parse(raw);
  }
} catch { data = { creatorsDetail: {} }; }

if (!data || typeof data !== 'object') data = {};
if (!data.creatorsDetail || typeof data.creatorsDetail !== 'object') data.creatorsDetail = {};

const key = `${CAT}/${CREATOR}`;
const cur = data.creatorsDetail[key] || {};
if (!Array.isArray(cur.sets)) cur.sets = [];
if (!cur.name)    cur.name    = CREATOR.replace(/[-_]/g, ' ');
if (!cur.handle)  cur.handle  = '@' + CREATOR.replace(/-/g, '.');
if (!cur.country) cur.country = 'Mundo';
if (typeof cur.verified !== 'boolean') cur.verified = false;
if (!cur.stats) cur.stats = {};

const baseSet = {
  slug:  SET_SLUG,
  title: SET_SLUG,
  grid:  4,
  blurb: '',
  full:  prodFull,
  cover: prodCover,
  fullLocal:  localFull,
  coverLocal: localCover,
};

const idx = cur.sets.findIndex(s => s && s.slug === SET_SLUG);
if (idx >= 0) cur.sets[idx] = { ...cur.sets[idx], ...baseSet };
else cur.sets.push(baseSet);

data.creatorsDetail[key] = cur;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`[peeks.json] actualizado: ${key} / ${SET_SLUG}`);
NODE
else
  echo "⚠️  Node no encontrado; omito actualización de public/peeks.json"
fi
