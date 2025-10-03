// public/_header.js
// - Router local: reescribe /x -> /public/x en localhost:5173 (sin loops)
// - Cliente Supabase singleton (window.__SB y alias window.sb)
// - Botón Entrar/Salir fijo (esquina superior derecha)
// - Botón "Volver al perfil" en creators.html y categories.html
// - FIX: resolver ?return= y rutas relativas usando location.href (no origin)

(function () {
    /* ================= Router local -> /public (solo en Vite localhost:5173) ================= */
    try {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const isVite = isLocal && location.port === '5173';
      const needsPublic =
        isVite &&
        !location.pathname.startsWith('/public') &&
        !(location.pathname === '/' || location.pathname === '');
      if (needsPublic) {
        const to = '/public' + location.pathname + location.search + location.hash;
        if (!sessionStorage.getItem('__pp_routed')) {
          sessionStorage.setItem('__pp_routed', '1');
          location.replace(to);
          return;
        }
      } else {
        sessionStorage.removeItem('__pp_routed');
      }
    } catch {}
  
    /* ================= Carga "entorno" desde localStorage ================= */
    const PP_ENV = {
      api_base: (localStorage.getItem('pp_api_base') || '').replace(/\/+$/, ''),
      sb_url: localStorage.getItem('sb_url') || '',
      sb_anon: localStorage.getItem('sb_anon') || ''
    };
    window.PP_ENV = Object.assign(window.PP_ENV || {}, PP_ENV);
  
    /* ================= Supabase singleton =================
       Requiere <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    =================================================================== */
    const hasCreds = !!(PP_ENV.sb_url && PP_ENV.sb_anon);
    const supaLib = window.supabase;
  
    if (hasCreds && supaLib?.createClient) {
      if (!window.__SB) {
        try {
          const auth = {
            persistSession: true,
            storageKey: 'pp-auth',
            autoRefreshToken: true
          };
          window.__SB = supaLib.createClient(PP_ENV.sb_url, PP_ENV.sb_anon, { auth });
          console.log('[peekpay] Supabase client inicializado');
        } catch (e) {
          console.warn('[peekpay] No se pudo crear el cliente Supabase:', e);
        }
      }
      window.sb = window.__SB || window.sb || null;
    } else {
      console.warn('[peekpay] Supabase no configurado (local/demo).');
      window.sb = null;
    }
  
    /* ================= Utilidades ================= */
    function safeDecode(x) {
      let s = x || '';
      try { s = decodeURIComponent(s); } catch {}
      try { s = decodeURIComponent(s); } catch {}
      return (s || '').trim();
    }
  
    // ⚠️ Usa location.href como base (no origin) para respetar /public/...
    function resolveTarget(pathLike, fallback) {
      if (!pathLike) return fallback;
      try {
        const u = new URL(pathLike, location.href);
        // no permitir salir del mismo origen
        if (u.origin !== location.origin) return fallback;
        return u.pathname + u.search + u.hash;
      } catch {
        return fallback;
      }
    }
  
    function getReturnTarget(defaultRelative) {
      const url = new URL(location.href);
      const retRaw = url.searchParams.get('return');
      const def = resolveTarget(defaultRelative, defaultRelative);
      if (!retRaw) return def;
      const ret = safeDecode(retRaw);
      return resolveTarget(ret, def);
    }
  
    /* ================= UI: Botón Entrar/Salir ================= */
    function mountAuthUI() {
      if (document.getElementById('pp-authbar')) return;
  
      const bar = document.createElement('div');
      bar.id = 'pp-authbar';
      Object.assign(bar.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: '9999',
        fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Arial,sans-serif'
      });
  
      const btn = document.createElement('button');
      Object.assign(btn.style, {
        border: '1px solid #c7d2fe',
        background: '#eef2ff',
        color: '#1e1b4b',
        padding: '6px 10px',
        fontSize: '12px',
        borderRadius: '999px',
        cursor: 'pointer',
        boxShadow: '0 6px 12px rgba(79,70,229,.10)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px'
      });
  
      const avatar = document.createElement('img');
      avatar.alt = 'avatar';
      avatar.width = 18;
      avatar.height = 18;
      Object.assign(avatar.style, {
        borderRadius: '999px',
        border: '1px solid rgba(0,0,0,.06)',
        display: 'none'
      });
  
      const txt = document.createElement('span');
  
      btn.appendChild(avatar);
      btn.appendChild(txt);
      bar.appendChild(btn);
      document.body.appendChild(bar);
  
      const sb = window.sb;
  
      async function refresh() {
        const isProfile =
          location.pathname.endsWith('/profile.html') || location.pathname === '/public/profile.html';
  
        if (!sb) {
          txt.textContent = 'Entrar';
          btn.title = 'Entrar';
          btn.onclick = () => (location.href = './auth-signup.html');
          avatar.style.display = 'none';
          bar.style.display = 'block';
          return;
        }
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (!session) {
            txt.textContent = 'Entrar';
            btn.title = 'Entrar';
            btn.onclick = () => (location.href = './auth-signup.html');
            avatar.style.display = 'none';
            bar.style.display = 'block';
          } else {
            if (isProfile) {
              bar.style.display = 'none'; // ocultar en el perfil con sesión activa
              return;
            }
            const name = session.user.user_metadata?.name || session.user.email || 'Cuenta';
            const pic = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '';
            txt.textContent = name.length > 22 ? name.slice(0, 21) + '…' : name;
            if (pic) { avatar.src = pic; avatar.style.display = 'inline-block'; } else { avatar.style.display = 'none'; }
            btn.title = 'Salir';
            btn.onclick = async () => {
              try { await sb.auth.signOut(); } catch {}
              location.reload();
            };
            bar.style.display = 'block';
          }
        } catch (e) {
          console.warn('[peekpay] auth refresh error', e);
          txt.textContent = 'Entrar';
          btn.title = 'Entrar';
          btn.onclick = () => (location.href = './auth-signup.html');
          avatar.style.display = 'none';
          bar.style.display = 'block';
        }
      }
  
      refresh();
      setInterval(refresh, 60_000);
      window.addEventListener('focus', () => setTimeout(refresh, 300));
    }
  
    /* ================= UI: Botón "Volver al perfil" ================= */
    function mountBackUI() {
      const path = location.pathname;
      const wantBack =
        path.endsWith('/creators.html') ||
        path.endsWith('/categories.html');
  
      if (!wantBack) return;
      if (document.getElementById('pp-backbar')) return;
  
      const backBar = document.createElement('div');
      backBar.id = 'pp-backbar';
      Object.assign(backBar.style, {
        position: 'fixed',
        top: '10px',
        left: '10px',
        zIndex: '9999',
        fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,Inter,Ubuntu,Arial,sans-serif'
      });
  
      const backBtn = document.createElement('a');
      backBtn.textContent = 'Volver al perfil';
      backBtn.href = '#';
      Object.assign(backBtn.style, {
        border: '1px solid #c7d2fe',
        background: '#eef2ff',
        color: '#1e1b4b',
        padding: '6px 10px',
        fontSize: '12px',
        borderRadius: '999px',
        textDecoration: 'none',
        boxShadow: '0 6px 12px rgba(79,70,229,.10)'
      });
  
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Por defecto siempre /public/profile.html (usando ruta relativa para heredar /public/)
        const target = getReturnTarget('./profile.html');
        const here = location.pathname + location.search + location.hash;
        if (target === here) {
          location.href = './profile.html';
        } else {
          location.href = target;
        }
      });
  
      backBar.appendChild(backBtn);
      document.body.appendChild(backBar);
    }
  
    /* ================= Mount ================= */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        mountAuthUI();
        mountBackUI();
      });
    } else {
      mountAuthUI();
      mountBackUI();
    }
  })();
  