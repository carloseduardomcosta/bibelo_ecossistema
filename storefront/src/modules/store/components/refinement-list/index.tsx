"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import SortProducts, { SortOptions } from "./sort-products"

type RefinementListProps = {
  sortBy: SortOptions
  search?: boolean
  "data-testid"?: string
}

const QUICK_CATEGORIES = [
  { label: "Canetas", value: "canetas" },
  { label: "Cadernos", value: "cadernos" },
  { label: "Agendas", value: "agendas" },
  { label: "Lápis de Cor", value: "lapis-de-cor" },
  { label: "Post-it", value: "post-it" },
  { label: "Estojos", value: "estojos" },
  { label: "Kits", value: "kits" },
]

const RefinementList = ({
  sortBy,
  "data-testid": dataTestId,
}: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const setQueryParams = (name: string, value: string) => {
    const query = createQueryString(name, value)
    router.push(`${pathname}?${query}`)
  }

  return (
    <div
      className="flex flex-col gap-6"
      data-testid={dataTestId}
    >
      {/* Ordenação */}
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-bibelo-dark/50 font-semibold mb-3">
          Ordenar por
        </p>
        <SortProducts
          sortBy={sortBy}
          setQueryParams={setQueryParams}
          data-testid={dataTestId}
        />
      </div>

      {/* Filtro rápido por categoria */}
      <div>
        <p className="text-xs uppercase tracking-[0.15em] text-bibelo-dark/50 font-semibold mb-3">
          Categorias
        </p>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => router.push(pathname)}
            className="text-left text-sm font-medium text-bibelo-pink px-3 py-2 rounded-lg bg-bibelo-rosa/50 hover:bg-bibelo-rosa transition-colors"
          >
            Todos os produtos
          </button>
          {QUICK_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() =>
                router.push(`/br/categories/${cat.value}`)
              }
              className="text-left text-sm text-bibelo-dark/70 hover:text-bibelo-pink px-3 py-2 rounded-lg hover:bg-bibelo-rosa/30 transition-colors"
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default RefinementList
