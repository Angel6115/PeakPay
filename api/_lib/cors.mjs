export function withCORS(req, res) {
  const origin = req.headers.origin || '';
  let allow = '*';
  try {
    const h = new URL(origin).hostname || '';
    // Permite tu dominio de producción y cualquier preview *.vercel.app
    if (
      origin === 'https://peak-pay.vercel.app' ||
      /\.vercel\.app$/.test(h)
    ) {
      allow = origin;
    }
  } catch { /* ignore */ }

  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // petición preflight resuelta aquí
  }
  return false;
}
