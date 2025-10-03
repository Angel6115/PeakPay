// public/_header.js
// PeekPay header boot
// - Router local: / -> /public/* sólo en localhost:5173 (sin bucles)
// - Carga de entorno: combina window.PP_ENV (env.js) + localStorage sin mutar el freeze()
// - Supabase singleton: window.__SB y alias window.sb
// - Barra Auth fija “Entrar / Salir”
// - Util para manejar ?return= en botones Volver

(function () {
    /* ================ Router local → /public (sólo en Vite 5173) ================ */
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
  
    /* ==================== Entorno: NO mutar window.PP_ENV ==================== */
    // 1) Lee lo que expone env.js (puede no existir)
    const FROM_ENV = (function () {
      try { return window.PP_ENV || {}; } catch { return {}; }
    })();
  
    // 2) Overlay con valores de localStorage (opcionales para depurar)
    const LS = {
      api_base: (localStorage.getItem('pp_api_base') || '').replace(/\/+$/, ''),
      sb_url: localStorage.getItem('sb_url') || undefined,
      sb_anon: localStorage.getItem('sb_anon') || undefined,
    };
  
    // 3) Mezcla INMUTABLE sin tocar el objeto freeze() original
    const MERGED_ENV = Object.freeze({
      api_base: LS.api_base || FROM_ENV.api_base || '',
      sb_url:   LS.sb_url   || FROM_ENV.sb_url   || '',
      sb_anon:  LS.sb_anon  || FROM_ENV.sb_anon  || '',
    });
  
    // Publica un objeto nuevo (no el original) para que el resto del código lea de aquí
    window.PP_ENV = MERGED_ENV;
  
    /* ==================== Supabase singleton ==================== */
    const supaLib = window.supabase; // CDN @supabase/supabase-js
    const hasCreds = !!(MERGED_ENV.sb_url && MERGED_ENV.sb_anon);
  
    if (hasCreds && supaLib?.createClient) {
      if (!window.__SB) {
        try {
          const auth = {
            persistSession: true,
            storageKey: 'pp-auth',
            autoRefreshToken: true,
            detectSessionInUrl: true,
          };
          window.__SB = supaLib.createClient(MERGED_ENV.sb_url, MERGED_ENV.sb_anon, { auth });
          console.log('[peekpay] Supabase client inicializado');
        } catch (e) {
          console.warn('[peekpay] No se pudo crear el cliente Supabase:', e);
        }
      }
      window.sb = window.__SB || null;
    } else {
      console.warn('[peekpay] Supabase no configurado (local/demo).');
      window.sb = null;
    }
  
    /* ==================== Util: back con ?return= ==================== */
    // Devuelve la URL a la que “volver” si existe ?return=xxx, si no, usa ./profile.html
    function getReturnHref(defaultHref) {
      try {
        const u = new URL(location.href);
        const ret = u.searchParams.get('return');
        return ret || defaultHref || './profile.html';
      } catch {
        return defaultHref || './profile.html';
      }
    }
    // Exponer helper global mínimo para botones “Volver”
    window.__pp_getReturn = getReturnHref;
  
    /* ==================== Barra Auth fija (Entrar / Salir) ==================== */
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
        if (!sb) {
          txt.textContent = 'Entrar';
          btn.title = 'Entrar';
          // Preferimos rutas relativas con .html para que funcione igual en Vercel y local
          btn.onclick = () => (location.href = './auth-signup.html');
          avatar.style.display = 'none';
          return;
        }
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (!session) {
            txt.textContent = 'Entrar';
            btn.title = 'Entrar';
            btn.onclick = () => (location.href = './auth-signup.html');
            avatar.style.display = 'none';
          } else {
            const name = session.user.user_metadata?.name || session.user.email || 'Cuenta';
            const pic =
              session.user.user_metadata?.avatar_url ||
              session.user.user_metadata?.picture ||
              '';
            txt.textContent = name.length > 22 ? name.slice(0, 21) + '…' : name;
            if (pic) {
              avatar.src = pic;
              avatar.style.display = 'inline-block';
            } else {
              avatar.style.display = 'none';
            }
            btn.title = 'Salir';
            btn.onclick = async () => {
              try { await sb.auth.signOut(); } catch {}
              const back = getReturnHref('./auth-signup.html');
              location.href = back;
            };
          }
        } catch (e) {
          console.warn('[peekpay] auth refresh error', e);
          txt.textContent = 'Entrar';
          btn.title = 'Entrar';
          btn.onclick = () => (location.href = './auth-signup.html');
          avatar.style.display = 'none';
        }
      }
  
      refresh();
      setInterval(refresh, 60_000);
      window.addEventListener('focus', () => setTimeout(refresh, 300));
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountAuthUI);
    } else {
      mountAuthUI();
    }
  })();
  