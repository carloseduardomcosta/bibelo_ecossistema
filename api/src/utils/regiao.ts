// Detecção de região geográfica para personalização de e-mails
// Prioridade: estado (UF) → DDD do telefone → GeoIP region → null

export type Regiao = "sul_sudeste" | "outras" | null;

// UFs das regiões Sul e Sudeste
const ESTADOS_SUL_SUDESTE = new Set([
  "SC", "RS", "PR",        // Sul
  "SP", "RJ", "ES", "MG", // Sudeste
]);

// DDDs exclusivos de Sul e Sudeste
const DDD_SUL_SUDESTE = new Set([
  41, 42, 43, 44, 45, 46, // PR
  47, 48, 49,              // SC
  51, 53, 54, 55,          // RS
  11, 12, 13, 14, 15, 16, 17, 18, 19, // SP
  21, 22, 24,              // RJ
  27, 28,                  // ES
  31, 32, 33, 34, 35, 37, 38, // MG
]);

/**
 * Detecta a região do cliente a partir de dados disponíveis.
 * Retorna null quando não há dados suficientes para determinar a região.
 *
 * Ordem de prioridade: estado (UF) → DDD do telefone → GeoIP region
 */
export function detectarRegiao(opts: {
  estado?: string | null;
  telefone?: string | null;
  geoRegion?: string | null;
}): Regiao {
  // 1. Estado (UF) — mais confiável
  if (opts.estado) {
    const uf = opts.estado.toUpperCase().trim();
    if (ESTADOS_SUL_SUDESTE.has(uf)) return "sul_sudeste";
    if (uf.length === 2) return "outras"; // UF válida mas não Sul/SE
  }

  // 2. DDD extraído do telefone
  if (opts.telefone) {
    const digits = opts.telefone.replace(/\D/g, "");
    let ddd: number | null = null;

    if (digits.length >= 12 && digits.startsWith("55")) {
      // Com código de país (+55): ex. 5547999999999
      ddd = parseInt(digits.substring(2, 4), 10);
    } else if (digits.length >= 10) {
      // Sem código de país: ex. 47999999999
      ddd = parseInt(digits.substring(0, 2), 10);
    }

    if (ddd !== null && ddd >= 11 && ddd <= 99) {
      if (DDD_SUL_SUDESTE.has(ddd)) return "sul_sudeste";
      return "outras";
    }
  }

  // 3. GeoIP region (sigla da UF retornada pelo geoip-lite)
  if (opts.geoRegion) {
    const uf = opts.geoRegion.toUpperCase().trim();
    if (ESTADOS_SUL_SUDESTE.has(uf)) return "sul_sudeste";
    if (uf.length === 2) return "outras";
  }

  return null; // região indeterminada
}

// ── Blocos HTML para e-mails ───────────────────────────────────

/**
 * Conteúdo interno do banner amarelo de frete (apenas o <p>).
 * Usado dentro do div amarelo nos templates de fluxo.
 * null = região desconhecida → exibe Sul/SE (maioria dos clientes é da região).
 */
export function bannerFretep(regiao: Regiao): string {
  if (regiao === "outras") {
    return `<p style="font-size:13px;color:#333;margin:0;font-weight:600;">📦 Entregamos para todo o Brasil!</p>`;
  }
  return `<p style="font-size:13px;color:#333;margin:0;font-weight:600;">🚚 Frete grátis para Sul e Sudeste acima de R$ 79!</p>`;
}

/**
 * Item de lista de benefícios em listas de vantagens (emails de verificação, páginas de confirmação).
 * Parâmetro style define o CSS inline do elemento <p>.
 */
export function itemFreteHtml(
  regiao: Regiao,
  style = "margin:0 0 6px;font-size:13px;color:#555;"
): string {
  if (regiao === "outras") {
    return `<p style="${style}">📦 Entregamos para todo o Brasil</p>`;
  }
  return `<p style="${style}">🚚 Frete grátis Sul/Sudeste acima de R$79</p>`;
}

/**
 * Texto de frete para uso inline dentro de um <p> maior (separado por <br/>).
 * Usado nos templates VIP onde o frete aparece como parte de um bloco de texto corrido.
 */
export function textoFreteInline(regiao: Regiao): string {
  if (regiao === "outras") return "Entregamos para todo o Brasil";
  return "Frete grátis Sul/Sudeste acima de R$ 79";
}
