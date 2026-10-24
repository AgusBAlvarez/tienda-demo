/* ===== UTILS COMPARTIDOS ===== */

/**
 * Escapa caracteres HTML para prevenir XSS.
 * Uso: en TODOS los templates que rendericen datos del usuario.
 */
export const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));