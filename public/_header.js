// /_header.js
// Header consciente de sesión para PeekPay
// Requiere: /js/auth-client.js cargado antes (define window.Auth)

(function () {
    // Crea el contenedor si no existe
    function ensureShell() {
      let el = document.querySelector('header[data-pp="shell"]');
      if (!el) {
        el = document.createElement('header');
        el.setAttribute('data-pp', 'shell');
        el.style.display = 'block';
        // Inserta al inicio del body
        document.body.insertBefore(el, document.body.firstChild);
      }
      return el;
    }
  
    // Marca la ruta activa
    function isActive(href) {
      try {
        const here = location.pathname.replace(/\/+$/, '') || '/';
        const there = new URL(href, location.origin).pathname.replace(/\/+$/, '') || '/';
        return here === there;
      } catch {
        return false;
      }
    }
  
    // Construye el HTML del header según la sesión
    function renderHeader(session) {
      const nextParam = encodeURIComponent(location.pathname + location.search + location.hash);
      const authed = !!session;
  
      const linksPublic = `
        <nav class="pp-nav">
          <a href="/" class="${isActive('/') ? 'active' : ''}">Inicio</a>
          <a href="/categories" class="${isActive('/categories') ? 'active' : ''}">Categorías</a>
          <a href="/creators" class="${isActive('/creators') ? 'active' : ''}">Creadores</a>
        </nav>
      `;
  
      const authRight = authed
        ? `
          <nav class="pp-auth">
            <a href="/wallet" class="${isActive('/wallet') ? 'active' : ''}">Wallet</a>
            <a href="/profile" class="${isActive('/profile') ? 'active' : ''}">Perfil</a>
            <button id="pp-logout" type="button" class="pp-btn-logout" aria-label="Salir">Salir</button>
          </nav>
        `
        : `
          <nav class="pp-auth">
            <a href="/login?next=${nextParam}" class="${isActive('/login') ? 'active' : ''}">Entrar</a>
            <a href="/signup" class="pp-btn-cta ${isActive('/signup') ? 'active' : ''}">Crear cuenta</a>
          </nav>
        `;
  
      return `
        <div class="pp-wrap">
          <a class="pp-brand" href="/" aria-label="PeekPay inicio">
            <span class="pp-logo-dot"></span>
            <span class="pp-brand-text">PeekPay</span>
          </a>
          ${linksPublic}
          ${authRight}
        </div>
        <style>
          /* Estilos mínimos para no depender de páginas */
          header[data-pp="shell"] { 
            position: sticky; top: 0; z-index: 50;
            background: #ffffff; border-bottom: 1px solid #e5e7eb;
          }
          header[data-pp="shell"] .pp-wrap {
            max-width: 1080px; margin: 0 auto; padding: 10px 16px;
            display: flex; align-items: center; gap: 12px; justify-content: space-between;
          }
          .pp-brand { display:flex; align-items:center; gap:8px; text-decoration:none; color:#0b1020; font-weight:700 }
          .pp-logo-dot { width:10px; height:10px; border-radius:999px; background: linear-gradient(90deg,#4f46e5,#2563eb); display:inline-block }
          .pp-brand-text { font-size: 15px }
          .pp-nav, .pp-auth { display:flex; align-items:center; gap:12px; }
          .pp-nav a, .pp-auth a { text-decoration:none; color:#0b1020; padding:8px 10px; border-radius:10px; border:1px solid transparent; }
          .pp-nav a.active, .pp-auth a.active { background:#f8fafc; border-color:#e5e7eb; }
          .pp-btn-cta { background: linear-gradient(90deg,#4f46e5,#2563eb); color:#fff !important; }
          .pp-btn-logout {
            border:1px solid #e5e7eb; background:#fff; color:#0b1020; 
            padding:8px 10px; border-radius:10px; cursor:pointer;
          }
          @media (max-width:720px){
            .pp-nav { display:none; } /* Simplificar en móviles */
          }
        </style>
      `;
    }
  
    async function mount() {
      const shell = ensureShell();
  
      // Si no hay Auth, renderiza versión pública básica
      if (!window.Auth || !Auth.getSession || !Auth.onChange) {
        shell.innerHTML = renderHeader(null);
        // Sin listeners (no hay logout si no está Auth)
        return;
      }
  
      // Primera pintura
      const ses = await Auth.getSession().catch(() => null);
      shell.innerHTML = renderHeader(ses);
  
      // Wire logout si existe el botón
      function wireLogout() {
        const btn = document.getElementById('pp-logout');
        if (btn) btn.onclick = () => Auth.logout();
      }
      wireLogout();
  
      // Re-render en cambios de sesión
      Auth.onChange((session) => {
        shell.innerHTML = renderHeader(session);
        wireLogout();
      });
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount);
    } else {
      mount();
    }
  })();
  