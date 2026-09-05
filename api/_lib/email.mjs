// Envío de emails transaccionales propios (no los de Supabase Auth, esos
// van por el SMTP de Brevo configurado directo en el dashboard de
// Supabase). Usa la API REST de Brevo. Si BREVO_API_KEY no está
// configurada todavía, no rompe nada — solo se salta el envío y lo deja
// en el log, para que features como el registro de creadoras sigan
// funcionando aunque el email no esté listo aún.
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'PeekPay';

  if (!apiKey || !senderEmail) {
    console.warn('[email] BREVO_API_KEY/BREVO_SENDER_EMAIL no configurados — email no enviado:', subject);
    return { ok: false, skipped: true };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      console.warn('[email] Brevo respondió error:', resp.status, detail);
      return { ok: false, error: detail };
    }

    return { ok: true };
  } catch (err) {
    console.warn('[email] Excepción enviando email:', err.message);
    return { ok: false, error: err.message };
  }
}

const LOGO_URL = 'https://luwturhbcavwbbewnjie.supabase.co/storage/v1/object/public/creator-content/branding/peekpay-logo-email.png';

// Plantilla base con el logo y el estilo minimalista del sitio (mismos
// colores que wallet.html/subscriptions.html: fondo crema, tarjeta blanca
// redondeada, botón índigo sólido). Tablas + estilos inline a propósito —
// es lo único que renderiza consistente entre clientes de correo.
function wrapEmailTemplate({ bodyHtml, ctaText, ctaUrl }) {
  const button = ctaText && ctaUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px">
      <tr><td style="border-radius:999px;background:#0732EF;">
        <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;border-radius:999px;">${ctaText} →</a>
      </td></tr>
    </table>
  ` : '';

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFAF5;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;">
      <tr><td style="padding:32px 32px 8px;text-align:center;">
        <img src="${LOGO_URL}" alt="PeekPay" width="160" style="display:inline-block;">
      </td></tr>
      <tr><td style="padding:16px 32px 32px;color:#040A3F;font-size:15px;line-height:1.65;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        ${bodyHtml}
        ${button}
      </td></tr>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">PeekPay — Unblur your curiosity</p>
  </td></tr>
</table>
  `;
}

// Bienvenida simple para un usuario comprador recién registrado (no
// creadoras — ellas ya reciben su propio flujo de aviso al aprobar/
// rechazar la aplicación).
export async function notifyUserWelcome(email) {
  const html = wrapEmailTemplate({
    bodyHtml: `
      <p style="margin:0 0 12px">¡Bienvenido a PeekPay! 🎉</p>
      <p style="margin:0">Ya quedaste registrado. Todavía estamos afinando la plataforma antes de abrirla — te avisamos por este mismo correo en cuanto esté lista para que empieces a explorar.</p>
    `,
  });

  await sendEmail({ to: email, subject: '¡Bienvenido a PeekPay! 🎉', html });
}

// Notifica a todas las cuentas is_admin cuando hay una nueva aplicación de
// creadora esperando revisión.
export async function notifyAdminsNewApplication(adminClient, creator) {
  const { data: admins } = await adminClient
    .from('profiles')
    .select('email')
    .eq('is_admin', true);

  if (!admins || !admins.length) return;

  const name = creator.display_name || creator.name || creator.handle;
  const siteOrigin = process.env.SITE_ORIGIN || 'https://peak-pay.vercel.app';

  const html = wrapEmailTemplate({
    bodyHtml: `
      <p style="margin:0 0 12px">Nueva solicitud de creadora esperando revisión:</p>
      <p style="margin:0"><strong>${name}</strong> (@${creator.handle})<br>
      Categoría: ${creator.main_category || '—'}</p>
    `,
    ctaText: 'Revisar en el panel de admin',
    ctaUrl: `${siteOrigin}/admin.html#apps`,
  });

  await Promise.all(
    admins.map(a => sendEmail({ to: a.email, subject: `Nueva creadora aplicó: @${creator.handle}`, html }))
  );
}

// Avisa a la creadora cuando su aplicación fue aprobada o rechazada.
export async function notifyCreatorReviewResult(adminClient, creatorId, approved, reason) {
  const { data: creator } = await adminClient
    .from('creators')
    .select('user_id, handle, name, display_name')
    .eq('id', creatorId)
    .maybeSingle();
  if (!creator?.user_id) return;

  const { data: profile } = await adminClient
    .from('profiles')
    .select('email')
    .eq('id', creator.user_id)
    .maybeSingle();
  if (!profile?.email) return;

  const name = creator.display_name || creator.name || creator.handle;
  const siteOrigin = process.env.SITE_ORIGIN || 'https://peak-pay.vercel.app';

  const subject = approved
    ? '¡Tu solicitud en PeekPay fue aprobada! 🎉'
    : 'Actualización sobre tu solicitud en PeekPay';

  const html = approved
    ? wrapEmailTemplate({
        bodyHtml: `
          <p style="margin:0 0 12px">Hola ${name},</p>
          <p style="margin:0"><strong>¡Buenas noticias!</strong> Revisamos tus fotos de muestra y tu perfil ya está aprobado — ya eres visible públicamente en PeekPay.</p>
        `,
        ctaText: 'Entra a tu dashboard',
        ctaUrl: `${siteOrigin}/creator-dashboard.html`,
      })
    : wrapEmailTemplate({
        bodyHtml: `
          <p style="margin:0 0 12px">Hola ${name},</p>
          <p style="margin:0 0 12px">Revisamos tu solicitud y por ahora no la pudimos aprobar.${reason ? ` Motivo: <strong>${reason}</strong>` : ''}</p>
          <p style="margin:0">Si crees que fue un error o quieres volver a intentarlo, escríbenos respondiendo este correo.</p>
        `,
      });

  await sendEmail({ to: profile.email, subject, html });
}
