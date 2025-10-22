# PeakPay
Mecánica de mosaicos + gamificación. 
Fase 0 = audiencia primero (SFW). 
Fase 1 = MVP web (pagos adult-friendly, age-gate, moderación).
# PeekPay (frontend estático)

Interfaz estática (HTML + JS + CSS) que usa **Supabase** para autenticación (Magic Link) y Storage (avatares).  
Pensado para desarrollo local con Vite y **deploy 100% estático en Vercel**.

## Estructura

.
├─ public/
│ ├─ index.html
│ ├─ profile.html
│ ├─ wallet.html
│ ├─ creators.html
│ ├─ categories.html
│ ├─ notifications.html
│ ├─ settings.html
│ ├─ auth-signup.html
│ ├─ auth-callback.html
│ ├─ _header.js
│ ├─ styles.min.css
│ ├─ peak1.png
│ └─ ...otros assets
├─ package.json (scripts de dev opcional con Vite)
├─ vercel.json (rutas para servir /public en Vercel)
└─ README.md

> **Nota**: Todo vive en `public/`. En Vercel lo servimos como un sitio estático, sin SSR.

---

## Requisitos

- Node 18+ (para el dev server opcional).
- Una instancia de **Supabase** con:
  - Auth habilitado (email magic link).
  - Bucket `avatars` **público** (o con política pública de lectura).
  - Tabla `profiles` (id uuid PK, email text, name text, handle text único, avatar_url text).
  - (Opcional) Vistas usadas por el demo: `v_user_wallet`, `v_wallet_activity_recent`, etc.

### Variables de entorno (par de claves públicas)

Este frontend **no necesita servidor**. El cliente de Supabase se configura en el navegador leyendo:

- `sb_url`
- `sb_anon`

> En desarrollo las guardamos en **localStorage** y `_header.js` las recoge automáticamente.  
> En producción en Vercel puedes **inyectarlas en build** (opcional) o **dejar un archivo `_env.js`** con esos valores públicos.

---

## Arranque local (con Vite)

1. Instala dependencias:

```bash
npm i

