/**
 * Sanitização HTML — anti-XSS
 *
 * Uso: importar `escHtml` em qualquer arquivo que insira dados do banco
 * em HTML (templates de email, páginas de landing, scripts inline).
 *
 * escHtml — 5 caracteres HTML perigosos: & < > " '
 * escJs   — caracteres perigosos em strings JavaScript inline
 */

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function escJs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\x3c")
    .replace(/>/g, "\\x3e")
    .replace(/\n/g, "\\n")
}
