import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Sobre nós",
  description: "Conheça a Papelaria Bibelô — papelaria premium com curadoria especial em Timbó/SC.",
}

export default function SobrePage() {
  return (
    <div className="content-container py-8 max-w-3xl mx-auto">
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Sobre nós</span>
      </nav>

      {/* Hero */}
      <div className="text-center mb-10">
        <Image
          src="/logo-bibelo.png"
          alt="Papelaria Bibelô"
          width={120}
          height={120}
          className="w-28 h-28 rounded-full border-3 border-bibelo-pink/20 mx-auto mb-4"
        />
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark mb-3">Papelaria Bibelô</h1>
        <p className="text-bibelo-pink font-semibold text-sm uppercase tracking-widest">Papelaria Premium com Curadoria Especial</p>
      </div>

      {/* Conteúdo */}
      <div className="space-y-6 text-sm text-gray-600 leading-relaxed">
        <p>A Papelaria Bibelô é uma papelaria premium especializada em produtos selecionados com curadoria, qualidade superior e design minimalista.</p>

        <p>Trabalhamos para entregar uma experiência única, com itens de papelaria fina, escritório e organização que unem estética, funcionalidade e bom gosto.</p>

        <p>Nosso compromisso é oferecer produtos que transformam a rotina em algo mais leve, elegante e inspirador. Aqui, cada detalhe importa — do atendimento à escolha de cada peça.</p>

        <p className="text-bibelo-pink font-semibold text-base">Seja bem-vindo à sua papelaria premium de confiança.</p>

        {/* Valores */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6">
          {[
            { icon: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z", title: "Curadoria", desc: "Cada produto é selecionado com cuidado" },
            { icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z", title: "Qualidade", desc: "Produtos premium de marcas reconhecidas" },
            { icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z", title: "Carinho", desc: "Do atendimento à embalagem, com amor" },
          ].map((v) => (
            <div key={v.title} className="text-center p-4 bg-bibelo-rosa/30 rounded-xl">
              <svg className="w-8 h-8 text-bibelo-pink mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={v.icon} />
              </svg>
              <h3 className="font-bold text-bibelo-dark text-sm">{v.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Dados da empresa */}
        <div className="bg-gray-50 rounded-xl p-5 space-y-2">
          <h2 className="font-bold text-bibelo-dark text-base mb-3">Dados da Empresa</h2>
          <p><strong>Razão Social:</strong> Carlos Eduardo De Macedo Costa</p>
          <p><strong>CNPJ:</strong> 63.961.764/0001-63</p>
          <p><strong>Endereço:</strong> Rua Marechal Floriano Peixoto, 941 — Padre Martinho Stein — Timbó/SC</p>
          <p><strong>Telefone:</strong> <a href="tel:+5547933862514" className="text-bibelo-pink">(47) 9 3386-2514</a></p>
          <p><strong>E-mail:</strong> <a href="mailto:contato@papelariabibelo.com.br" className="text-bibelo-pink">contato@papelariabibelo.com.br</a></p>
        </div>
      </div>
    </div>
  )
}
