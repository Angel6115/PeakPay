# PeekPay — WORKLOG

Formato:
- Fecha (local) — Autor — Resumen
- Detalle de tareas (bullets)

---

- 2025-09-26 19:09 AST — macmini — Debug integral de API + Wallet + Peek
  - Normalizamos .env (STATIC_BASE sin /public; LEGACY_API_BASE vacía)
  - Levantamos front en :5173 y API en :4000; matamos procesos colgados
  - Arreglo endpoints /api/credits (balance/topup/history/points/streak)
  - Sincronizamos wallet.html ↔︎ peek.html (auto-refresh y UI de saldo)
  - Checklist docs/README_regresion.md creado

