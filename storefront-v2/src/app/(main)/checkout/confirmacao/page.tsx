"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

function ConfirmacaoContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get("order_id")
  const displayId = searchParams.get("display_id")
  const payment = searchParams.get("payment") || "pix"
  const qrCode = searchParams.get("qr_code") || ""
  const qrCodeBase64 = searchParams.get("qr_code_base64") || ""
  const boletoUrl = searchParams.get("boleto_url") || ""
  const [copied, setCopied] = useState(false)

  const copyPixCode = () => {
    if (qrCode) {
      navigator.clipboard.writeText(qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }
  }

  return (
    <div className="content-container py-12 max-w-lg mx-auto text-center">
      {/* Ícone de sucesso */}
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-bibelo-dark mb-2">Pedido confirmado!</h1>
      {displayId && (
        <p className="text-lg text-bibelo-pink font-semibold mb-2">Pedido #{displayId}</p>
      )}
      <p className="text-gray-500 mb-8">
        Recebemos seu pedido e ele está sendo processado.
      </p>

      {/* QR Code Pix */}
      {payment === "pix" && (qrCode || qrCodeBase64) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="font-semibold text-bibelo-dark mb-4">Pague com Pix</h2>

          {qrCodeBase64 && (
            <div className="bg-white p-4 rounded-xl inline-block mb-4">
              <img
                src={`data:image/png;base64,${qrCodeBase64}`}
                alt="QR Code Pix"
                className="w-48 h-48 mx-auto"
              />
            </div>
          )}

          {qrCode && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Ou copie o código Pix:</p>
              <div className="bg-gray-50 rounded-xl p-3 break-all text-xs text-gray-600 font-mono max-h-20 overflow-y-auto">
                {qrCode}
              </div>
              <button
                onClick={copyPixCode}
                className="btn-primary w-full py-3"
              >
                {copied ? "✓ Copiado!" : "Copiar código Pix"}
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">
            O Pix expira em 30 minutos. Após o pagamento, a aprovação é instantânea.
          </p>
        </div>
      )}

      {/* Boleto */}
      {payment === "boleto" && boletoUrl && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <h2 className="font-semibold text-bibelo-dark mb-4">Boleto Bancário</h2>
          <p className="text-sm text-gray-500 mb-4">
            Seu boleto foi gerado. Clique no botão abaixo para visualizar e pagar.
          </p>
          <a
            href={boletoUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary w-full py-3 block text-center"
          >
            Ver boleto
          </a>
          <p className="text-xs text-gray-400 mt-4">
            Prazo de pagamento: 3 dias úteis. A aprovação pode levar até 3 dias úteis após o pagamento.
          </p>
        </div>
      )}

      {/* Cartão de crédito */}
      {payment === "credit_card" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">💳</span>
          </div>
          <h2 className="font-semibold text-bibelo-dark mb-2">Pagamento em processamento</h2>
          <p className="text-sm text-gray-500">
            Seu pagamento está sendo processado. Você receberá um e-mail assim que for aprovado.
          </p>
        </div>
      )}

      {/* Próximos passos */}
      {payment !== "pix" || (!qrCode && !qrCodeBase64) ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-left space-y-4 mb-8">
          <h2 className="font-semibold text-bibelo-dark">Próximos passos</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-bibelo-pink/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-bibelo-pink">1</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">Pagamento</p>
                <p className="text-xs text-gray-500">
                  {payment === "boleto"
                    ? "Pague o boleto para confirmar o pedido"
                    : payment === "credit_card"
                    ? "Seu pagamento está sendo processado"
                    : "Efetue o pagamento via Pix para confirmação imediata"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-bibelo-pink/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-bibelo-pink">2</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">Preparação</p>
                <p className="text-xs text-gray-500">Seu pedido será separado e embalado com carinho</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-bibelo-pink/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-bibelo-pink">3</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-800">Envio</p>
                <p className="text-xs text-gray-500">Você receberá o código de rastreio por e-mail</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Ações */}
      <div className="space-y-3">
        <Link href="/conta/pedidos" className="btn-primary w-full block py-3">
          Ver meus pedidos
        </Link>
        <Link href="/produtos" className="btn-secondary w-full block py-3">
          Continuar comprando
        </Link>
        <a
          href={`https://wa.me/5547933862514?text=${encodeURIComponent(`Olá! Acabei de fazer o pedido${displayId ? ` #${displayId}` : ""}. Gostaria de acompanhar.`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-green-600 hover:text-green-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          </svg>
          Acompanhar pelo WhatsApp
        </a>
      </div>
    </div>
  )
}

export default function ConfirmacaoPage() {
  return (
    <Suspense fallback={
      <div className="content-container py-16 text-center">
        <div className="w-8 h-8 border-2 border-bibelo-pink border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    }>
      <ConfirmacaoContent />
    </Suspense>
  )
}
