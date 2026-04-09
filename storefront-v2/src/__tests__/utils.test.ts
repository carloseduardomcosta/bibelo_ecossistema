import { describe, it, expect } from "vitest"
import { formatPrice, getDiscountPercent, formatInstallments, truncate, slugify, isOutOfStock } from "@/lib/utils"

describe("formatPrice", () => {
  it("formata centavos para BRL", () => {
    expect(formatPrice(1990)).toBe("R$\u00a019,90")
  })

  it("formata valor zero", () => {
    expect(formatPrice(0)).toBe("R$\u00a00,00")
  })

  it("formata valores grandes", () => {
    expect(formatPrice(99990)).toBe("R$\u00a0999,90")
  })

  it("formata centavos fracionados", () => {
    expect(formatPrice(1)).toBe("R$\u00a00,01")
  })

  it("formata valores negativos", () => {
    const result = formatPrice(-500)
    expect(result).toContain("5,00")
  })
})

describe("getDiscountPercent", () => {
  it("calcula desconto correto", () => {
    expect(getDiscountPercent(10000, 7000)).toBe(30)
  })

  it("retorna 0 se original é 0", () => {
    expect(getDiscountPercent(0, 500)).toBe(0)
  })

  it("retorna 0 se sale >= original", () => {
    expect(getDiscountPercent(5000, 5000)).toBe(0)
    expect(getDiscountPercent(5000, 6000)).toBe(0)
  })

  it("retorna 0 se sale é 0", () => {
    expect(getDiscountPercent(5000, 0)).toBe(0)
  })

  it("arredonda para inteiro", () => {
    expect(getDiscountPercent(10000, 6666)).toBe(33)
  })
})

describe("formatInstallments", () => {
  it("retorna parcelas para valor alto", () => {
    const result = formatInstallments(120000) // R$ 1.200
    expect(result).toContain("12x de")
    expect(result).toContain("sem juros")
  })

  it("retorna preço direto para valor baixo", () => {
    const result = formatInstallments(300) // R$ 3,00
    expect(result).toContain("3,00")
    expect(result).not.toContain("x de")
  })

  it("limita parcelas pelo valor mínimo de R$5", () => {
    const result = formatInstallments(1500) // R$ 15 → máx 3x de R$5
    expect(result).toContain("3x de")
  })
})

describe("truncate", () => {
  it("não trunca texto curto", () => {
    expect(truncate("abc", 5)).toBe("abc")
  })

  it("trunca texto longo e adiciona ...", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde...")
  })

  it("não trunca se length == text.length", () => {
    expect(truncate("abc", 3)).toBe("abc")
  })
})

describe("slugify", () => {
  it("converte para minúsculas", () => {
    expect(slugify("ABC")).toBe("abc")
  })

  it("substitui espaços por hífens", () => {
    expect(slugify("papelaria bibelo")).toBe("papelaria-bibelo")
  })

  it("remove acentos", () => {
    expect(slugify("canção café")).toBe("cancao-cafe")
  })

  it("remove caracteres especiais", () => {
    expect(slugify("teste@#$!")).toBe("teste")
  })

  it("colapsa múltiplos hífens", () => {
    expect(slugify("a - - b")).toBe("a-b")
  })
})

describe("isOutOfStock", () => {
  it("retorna false sem variante", () => {
    expect(isOutOfStock()).toBe(false)
    expect(isOutOfStock(undefined)).toBe(false)
  })

  it("retorna false se inventory_quantity é null", () => {
    expect(isOutOfStock({ inventory_quantity: null })).toBe(false)
  })

  it("retorna false se inventory_quantity é undefined", () => {
    expect(isOutOfStock({ inventory_quantity: undefined })).toBe(false)
  })

  it("retorna true se inventory_quantity é 0", () => {
    expect(isOutOfStock({ inventory_quantity: 0 })).toBe(true)
  })

  it("retorna true se inventory_quantity é negativo", () => {
    expect(isOutOfStock({ inventory_quantity: -1 })).toBe(true)
  })

  it("retorna false se inventory_quantity > 0", () => {
    expect(isOutOfStock({ inventory_quantity: 5 })).toBe(false)
  })
})
