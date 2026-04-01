/**
 * Callback OAuth2 Melhor Envio
 * Recebe o code, troca por token, salva no banco do CRM (sync.sync_state)
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const ME_BASE = "https://melhorenvio.com.br"
const ME_CLIENT_ID = process.env.ME_CLIENT_ID || ""
const ME_CLIENT_SECRET = process.env.ME_CLIENT_SECRET || ""
const ME_REDIRECT_URI = process.env.ME_REDIRECT_URI || ""

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve("logger") as any
  const code = req.query.code as string

  if (!code) {
    res.status(400).json({ error: "Código de autorização ausente" })
    return
  }

  try {
    // Trocar code por token
    const tokenRes = await fetch(`${ME_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: ME_CLIENT_ID,
        client_secret: ME_CLIENT_SECRET,
        redirect_uri: ME_REDIRECT_URI,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      logger.error(`Melhor Envio OAuth erro: ${tokenRes.status} ${errText}`)
      res.status(502).json({ error: "Erro ao obter token do Melhor Envio" })
      return
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
    }

    logger.info(
      `Melhor Envio OAuth: token obtido, expira em ${tokenData.expires_in}s`
    )

    // Salvar token — como o Medusa não compartilha banco com o CRM,
    // vou salvar em arquivo temporário e logar para configuração manual
    // Em produção, o CRM vai buscar via endpoint interno
    logger.info(
      `ME_ACCESS_TOKEN=${tokenData.access_token.substring(0, 20)}...`
    )
    logger.info(
      `ME_REFRESH_TOKEN=${tokenData.refresh_token.substring(0, 20)}...`
    )

    // Salvar no CRM via API interna (mesmo VPS, rede Docker)
    const crmUrl = process.env.CRM_INTERNAL_URL || "http://bibelo_api:4000"
    const saveRes = await fetch(`${crmUrl}/api/internal/melhorenvio-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      }),
    }).catch((err) => {
      logger.warn(`Melhor Envio: não conseguiu salvar no CRM: ${err.message}`)
      return null
    })

    if (saveRes?.ok) {
      logger.info("Melhor Envio: token salvo no CRM via API interna")
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Melhor Envio conectado!</h2>
          <p>Token obtido com sucesso. Você pode fechar esta janela.</p>
        </body>
      </html>
    `)
  } catch (err: any) {
    logger.error(`Melhor Envio OAuth erro: ${err.message}`)
    res.status(500).json({ error: "Erro interno no callback OAuth" })
  }
}
