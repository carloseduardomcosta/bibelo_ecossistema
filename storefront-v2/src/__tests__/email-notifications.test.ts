import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

/**
 * Testes para o serviço de emails transacionais do storefront
 * Verifica que os templates existem e contêm elementos essenciais
 */

const SERVICE_PATH = path.resolve(
  __dirname,
  "../../../api/src/services/storefront-email.service.ts"
)

describe("Storefront Email Service — existência", () => {
  it("arquivo do serviço existe", () => {
    expect(fs.existsSync(SERVICE_PATH)).toBe(true)
  })

  it("exporta sendOrderConfirmationEmail", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8")
    expect(content).toContain("export async function sendOrderConfirmationEmail")
  })

  it("exporta sendPaymentApprovedEmail", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8")
    expect(content).toContain("export async function sendPaymentApprovedEmail")
  })

  it("exporta sendShippingEmail", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8")
    expect(content).toContain("export async function sendShippingEmail")
  })
})

describe("Storefront Email Service — templates", () => {
  const content = fs.readFileSync(SERVICE_PATH, "utf-8")

  it("template usa escHtml para prevenir XSS", () => {
    expect(content).toContain("esc(")
  })

  it("template inclui logo da Bibelô", () => {
    expect(content).toContain("webhook.papelariabibelo.com.br/logo.png")
  })

  it("template inclui link de descadastro (LGPD)", () => {
    expect(content).toContain("gerarLinkDescadastro")
  })

  it("template inclui CNPJ", () => {
    expect(content).toContain("63.961.764/0001-63")
  })

  it("template inclui WhatsApp", () => {
    expect(content).toContain("5547933862514")
  })

  it("confirmação inclui tabela de itens", () => {
    expect(content).toContain("buildItemsTable")
  })

  it("envio inclui código de rastreamento", () => {
    expect(content).toContain("tracking_code")
  })

  it("pagamento inclui status de aprovação", () => {
    expect(content).toContain("Pagamento confirmado")
  })

  it("usa tags para tracking", () => {
    expect(content).toContain("order-confirmation")
    expect(content).toContain("payment-approved")
    expect(content).toContain("shipping-tracking")
  })
})

describe("CRM Endpoints — email notifications", () => {
  const syncPath = path.resolve(
    __dirname,
    "../../../api/src/routes/sync.ts"
  )

  it("endpoint medusa-payment existe", () => {
    const content = fs.readFileSync(syncPath, "utf-8")
    expect(content).toContain("/internal/medusa-payment")
  })

  it("endpoint medusa-shipping existe", () => {
    const content = fs.readFileSync(syncPath, "utf-8")
    expect(content).toContain("/internal/medusa-shipping")
  })

  it("endpoint medusa-order envia email de confirmação", () => {
    const content = fs.readFileSync(syncPath, "utf-8")
    expect(content).toContain("sendOrderConfirmationEmail")
  })
})
