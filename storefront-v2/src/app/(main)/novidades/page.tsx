import Image from "next/image"
import Link from "next/link"
import { getNovidadesBling } from "@/lib/api/novidades"
import type { Metadata } from "next"
import type { NovidadeProduct } from "@/lib/api/novidades"

export const metadata: Metadata = {
  title: "Novidades",
  description: "Os lançamentos mais recentes da Papelaria Bibelô — produtos fresquinhos, acabaram de chegar!",
}

export const dynamic = "force-dynamic"

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function NovidadeCard({ product }: { product: NovidadeProduct }) {
  const href = product.medusa_handle
    ? `/produto/${product.medusa_handle}`
    : `/produtos?q=${encodeURIComponent(product.nome)}`

  return (
    <Link
      href={href}
      className="group flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-100
                 hover:border-bibelo-pink/30 hover:shadow-lg transition-all duration-300"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={product.imagem_url}
          alt={product.nome}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 220px"
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

export default async function NovidadesPage() {
  const { novidades } = await getNovidadesBling(50)

  return (
    <div className="content-container py-8">
      <div className="mb-6">
        <p className="text-bibelo-pink text-xs font-semibold uppercase tracking-widest mb-1">Chegou agora ✨</p>
        <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark">Novidades</h1>
        <p className="text-gray-500 text-sm mt-1">
          {novidades.length > 0
            ? `${novidades.length} produto${novidades.length !== 1 ? "s" : ""} da última entrega`
            : "Novidades a caminho. Fique de olho!"}
        </p>
      </div>

      {novidades.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-4xl mb-4">✨</p>
          <p className="text-gray-500 text-sm">Em breve novos produtos. Fique de olho!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {novidades.map((product) => (
            <NovidadeCard key={product.bling_id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
