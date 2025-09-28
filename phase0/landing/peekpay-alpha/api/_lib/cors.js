// Permite peticiones desde Vite (5173) y desde cualquier origen en dev.
const ALLOW_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    '*' // si prefieres restringir, quita este y deja solo los de arriba
  ];
  
  export function withCORS(req, res) {
    // elige el origin permitido
    const origin = req.headers.origin || '';
    const allowOrigin = ALLOW_ORIGINS.includes('*') ? '*' :
      (ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0]);
  
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PP-UID');
    res.setHeader('Access-Control-Max-Age', '86400');
  
    // Preflight
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true; // ya respondimos
    }
    return false; // continuar
  }
  