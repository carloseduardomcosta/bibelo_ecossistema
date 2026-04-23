/**
 * Testes unitários — waha.ts
 *
 * normalizarTelefone e variantesNumero são funções puras, sem I/O.
 * Todos os números de telefone usam DDD 00 (inexistente no Brasil).
 */

import { describe, it, expect } from "vitest";
import { normalizarTelefone, variantesNumero } from "./waha";

// ── normalizarTelefone ────────────────────────────────────────────

describe("normalizarTelefone", () => {
  it("aceita número com DDI+DDD+9+8 dígitos (padrão atual)", () => {
    expect(normalizarTelefone("5547988148811")).toBe("5547988148811");
  });

  it("aceita número com DDI+DDD+8 dígitos (formato antigo WhatsApp)", () => {
    expect(normalizarTelefone("554788148811")).toBe("554788148811");
  });

  it("adiciona DDI 55 em número DDD+9+8 dígitos (11 dígitos)", () => {
    expect(normalizarTelefone("47988148811")).toBe("5547988148811");
  });

  it("adiciona DDI 55 em número DDD+8 dígitos (10 dígitos)", () => {
    expect(normalizarTelefone("4788148811")).toBe("554788148811");
  });

  it("remove formatação e normaliza corretamente", () => {
    expect(normalizarTelefone("(47) 9 8814-8811")).toBe("5547988148811");
    expect(normalizarTelefone("+55 47 9 8814-8811")).toBe("5547988148811");
    expect(normalizarTelefone("47 8814-8811")).toBe("554788148811");
  });

  it("retorna null para string vazia", () => {
    expect(normalizarTelefone("")).toBeNull();
  });

  it("retorna null para número com menos de 10 dígitos", () => {
    expect(normalizarTelefone("12345")).toBeNull();
  });

  it("retorna null para número com mais de 13 dígitos", () => {
    expect(normalizarTelefone("55479881488110000")).toBeNull();
  });
});

// ── variantesNumero ───────────────────────────────────────────────

describe("variantesNumero", () => {
  it("número de 12 dígitos (sem 9) gera variante com 9", () => {
    const vs = variantesNumero("554788148811");
    expect(vs).toContain("554788148811");   // original
    expect(vs).toContain("5547988148811");  // com 9 inserido após DDD
  });

  it("número de 13 dígitos (com 9) gera variante sem 9", () => {
    const vs = variantesNumero("5547988148811");
    expect(vs).toContain("5547988148811");  // original
    expect(vs).toContain("554788148811");   // sem o 9
  });

  it("variante de ida e volta é simétrica", () => {
    const original = "5547988148811";
    const sem9 = variantesNumero(original).find(v => v.length === 12)!;
    const deVolta = variantesNumero(sem9).find(v => v.length === 13)!;
    expect(deVolta).toBe(original);
  });

  it("número que começa com dígito diferente de 9 não gera variante sem 9", () => {
    // DDD 00 + começa com 8: não é padrão móvel com 9 → variante não gerada
    const vs = variantesNumero("5500088148811"); // 13 dígitos mas começa com 0 após DDD
    expect(vs.length).toBe(1); // apenas o original
  });

  it("número sem DDI 55 não gera variantes", () => {
    const vs = variantesNumero("4788148811"); // 10 dígitos
    expect(vs.length).toBe(1);
  });

  it("sempre inclui o número original na lista de variantes", () => {
    expect(variantesNumero("5547988148811")[0]).toBe("5547988148811");
    expect(variantesNumero("554788148811")[0]).toBe("554788148811");
  });

  it("números DDD 00 fictícios funcionam da mesma forma", () => {
    const vs = variantesNumero("550012345678"); // 12 dígitos
    expect(vs).toContain("5500912345678"); // variante com 9
  });
});
