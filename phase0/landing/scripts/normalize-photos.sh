#!/usr/bin/env bash
set -euo pipefail

# === Config por defecto (puedes override con variables de entorno) ===
MAXW="${MAXW:-1600}"    # ancho máximo para full.webp
COVERW="${COVERW:-700}" # ancho máximo para cover.webp
QUAL="${QUAL:-80}"      # calidad WebP 0-100
FORCE="${FORCE:-0}"     # 1 = re-generar aunque existan .webp

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHOTOS="$ROOT/public/photos"

# --- helpers ---
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Falta '$1' — en macOS: brew install webp"; exit 1; }; }
sizeb() {  # bytes de un archivo (macOS / Linux)
  if stat -f%z "$1" >/dev/null 2>&1; then stat -f%z "$1"; else stat -c%s "$1"; fi
}

encode_webp() {
  local in="$1" out="$2" w="$3"
  mkdir -p "$(dirname "$out")"
  cwebp -quiet -q "$QUAL" -resize "$w" 0 "$in" -o "$out"
}

process_dir() {
  local dir="$1"
  local rel="${dir#"$PHOTOS/"}"
  local full_out="$dir/full.webp"
  local cover_out="$dir/cover.webp"

  shopt -s nullglob nocaseglob
  local src_full=""
  # preferimos full.jpg si existe, si no el primer jpg/jpeg/png
  for cand in "$dir/full.jpg" "$dir/"*.jpg "$dir/"*.jpeg "$dir/"*.png; do
    [[ -f "$cand" ]] && { src_full="$cand"; break; }
  done
  shopt -u nocaseglob

  # Si ya hay full.webp y no hay FORCE, intentamos usarlo de base para cover.webp
  if [[ -f "$full_out" && "$FORCE" -ne 1 ]]; then
    echo "   ↻ $rel  (full.webp existe)"
  else
    if [[ -z "$src_full" ]]; then
      # no hay JPG/PNG; si hay cover.jpg lo usamos para generar full.webp igual
      shopt -s nullglob nocaseglob
      for cand in "$dir/cover.jpg" "$dir/"*.jpg "$dir/"*.jpeg "$dir/"*.png; do
        [[ -f "$cand" ]] && { src_full="$cand"; break; }
      done
      shopt -u nocaseglob
    fi
    if [[ -n "$src_full" ]]; then
      echo "   → $rel  (full.webp desde $(basename "$src_full"))"
      encode_webp "$src_full" "$full_out" "$MAXW"
    else
      # Si no hay fuente pero ya existe full.webp, seguimos; si no, saltamos
      if [[ ! -f "$full_out" ]]; then
        echo "   · $rel  (sin fuente JPG/PNG y sin full.webp) — omitido"
        return
      fi
    fi
  fi

  # COVER
  if [[ -f "$cover_out" && "$FORCE" -ne 1 ]]; then
    : # ya está
  else
    local src_cover=""
    shopt -s nullglob nocaseglob
    for cand in "$dir/cover.jpg" "$dir/"*.jpg "$dir/"*.jpeg "$dir/"*.png; do
      [[ -f "$cand" ]] && { src_cover="$cand"; break; }
    done
    shopt -u nocaseglob

    # si no hay cover.jpg ni jpgs, usamos el full.webp recién generado
    if [[ -z "$src_cover" ]]; then src_cover="$full_out"; fi

    echo "     • cover.webp"
    encode_webp "$src_cover" "$cover_out" "$COVERW"
  fi
}

scan() {
  local PH="$1"
  echo "Escaneando: $PH"
  [[ -d "$PH" ]] || { echo "⚠️  No existe $PH"; exit 0; }

  # 1) category-first: /photos/<cat>/<creator>[/sets/*]
  local known=(lenceria fitness arte cosplay baile artistico wellness exteriores)
  for cat in "${known[@]}"; do
    [[ -d "$PH/$cat" ]] || continue
    echo "→ categoría $cat"
    for creator in "$PH/$cat"/*; do
      [[ -d "$creator" ]] || continue
      # sets/*
      if [[ -d "$creator/sets" ]]; then
        for setdir in "$creator/sets"/*; do
          [[ -d "$setdir" ]] || continue
          process_dir "$setdir"
        done
      fi
      # raíz del creador
      process_dir "$creator"
    done
  done

  # 2) creator-first: /photos/<creator>[/sets/*]
  for creator in "$PH"/*; do
    [[ -d "$creator" ]] || continue
    # si es una de las categorías, ya lo cubrimos arriba
    case "$(basename "$creator")" in
      lenceria|fitness|arte|cosplay|baile|artistico|wellness|exteriores) continue;;
    esac
    # sets/*
    if [[ -d "$creator/sets" ]]; then
      for setdir in "$creator/sets"/*; do
        [[ -d "$setdir" ]] || continue
        process_dir "$setdir"
      done
    fi
    # raíz del creador
    process_dir "$creator"
  done
}

main() {
  need cwebp
  echo "normalize-photos.sh"
  echo "ROOT   : $ROOT"
  echo "PHOTOS : $PHOTOS"
  echo "MAXW   : $MAXW  | COVERW: $COVERW  | QUAL: $QUAL  | FORCE: $FORCE"
  scan "$PHOTOS"
  echo "✔️  Listo. Ahora ejecuta: npm run gen"
}
main "$@"
