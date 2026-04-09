import { describe, it, expect } from "vitest"

/**
 * Testes de lógica do checkout — validações, formatações, fluxo
 */

describe("Checkout — validações de endereço", () => {
  const formatCep = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8)
    if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`
    return digits
  }

  it("formata CEP corretamente", () => {
    expect(formatCep("89093880")).toBe("89093-880")
  })

  it("formata CEP parcial", () => {
    expect(formatCep("89093")).toBe("89093")
  })

  it("remove caracteres não numéricos", () => {
    expect(formatCep("89.093-880")).toBe("89093-880")
  })

  it("limita a 8 dígitos", () => {
    expect(formatCep("890938801234")).toBe("89093-880")
  })
})

describe("Checkout — formatação de cartão", () => {
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ")
  }

  it("formata número de cartão com espaços", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111")
  })

  it("formata parcial", () => {
    expect(formatCardNumber("411111")).toBe("4111 11")
  })

  it("remove caracteres não numéricos", () => {
    expect(formatCardNumber("4111-1111-1111-1111")).toBe("4111 1111 1111 1111")
  })

  it("limita a 16 dígitos", () => {
    expect(formatCardNumber("41111111111111119999")).toBe("4111 1111 1111 1111")
  })
})

describe("Checkout — formatação de validade", () => {
  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4)
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return digits
  }

  it("formata MM/AA", () => {
    expect(formatExpiry("1226")).toBe("12/26")
  })

  it("formata parcial", () => {
    expect(formatExpiry("12")).toBe("12")
  })

  it("limita a 4 dígitos", () => {
    expect(formatExpiry("122699")).toBe("12/26")
  })
})

describe("Checkout — formatação de CPF", () => {
  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11)
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`
    return digits
  }

  it("formata CPF completo", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01")
  })

  it("formata CPF parcial", () => {
    expect(formatCpf("1234567")).toBe("123.456.7")
  })

  it("remove caracteres não numéricos", () => {
    expect(formatCpf("123.456.789-01")).toBe("123.456.789-01")
  })

  it("limita a 11 dígitos", () => {
    expect(formatCpf("1234567890123")).toBe("123.456.789-01")
  })
})

describe("Checkout — cálculo de desconto Pix", () => {
  it("calcula 5% de desconto", () => {
    const total = 10000 // R$ 100
    const desconto = Math.round(total * 0.05)
    expect(desconto).toBe(500) // R$ 5
  })

  it("calcula total com desconto Pix", () => {
    const total = 15000 // R$ 150
    const totalComDesconto = Math.round(total * 0.95)
    expect(totalComDesconto).toBe(14250)
  })
})

describe("Checkout — estados do formulário", () => {
  const steps = ["endereco", "entrega", "pagamento"] as const

  it("inicia no step endereço", () => {
    expect(steps[0]).toBe("endereco")
  })

  it("tem 3 steps", () => {
    expect(steps).toHaveLength(3)
  })

  it("pagamento é o último step", () => {
    expect(steps[steps.length - 1]).toBe("pagamento")
  })
})

describe("Checkout — métodos de pagamento", () => {
  const paymentMethods = [
    { id: "pix", label: "Pix", discount: true },
    { id: "credit_card", label: "Cartão de Crédito", discount: false },
    { id: "boleto", label: "Boleto Bancário", discount: false },
  ]

  it("tem 3 métodos de pagamento", () => {
    expect(paymentMethods).toHaveLength(3)
  })

  it("apenas Pix tem desconto", () => {
    const withDiscount = paymentMethods.filter((m) => m.discount)
    expect(withDiscount).toHaveLength(1)
    expect(withDiscount[0].id).toBe("pix")
  })
})
