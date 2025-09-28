==== INICIO ====

PeekPay — Checklist de Regresión (API + Wallet + Peek)

Guía corta para verificar que Wallet y Peek están sincronizados y que el API local funciona en modo demo (memoria).

0) Entorno

.env (API):

PORT=4000

STATIC_BASE=http://localhost:5173

ASSET_PREFIX=photos/arte

LEGACY_API_BASE= (vacío para modo demo)

Front servido en http://localhost:5173 (carpeta public).

1) API viva y limpia
# matar colgados en :4000 y levantar API
lsof -i :4000 -nP | grep LISTEN && kill -9 <PID> || true
node /Users/macmini/Desktop/PeakPay/api/index.js
# esperado: [api] listening on :4000 (no proxy)


Health:

curl -s http://localhost:4000/api/health | jq .
# => { "ok": true }


Rutas:

curl -s http://localhost:4000/__routes | sed -n '1,200p'
# Debe listar:
# /api/credits/balance, /api/credits/points, /api/credits/history,
# /api/credits/topup, /api/unlock, /api/sets/signed-full

2) Créditos / Historial (API directa)
curl -s http://localhost:4000/api/credits/balance | jq .
# => { ok:true, credits:<n>, points:<m>, ... }

curl -s -XPOST "http://localhost:4000/api/credits/topup?pack=5" | jq .
# => ok:true, credits: +20, points: +1, added:20, usd:5

curl -s http://localhost:4000/api/credits/history | jq .
# => items[0].type === "topup" con label/credits_delta válidos

3) CORS / Preflight

En Network (navegador):

Respuesta de http://localhost:4000/... debe incluir
Access-Control-Allow-Origin: http://localhost:5173 y Vary: Origin.

Si no: confirmar que el origin del front es 5173 y revisar middleware CORS del API.

4) Wallet (UI)

Abrir http://localhost:5173/wallet.html?return=./peek.html.

Debe mostrar:

Peak Credits (cr) y ≈ $X.XX

Puntos y Racha

Click en $10 → +50 créditos:

Mensaje: Recarga exitosa: +50 cr ($10.00)

Badge superior actualiza balance

Historial agrega fila Recarga · Pack $10.00 · +50 cr (sin undefined)

Bono diario:

Suma +1 punto y deshabilita botón (si ya reclamado)

Debug localStorage (consola):

localStorage.getItem('pp_api_base') // "http://localhost:4000"
localStorage.getItem('pp_uid')      // "test-user-123" (o tu UID)

5) Peek (UI)

Abrir http://localhost:5173/peek.html?creator=ink-aria&s=set-01.

Top bar muestra Peak Credits real (no 0).

Desbloquear 1 celda:

Con crédito: descuenta -1 cr al instante, sube progreso

Sin crédito: hint “Faltan X créditos” y link a Wallet

Pack 3 abre 3 celdas si hay saldo; el progreso sube.

Ver saldo desde consola de Peek:

fetch('http://localhost:4000/api/credits/balance', { headers:{'X-PP-UID': localStorage.getItem('pp_uid')}})
  .then(r=>r.json()).then(console.log);

6) Sincronización Peek ↔ Wallet

Topup en Wallet → Peek ve el nuevo crédito (auto-refresh o refrescar pestaña).

Desbloqueo en Peek → Wallet muestra Desbloqueo 1 celda −1 cr en historial.

7) Imagen firmada (preview)
curl -s "http://localhost:4000/api/sets/signed-full?id=697dc6d3-4008-4221-8259-4a7779c2a0ea" | jq .
# => { ok:true, url:"http://localhost:5173/photos/arte/ink-aria/sets/set-01/full.jpg", ... }


Con datos locales, asegúrate de tener:

public/photos/ink-aria/sets/set-01/full.jpg

8) Reseteos seguros (solo UI)

Para limpiar residuos del navegador sin perder UID ni base:

localStorage.removeItem('pp_demo_balance');
localStorage.removeItem('pp_credits_v1');
localStorage.removeItem('pp_points');
localStorage.removeItem('pp_streak_days');
localStorage.removeItem('pp_streak_last_claim_date');
// Mantener: 'pp_uid' y 'pp_api_base'

9) Criterios de Aprobación (Go/No-Go)

/api/credits/topup devuelve { ok, credits, points, added, usd } (sin undefined)

Wallet:

Topup refleja en badge y en historial inmediatamente

Bono diario suma puntos y deshabilita botón

Peek:

Muestra Peak Credits real

Desbloquear descuenta 1 cr y sube progreso

Historial:

Entradas con labels legibles y credits_delta correcto

CORS correcto desde localhost:5173
==== FIN ====
