/* ===== UTILS COMPARTIDOS ===== */

/**
 * Escapa caracteres HTML para prevenir XSS.
 * Uso: en TODOS los templates que rendericen datos del usuario.
 */
export const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/**
 * Valida que una URL sea http(s). Devuelve "" si no lo es.
 * Uso: antes de meterla en href, img.src o window.open.
 */
export function urlSegura(url) {
  try {
    const u = new URL(url, window.location.origin);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
  } catch {
    return "";
  }
}