"use client"

import { useState } from "react"
import type { Metadata } from "next"
import Link from "next/link"

interface FAQ {
  question: string
  answer: string
}

const SECTIONS: { title: string; faqs: FAQ[] }[] = [
  {
    title: "Pedidos e Compras",
    faqs: [
      {
        question: "Como faço um pedido?",
        answer: "Navegue pelo site, escolha os produtos desejados e clique em \"Adicionar ao Carrinho\". Quando terminar, clique no ícone do carrinho, revise seu pedido e clique em \"Finalizar Compra\". Preencha seus dados e escolha a forma de pagamento.",
      },
      {
        question: "Posso alterar ou cancelar meu pedido?",
        answer: "Sim! Você pode cancelar ou alterar seu pedido antes do envio. Entre em contato imediatamente pelo WhatsApp: (47) 9 3386-2514. Após o envio, não é mais possível alterar, mas você pode solicitar devolução conforme nossa política.",
      },
      {
        question: "Qual o valor mínimo de compra?",
        answer: "Não temos valor mínimo de compra! Você pode comprar a partir de 1 produto. Porém, para frete grátis, o pedido deve atingir o valor mínimo da sua região.",
      },
    ],
  },
  {
    title: "Pagamento",
    faqs: [
      {
        question: "Quais formas de pagamento são aceitas?",
        answer: "Aceitamos Pix (aprovação instantânea), cartão de crédito (Visa, Mastercard, Elo, American Express, Hipercard, Diners Club) e boleto bancário.",
      },
      {
        question: "É seguro pagar no site?",
        answer: "Sim, totalmente seguro! Todas as transações são criptografadas e processadas por gateways de pagamento certificados (Mercado Pago).",
      },
      {
        question: "Qual o prazo de aprovação do pagamento?",
        answer: "Pix: imediato. Cartão de crédito: até 1 dia útil. Boleto bancário: até 3 dias úteis após o pagamento.",
      },
    ],
  },
  {
    title: "Entrega",
    faqs: [
      {
        question: "Qual o prazo de entrega?",
        answer: "Varia conforme a região e modalidade. PAC: 8 a 15 dias úteis. SEDEX: 3 a 7 dias úteis. Os prazos contam a partir da confirmação do pagamento.",
      },
      {
        question: "Vocês enviam para todo o Brasil?",
        answer: "Sim! Enviamos para todo o território nacional via Correios (PAC e SEDEX) e Melhor Envio.",
      },
      {
        question: "Como acompanho meu pedido?",
        answer: "Após a postagem, você receberá o código de rastreamento por e-mail. Também pode acompanhar pelo WhatsApp ou na sua conta em \"Meus Pedidos\".",
      },
      {
        question: "O frete é grátis?",
        answer: "Sim! Compras acima de R$ 79,00 para Sul e Sudeste, e acima de R$ 199,00 para demais regiões, na opção de envio mais econômica.",
      },
    ],
  },
  {
    title: "Trocas e Devoluções",
    faqs: [
      {
        question: "Qual o prazo para solicitar troca?",
        answer: "Arrependimento: 7 dias corridos após o recebimento. Defeito de fabricação: 30 dias corridos.",
      },
      {
        question: "Como solicito uma troca?",
        answer: "Entre em contato pelo WhatsApp (47) 9 3386-2514 ou e-mail contato@papelariabibelo.com.br com o número do pedido e o motivo.",
      },
      {
        question: "Quem paga o frete da devolução?",
        answer: "Defeito ou erro nosso: a Bibelô paga. Arrependimento: o frete da primeira devolução é por nossa conta.",
      },
    ],
  },
  {
    title: "Nota Fiscal",
    faqs: [
      {
        question: "Vocês emitem Nota Fiscal?",
        answer: "Sim! Todas as compras incluem Nota Fiscal Eletrônica (NF-e), enviada automaticamente por e-mail após a confirmação do pagamento.",
      },
    ],
  },
]

function Accordion({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-4 text-left gap-3"
      >
        <span className="font-medium text-sm text-gray-800">{faq.question}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-bibelo-pink transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <p className="pb-4 text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
      )}
    </div>
  )
}

export default function FAQPage() {
  return (
    <div className="content-container py-8 max-w-3xl mx-auto">
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Perguntas Frequentes</span>
      </nav>

      <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark mb-8">Perguntas Frequentes</h1>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <h2 className="text-lg font-bold text-bibelo-pink mb-2">{section.title}</h2>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5">
              {section.faqs.map((faq, i) => (
                <Accordion key={i} faq={faq} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 p-4 bg-gray-50 rounded-xl text-sm text-gray-600">
        <strong className="text-bibelo-dark">Não encontrou sua dúvida?</strong><br />
        Fale conosco pelo WhatsApp: <a href="https://wa.me/5547933862514" className="text-bibelo-pink font-medium">(47) 9 3386-2514</a> ou e-mail: <a href="mailto:contato@papelariabibelo.com.br" className="text-bibelo-pink font-medium">contato@papelariabibelo.com.br</a>
      </p>
    </div>
  )
}
