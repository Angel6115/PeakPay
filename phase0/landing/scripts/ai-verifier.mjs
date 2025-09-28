// scripts/ai-verifier.mjs
// Verificador ligero: calcula score 0-100 y da "verdict" + razones.

function yearsFrom(dobStr){
    if(!dobStr) return 0;
    const dob = new Date(dobStr);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }
  
  function tokenMatch(a='', b=''){
    const A = a.toLowerCase().split(/\s+/).filter(Boolean);
    const B = b.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = A.filter(t => B.includes(t)).length;
    return A.length ? hit / A.length : 0;
  }
  
  export function verifyApplication(app){
    // app: JSON con lo que envía el onboarding (nombre, dob, selfie, idFront, idBack, etc.)
    const reasons = [];
    let score = 50; // baseline
    const checks = {};
  
    // 1) Edad
    const age = yearsFrom(app?.identity?.dob);
    checks.age = age;
    if (age >= 18) { score += 15; }
    else { score = 0; reasons.push('Menor de edad'); }
  
    // 2) Documentos
    const hasFront = !!app?.identity?.idFrontUrl;
    const hasBack  = !!app?.identity?.idBackUrl;
    const hasSelf  = !!app?.identity?.selfieUrl;
    checks.docs = { hasFront, hasBack, hasSelf };
  
    if (hasFront) score += 8; else reasons.push('Falta ID (frontal)');
    if (hasBack)  score += 6; else reasons.push('Falta ID (reverso)');
    if (hasSelf)  score += 10; else reasons.push('Falta selfie');
  
    // 3) Nombre declarado vs documento (si lo capturas)
    const declaredName = app?.profile?.fullName || '';
    const idName       = app?.identity?.idName   || declaredName; // fallback
    const nameSim = tokenMatch(declaredName, idName);
    checks.nameSimilarity = nameSim;
    if (nameSim >= 0.6) score += 6; else reasons.push('Nombre declarado no coincide con documento');
  
    // 4) Contacto
    const email = app?.contact?.email || '';
    const phone = app?.contact?.phone || '';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const phoneOk = phone.replace(/\D/g,'').length >= 8;
    checks.contact = { emailOk, phoneOk };
  
    if (emailOk) score += 3; else reasons.push('Email inválido');
    if (phoneOk) score += 3; else reasons.push('Teléfono inválido');
  
    // 5) Pago
    const payout = app?.payout || {};
    const hasPayout = !!(payout.stripe || payout.iban || payout.paypal);
    checks.payout = { hasPayout, method: payout.stripe ? 'stripe' : payout.iban ? 'iban' : payout.paypal ? 'paypal' : 'none' };
    if (hasPayout) score += 6; else reasons.push('Método de pago incompleto');
  
    // 6) Sociales / señales públicas
    const socials = (app?.profile?.socials || []).filter(Boolean);
    checks.socialsCount = socials.length;
    if (socials.length >= 2) score += 5;
    else reasons.push('Sin suficientes redes sociales');
  
    // 7) Términos
    const termsOk = !!app?.consents?.termsAccepted;
    checks.termsAccepted = termsOk;
    if (termsOk) score += 3; else reasons.push('No aceptó Términos');
  
    // Clamp
    score = Math.max(0, Math.min(100, score));
  
    // 8) Veredicto
    let verdict = 'review';
    if (score >= 85 && age >= 18 && hasFront && hasBack && hasSelf && hasPayout && termsOk) verdict = 'auto_approve';
    if (score < 50 || age < 18) verdict = 'reject';
  
    return { score, verdict, reasons, checks };
  }
  