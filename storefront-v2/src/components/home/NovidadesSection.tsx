import Link from "next/link"
import Image from "next/image"
import type { NovidadeProduct } from "@/lib/api/novidades"

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function NovidadeCard({ product }: { product: NovidadeProduct }) {
  // Link seguro: busca pelo nome no catálogo
  const searchHref = `/produtos?q=${encodeURIComponent(product.nome)}`

  return (
    <Link
      href={searchHref}
      className="group flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-100
                 hover:border-bibelo-pink/30 hover:shadow-lg transition-all duration-300"
    >
      {/* Imagem */}
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={product.imagem_url}
          alt={product.nome}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 160px, (max-width: 1024px) 200px, 220px"
          quality={85}
          unoptimized
        />
        <span className="absolute top-2 left-2 bg-bibelo-pink text-white text-[10px] font-bold
                         uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
          Novo
        </span>
        {product.estoque <= 5 && (
          <span className="absolute bottom-2 right-2 bg-orange-500 text-white text-[9px]
                           font-bold px-2 py-0.5 rounded-full">
            Últimas unidades
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        {product.categoria && (
          <p className="text-[10px] text-bibelo-pink font-semibold uppercase tracking-wider truncate">
            {product.categoria}
          </p>
        )}
        <h3 className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2
                       group-hover:text-bibelo-pink transition-colors flex-1">
          {product.nome}
        </h3>
        <p className="text-bibelo-pink font-bold text-base mt-1">
          {formatPrice(product.preco_venda)}
        </p>
      </div>
    </Link>
  )
}

interface NovidadesSectionProps {
  products: NovidadeProduct[]
  nfNumero?: string | null
}

export default function NovidadesSection({ products, nfNumero }: NovidadesSectionProps) {
  if (!products || products.length === 0) return null

  return (
    <section className="pt-2 pb-8 md:py-10">
      <div className="content-container">
        <div className="flex items-end justify-between mb-4 md:mb-6">
          <div>
            <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">
              Chegou agora ✨
            </p>
            <h2 className="section-title mb-0 text-left">Novidades</h2>
            {nfNumero && (
              <p className="text-[11px] text-gray-400 mt-0.5">NF #{nfNumero}</p>
            )}
          </div>
          <Link
            href="/produtos?sort=created_at"
            className="text-sm text-bibelo-pink font-semibold hover:underline flex items-center gap-1 shrink-0"
          >
            Ver todas
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Mobile: scroll horizontal */}
      <div className="md:hidden overflow-x-auto scrollbar-hide pl-4 pr-2">
        <div className="flex gap-3" style={{ width: "max-content" }}>
          {products.map((product) => (
            <div key={product.bling_id} className="w-[160px] shrink-0">
              <NovidadeCard product={product} />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: grid */}
      <div className="hidden md:block content-container">
        <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map((product) => (
            <NovidadeCard key={product.bling_id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
