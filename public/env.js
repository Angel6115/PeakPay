// public/env.js  —  GLOBAL FRONTEND CONFIG (safe/public)
// ✳️ Funciona igual en localhost y en producción.

// public/env.js — configuración pública global
(function () {
    const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  
    // normaliza bases: añade protocolo si pasas "host:puerto"
    function normBase(u) {
      if (!u) return '';
      let base = String(u).trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(base)) return base;
      // si vino como "localhost:5173" → añade protocolo actual
      return location.protocol + '//' + base;
    }
  
    // ⚠️ Rellena tus valores reales:
    const SB_URL  = 'https://luwturhbcavwbbewnjie.supabase.co';
    const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1d3R1cmhiY2F2d2JiZXduamllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzY0MjEsImV4cCI6MjA3NDIxMjQyMX0.ccfZhXPKG8rjixSbb_jYpckkuvZB_75FbpLMPwIKdgw'; // anon public key
  
    const PRICE_USER    = 'price_1SK1YZKPt4ewb3uR35YsxudK'; // $9.99
    const PRICE_CREATOR = 'price_1SK1dlKPt4ewb3uRAVun9zhH'; // $4.99
  
    // base por defecto ('' en local, dominio en prod)
    const DEFAULT_BASE = isLocal ? '' : 'https://peek-pay.com';
  
    // permite override por query ?api=
    const qApi = new URLSearchParams(location.search).get('api');
    const apiBase = qApi ? normBase(qApi) : DEFAULT_BASE; // '' en local
  
    window.PP_ENV = Object.freeze({
      sb_url: SB_URL,
      sb_anon: SB_ANON,
      api_base: apiBase,
      price_user: PRICE_USER,
      price_creator: PRICE_CREATOR,
    });
  })();
  