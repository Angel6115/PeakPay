// Mientras la plataforma no esté lanzada (/api/platform-status):
//  - Visitante SIN sesión (nunca se ha registrado) -> a registrarse
//    (signup.html), no a la sala de espera (esa dice "ya estás
//    registrado", que sería falso para alguien que ni cuenta tiene).
//  - Con sesión pero no admin -> waiting-room.html (correcto, esa
//    persona sí está registrada, solo que la plataforma no está lanzada).
//  - Cuenta is_admin -> ve todo con normalidad, sin redirección.
// Se incluye en las páginas donde se "usa" la plataforma de verdad
// (explorar, desbloquear, wallet, dashboards de creadora, etc.), no en
// index/login/signup ni admin.
//
// IMPORTANTE: nunca crea su propio cliente de Supabase. Cada página ya
// tiene el suyo, y crear uno segundo con el mismo storageKey ('pp-auth')
// dispara la advertencia de Supabase "Multiple GoTrueClient instances...
// undefined behavior" — en la práctica eso se vio como la página
// quedándose en blanco con fetchBalance reintentando sin parar. En vez
// de eso, lee el token directo de localStorage (así es como Supabase lo
// guarda con storageKey:'pp-auth') y pregunta a /api/whoami si es admin.
//
// También oculta <html> de inmediato (antes de que el script propio de
// la página pinte contenido real) y solo lo revela si de verdad hay que
// mostrar la página. Ante CUALQUIER falla o duda (red lenta, endpoint
// caído, etc.) se falla CERRADO — se manda a signup/waiting-room en vez
// de revelar la página — porque mostrar contenido real de más es el
// error que de verdad importa evitar aquí; un falso bloqueo momentáneo
// es mucho menos grave.
document.documentElement.style.visibility = 'hidden';

function ppRevealPage() {
  document.documentElement.style.visibility = '';
}

function ppGetAccessToken() {
  try {
    const raw = localStorage.getItem('pp-auth');
    if (!raw) return null;
    return JSON.parse(raw)?.access_token || null;
  } catch (e) {
    return null;
  }
}

function ppFailClosed() {
  location.replace(ppGetAccessToken() ? './waiting-room.html' : './signup.html');
}

(async function () {
  let j;
  try {
    const r = await fetch('/api/platform-status', { cache: 'no-store' });
    j = await r.json();
  } catch (e) {
    ppFailClosed();
    return;
  }

  if (!j || typeof j.launched !== 'boolean') { ppFailClosed(); return; }
  if (j.launched) { ppRevealPage(); return; }

  const token = ppGetAccessToken();
  if (!token) { location.replace('./signup.html'); return; } // nunca se ha registrado

  try {
    const who = await fetch('/api/whoami', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).then(res => res.json());

    if (who?.is_admin) { ppRevealPage(); return; } // admin exento
  } catch (e) {
    // no se pudo confirmar admin -> asumimos que no lo es
  }

  location.replace('./waiting-room.html'); // registrado, pero la plataforma no está lanzada
})();
