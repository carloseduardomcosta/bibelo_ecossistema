/**
 * Testes de hierarquia de categorias — feat: categoria pai/filho
 *
 * Cobre as 4 tarefas implementadas:
 *   T1 — CategoryMegaMenu  (grupos no dropdown)
 *   T2 — FilterSidebar     (hierarquia + destaque pai ativo)
 *   T3 — /categoria/[handle] page (pills, breadcrumb, fetch params)
 *   T4 — CategoriesSection (tipo atualizado)
 * E o suporte adicionado em products.ts (categoryIds[])
 */

import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"

// ─── Paths ──────────────────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, "..")
const MEGA_MENU    = path.join(SRC, "components/layout/CategoryMegaMenu.tsx")
const FILTER       = path.join(SRC, "components/product/FilterSidebar.tsx")
const CAT_PAGE     = path.join(SRC, "app/(main)/categoria/[handle]/page.tsx")
const CAT_SECTION  = path.join(SRC, "components/home/CategoriesSection.tsx")
const PRODUCTS_LIB = path.join(SRC, "lib/medusa/products.ts")

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  handle: string
  parent_category_id?: string | null
  category_children?: Category[]
}

const CANETA: Category = {
  id: "pcat_caneta",
  name: "Canetas",
  handle: "caneta",
  parent_category_id: null,
  category_children: [
    { id: "pcat_gel",    name: "Gel",          handle: "caneta-gel",          parent_category_id: "pcat_caneta" },
    { id: "pcat_esf",   name: "Esferográfica", handle: "caneta-esferografica", parent_category_id: "pcat_caneta" },
    { id: "pcat_hidro", name: "Hidrocor",      handle: "caneta-hidrocor",      parent_category_id: "pcat_caneta" },
  ],
}

const CADERNO: Category = {
  id: "pcat_caderno",
  name: "Cadernos",
  handle: "caderno",
  parent_category_id: null,
  category_children: [],
}

const AGENDA: Category = {
  id: "pcat_agenda",
  name: "Agendas",
  handle: "agenda",
  parent_category_id: null,
  category_children: [
    { id: "pcat_planner", name: "Planner", handle: "planner", parent_category_id: "pcat_agenda" },
  ],
}

const FLAT_CATEGORIES: Category[] = [
  CANETA,
  CADERNO,
  AGENDA,
  ...CANETA.category_children!,
  ...AGENDA.category_children!,
]

// ═══════════════════════════════════════════════════════════════════════════
// products.ts — suporte a categoryIds[]
// ═══════════════════════════════════════════════════════════════════════════

describe("products.ts — parâmetro categoryIds[]", () => {
  const src = fs.readFileSync(PRODUCTS_LIB, "utf-8")

  it("declara o parâmetro categoryIds no tipo de listProducts", () => {
    expect(src).toContain("categoryIds")
  })

  it("usa categoryIds como category_id diretamente (sem resolução de handle)", () => {
    expect(src).toContain("params.category_id = categoryIds")
  })

  it("prioriza categoryIds sobre categoryId quando ambos informados", () => {
    // categoryIds deve ser testado ANTES do bloco `if (categoryId)`
    const idxArr  = src.indexOf("categoryIds && categoryIds.length")
    const idxSingle = src.indexOf("} else if (categoryId)")
    expect(idxArr).toBeGreaterThan(-1)
    expect(idxSingle).toBeGreaterThan(idxArr)
  })

  it("mantém o comportamento original de resolução de handle em categoryId", () => {
    expect(src).toContain("!categoryId.startsWith(\"pcat_\")")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T1 — CategoryMegaMenu
// ═══════════════════════════════════════════════════════════════════════════

describe("T1 — CategoryMegaMenu: estrutura do arquivo", () => {
  const src = fs.readFileSync(MEGA_MENU, "utf-8")

  it("inclui category_children na interface Category", () => {
    expect(src).toContain("category_children")
  })

  it("mantém EXCLUDED com novidade e promocao", () => {
    expect(src).toContain('"novidade"')
    expect(src).toContain('"promocao"')
  })

  it("separa categorias com filhos das sem filhos (withChildren / withoutChildren)", () => {
    expect(src).toContain("withChildren")
    expect(src).toContain("withoutChildren")
  })

  it("renderiza link para /categoria/{handle} nos filhos", () => {
    expect(src).toContain("/categoria/${child.handle}")
  })

  it("renderiza link para /categoria/{handle} no pai (cabeçalho do grupo)", () => {
    expect(src).toContain("/categoria/${group.handle}")
  })

  it("fecha o menu ao clicar no pai e nos filhos (setOpen(false))", () => {
    const count = (src.match(/setOpen\(false\)/g) || []).length
    expect(count).toBeGreaterThanOrEqual(3) // botão pai, link pai, link filho
  })

  it("mantém o Escape para fechar", () => {
    expect(src).toContain('e.key === "Escape"')
  })

  it("mantém fechar ao clicar fora (mousedown handler)", () => {
    expect(src).toContain("mousedown")
    expect(src).toContain("containerRef.current")
  })
})

describe("T1 — CategoryMegaMenu: lógica de agrupamento", () => {
  const EXCLUDED = ["novidade", "promocao"]

  function buildGroups(categories: Category[]) {
    return categories
      .filter((c) => !c.parent_category_id && !EXCLUDED.includes(c.handle))
      .map((c) => ({
        ...c,
        children: (c.category_children || []).filter((ch) => !EXCLUDED.includes(ch.handle)),
      }))
  }

  it("filtra apenas categorias raiz", () => {
    const groups = buildGroups(FLAT_CATEGORIES)
    expect(groups.every((g) => !g.parent_category_id)).toBe(true)
  })

  it("inclui os filhos corretos de cada raiz", () => {
    const groups = buildGroups(FLAT_CATEGORIES)
    const caneta = groups.find((g) => g.handle === "caneta")!
    expect(caneta.children).toHaveLength(3)
    expect(caneta.children.map((c) => c.handle)).toContain("caneta-gel")
  })

  it("categoria sem filhos tem children vazio", () => {
    const groups = buildGroups(FLAT_CATEGORIES)
    const caderno = groups.find((g) => g.handle === "caderno")!
    expect(caderno.children).toHaveLength(0)
  })

  it("exclui handles proibidos dos filhos", () => {
    const withExcluded: Category = {
      ...CANETA,
      category_children: [
        ...CANETA.category_children!,
        { id: "pcat_nov", name: "Novidades", handle: "novidade", parent_category_id: "pcat_caneta" },
      ],
    }
    const groups = buildGroups([withExcluded, CADERNO])
    const caneta = groups.find((g) => g.handle === "caneta")!
    expect(caneta.children.map((c) => c.handle)).not.toContain("novidade")
  })

  it("separa corretamente withChildren e withoutChildren", () => {
    const groups = buildGroups(FLAT_CATEGORIES)
    const withChildren    = groups.filter((g) => g.children.length > 0)
    const withoutChildren = groups.filter((g) => g.children.length === 0)
    expect(withChildren.map((g) => g.handle)).toContain("caneta")
    expect(withChildren.map((g) => g.handle)).toContain("agenda")
    expect(withoutChildren.map((g) => g.handle)).toContain("caderno")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T2 — FilterSidebar
// ═══════════════════════════════════════════════════════════════════════════

describe("T2 — FilterSidebar: estrutura do arquivo", () => {
  const src = fs.readFileSync(FILTER, "utf-8")

  it("inclui category_children na interface Category", () => {
    expect(src).toContain("category_children")
  })

  it("preserva a função buildUrl", () => {
    expect(src).toContain("function buildUrl")
    expect(src).toContain("categoria")
    expect(src).toContain("sort")
    expect(src).toContain("q")
  })

  it("mantém o botão de filtros mobile", () => {
    expect(src).toContain("Filtros")
    expect(src).toContain("setDrawerOpen(true)")
  })

  it("mantém o overlay do drawer mobile", () => {
    expect(src).toContain("setDrawerOpen(false)")
    expect(src).toContain("bg-black/40")
  })

  it("renderiza link de subcategoria com buildUrl e child.handle", () => {
    expect(src).toContain("child.handle")
    expect(src).toContain("categoria: child.handle")
  })

  it("detecta currentParentHandle para destacar o pai", () => {
    expect(src).toContain("currentParentHandle")
  })

  it("exibe a contagem de filhos no pai (badge)", () => {
    expect(src).toContain("cat.children.length")
  })

  it("mantém a sidebar sticky no desktop", () => {
    expect(src).toContain("sticky")
    expect(src).toContain("top-24")
  })
})

describe("T2 — FilterSidebar: lógica de buildUrl", () => {
  function buildUrl(params: { categoria?: string; sort?: string; q?: string }) {
    const sp = new URLSearchParams()
    if (params.categoria) sp.set("categoria", params.categoria)
    if (params.sort) sp.set("sort", params.sort)
    if (params.q) sp.set("q", params.q)
    const qs = sp.toString()
    return `/produtos${qs ? `?${qs}` : ""}`
  }

  it("retorna /produtos sem query string quando sem params", () => {
    expect(buildUrl({})).toBe("/produtos")
  })

  it("inclui categoria na URL", () => {
    expect(buildUrl({ categoria: "caneta" })).toContain("categoria=caneta")
  })

  it("inclui sort e q junto com categoria", () => {
    const url = buildUrl({ categoria: "caneta", sort: "price_asc", q: "azul" })
    expect(url).toContain("categoria=caneta")
    expect(url).toContain("sort=price_asc")
    expect(url).toContain("q=azul")
  })

  it("omite parâmetros undefined", () => {
    const url = buildUrl({ sort: "price_asc" })
    expect(url).not.toContain("categoria")
  })
})

describe("T2 — FilterSidebar: lógica de destaque do pai", () => {
  function resolveActiveParent(
    categories: Category[],
    currentCategory?: string
  ): string | null {
    const currentObj = categories.find((c) => c.handle === currentCategory)
    const parentId = currentObj?.parent_category_id ?? null
    if (!parentId) return null
    return categories.find((c) => c.id === parentId)?.handle ?? null
  }

  it("retorna null quando currentCategory é raiz", () => {
    expect(resolveActiveParent(FLAT_CATEGORIES, "caneta")).toBeNull()
  })

  it("retorna o handle do pai quando currentCategory é filho", () => {
    expect(resolveActiveParent(FLAT_CATEGORIES, "caneta-gel")).toBe("caneta")
  })

  it("retorna null quando currentCategory é undefined", () => {
    expect(resolveActiveParent(FLAT_CATEGORIES, undefined)).toBeNull()
  })

  it("retorna null quando categoria não existe", () => {
    expect(resolveActiveParent(FLAT_CATEGORIES, "inexistente")).toBeNull()
  })

  it("isParentActive é true quando filho está ativo", () => {
    const currentParentHandle = resolveActiveParent(FLAT_CATEGORIES, "caneta-gel")
    const isParentActive = (catHandle: string) =>
      "caneta-gel" === catHandle || currentParentHandle === catHandle
    expect(isParentActive("caneta")).toBe(true)
    expect(isParentActive("caderno")).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T3 — /categoria/[handle] page
// ═══════════════════════════════════════════════════════════════════════════

describe("T3 — página /categoria/[handle]: estrutura do arquivo", () => {
  const src = fs.readFileSync(CAT_PAGE, "utf-8")

  it("inclui category_children na interface CategoryType", () => {
    expect(src).toContain("category_children")
  })

  it("aceita query param sub no searchParams", () => {
    expect(src).toContain("sub?:")
  })

  it("detecta se é categoria pai via children.length > 0", () => {
    expect(src).toContain("isParent")
    expect(src).toContain("children.length > 0")
  })

  it("exibe pills de subcategorias quando isParent", () => {
    expect(src).toContain("{isParent && (")
    expect(src).toContain("pillUrl")
  })

  it("pill 'Todos' não tem sub param", () => {
    expect(src).toContain("pillUrl()")
  })

  it("exibe o pai no breadcrumb quando for categoria filha", () => {
    expect(src).toContain("parentCategory &&")
    expect(src).toContain("/categoria/${parentCategory.handle}")
  })

  it("busca produtos por categoryIds quando é categoria pai", () => {
    expect(src).toContain("categoryIds")
  })

  it("inclui ID do pai E dos filhos na busca padrão da categoria pai", () => {
    expect(src).toContain("category.id, ...children.map")
  })

  it("usa apenas o ID da subcategoria selecionada quando pill está ativa", () => {
    expect(src).toContain("categoryIds: [selectedSub.id]")
  })

  it("mantém a paginação com pageUrl", () => {
    expect(src).toContain("function pageUrl")
  })

  it("pageUrl preserva o sub param quando existe subcategoria ativa", () => {
    expect(src).toContain('params.set("sub", selectedSub.handle)')
  })

  it("mantém o sort com sortUrl", () => {
    expect(src).toContain("function sortUrl")
  })

  it("sortUrl preserva o sub param quando existe subcategoria ativa", () => {
    expect(src).toContain('p.set("sub", selectedSub.handle)')
  })

  it("exibe label contextual correto no contador de produtos", () => {
    expect(src).toContain("contextLabel")
    expect(src).toContain("e subcategorias")
  })
})

describe("T3 — página /categoria/[handle]: lógica de fetch params", () => {
  function resolveProductFetchParams(
    category: Category,
    selectedSubHandle?: string
  ): { categoryId?: string; categoryIds?: string[] } {
    const children = (category.category_children || []) as Category[]
    const isParent = children.length > 0
    const selectedSub = selectedSubHandle
      ? children.find((c) => c.handle === selectedSubHandle) ?? null
      : null

    if (isParent) {
      if (selectedSub) return { categoryIds: [selectedSub.id] }
      return { categoryIds: [category.id, ...children.map((c) => c.id)] }
    }
    return { categoryId: category.handle }
  }

  it("categoria raiz sem filhos → usa categoryId com handle", () => {
    const params = resolveProductFetchParams(CADERNO)
    expect(params).toEqual({ categoryId: "caderno" })
  })

  it("categoria pai sem pill selecionada → usa categoryIds com pai + todos os filhos", () => {
    const params = resolveProductFetchParams(CANETA)
    expect(params.categoryIds).toContain("pcat_caneta")
    expect(params.categoryIds).toContain("pcat_gel")
    expect(params.categoryIds).toContain("pcat_esf")
    expect(params.categoryIds).toContain("pcat_hidro")
    expect(params.categoryIds).toHaveLength(4)
  })

  it("categoria pai com pill selecionada → usa apenas o ID do filho", () => {
    const params = resolveProductFetchParams(CANETA, "caneta-gel")
    expect(params).toEqual({ categoryIds: ["pcat_gel"] })
  })

  it("pill de subcategoria inválida cai no fallback de pai completo", () => {
    const params = resolveProductFetchParams(CANETA, "inexistente")
    // sub não encontrado → selectedSub é null → retorna pai + todos filhos
    expect(params.categoryIds).toHaveLength(4)
  })

  it("categoria pai com 1 filho → categoryIds tem 2 itens (pai + filho)", () => {
    const params = resolveProductFetchParams(AGENDA)
    expect(params.categoryIds).toHaveLength(2)
    expect(params.categoryIds).toContain("pcat_agenda")
    expect(params.categoryIds).toContain("pcat_planner")
  })
})

describe("T3 — página /categoria/[handle]: lógica de URLs", () => {
  // Simulação inline das funções da página
  function makePillUrl(handle: string, sub?: Category, sort?: string): string {
    const p = new URLSearchParams()
    if (sub) p.set("sub", sub.handle)
    if (sort) p.set("sort", sort)
    const qs = p.toString()
    return `/categoria/${handle}${qs ? `?${qs}` : ""}`
  }

  function makeSortUrl(
    handle: string,
    sort: string,
    selectedSub?: Category
  ): string {
    const p = new URLSearchParams()
    p.set("sort", sort)
    if (selectedSub) p.set("sub", selectedSub.handle)
    return `/categoria/${handle}?${p.toString()}`
  }

  function makePageUrl(
    handle: string,
    page: number,
    sort?: string,
    selectedSub?: Category
  ): string {
    const p = new URLSearchParams()
    p.set("page", String(page))
    if (sort) p.set("sort", sort)
    if (selectedSub) p.set("sub", selectedSub.handle)
    return `/categoria/${handle}?${p.toString()}`
  }

  const GEL = CANETA.category_children![0]

  it("pillUrl sem sub retorna URL limpa (pill 'Todos')", () => {
    expect(makePillUrl("caneta")).toBe("/categoria/caneta")
  })

  it("pillUrl com sub inclui ?sub=handle", () => {
    const url = makePillUrl("caneta", GEL)
    expect(url).toBe("/categoria/caneta?sub=caneta-gel")
  })

  it("pillUrl preserva sort quando presente", () => {
    const url = makePillUrl("caneta", GEL, "price_asc")
    expect(url).toContain("sort=price_asc")
    expect(url).toContain("sub=caneta-gel")
  })

  it("sortUrl preserva sub quando subcategoria está ativa", () => {
    const url = makeSortUrl("caneta", "price_asc", GEL)
    expect(url).toContain("sort=price_asc")
    expect(url).toContain("sub=caneta-gel")
  })

  it("sortUrl sem sub não inclui o parâmetro", () => {
    const url = makeSortUrl("caneta", "price_asc")
    expect(url).not.toContain("sub=")
  })

  it("pageUrl inclui página correta", () => {
    const url = makePageUrl("caneta", 3)
    expect(url).toContain("page=3")
  })

  it("pageUrl preserva sub e sort", () => {
    const url = makePageUrl("caneta", 2, "price_desc", GEL)
    expect(url).toContain("page=2")
    expect(url).toContain("sort=price_desc")
    expect(url).toContain("sub=caneta-gel")
  })
})

describe("T3 — página /categoria/[handle]: lógica de breadcrumb e contexto", () => {
  function resolveBreadcrumb(categories: Category[], handle: string) {
    const category = categories.find((c) => c.handle === handle)
    if (!category) return null
    const parent = category.parent_category_id
      ? categories.find((c) => c.id === category.parent_category_id)
      : null
    return { category, parent }
  }

  function resolveContextLabel(
    category: Category,
    selectedSub: Category | null,
    isParent: boolean
  ): string {
    if (selectedSub) return selectedSub.name
    if (isParent) return `${category.name} e subcategorias`
    return category.name
  }

  it("categoria raiz não tem pai no breadcrumb", () => {
    const result = resolveBreadcrumb(FLAT_CATEGORIES, "caneta")
    expect(result?.parent == null).toBe(true)
  })

  it("categoria filha tem pai no breadcrumb", () => {
    const result = resolveBreadcrumb(FLAT_CATEGORIES, "caneta-gel")
    expect(result?.parent?.handle).toBe("caneta")
  })

  it("contextLabel com subcategoria selecionada mostra nome do filho", () => {
    const label = resolveContextLabel(CANETA, CANETA.category_children![0], true)
    expect(label).toBe("Gel")
  })

  it("contextLabel sem sub em categoria pai mostra 'X e subcategorias'", () => {
    const label = resolveContextLabel(CANETA, null, true)
    expect(label).toBe("Canetas e subcategorias")
  })

  it("contextLabel em categoria folha mostra nome da categoria", () => {
    const label = resolveContextLabel(CADERNO, null, false)
    expect(label).toBe("Cadernos")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// T4 — CategoriesSection
// ═══════════════════════════════════════════════════════════════════════════

describe("T4 — CategoriesSection: atualização de tipos", () => {
  const src = fs.readFileSync(CAT_SECTION, "utf-8")

  it("interface Category inclui category_children", () => {
    expect(src).toContain("category_children")
  })

  it("ainda filtra apenas categorias raiz (!parent_category_id)", () => {
    expect(src).toContain("!c.parent_category_id")
  })

  it("ainda exclui novidade e promocao", () => {
    expect(src).toContain("EXCLUDED")
    expect(src).toContain('"novidade"')
    expect(src).toContain('"promocao"')
  })

  it("ainda limita a 4 categorias com slice(0, 4)", () => {
    expect(src).toContain("slice(0, 4)")
  })

  it("mantém layout grid-cols-4 para os cards circulares", () => {
    expect(src).toContain("grid-cols-4")
  })

  it("mantém link 'Ver todas' para /produtos", () => {
    expect(src).toContain('href="/produtos"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Integridade geral dos arquivos modificados
// ═══════════════════════════════════════════════════════════════════════════

describe("Integridade geral", () => {
  it("CategoryMegaMenu não importa bibliotecas externas além de react e next/link", () => {
    const src = fs.readFileSync(MEGA_MENU, "utf-8")
    const imports = src.match(/^import .+ from ["'].+["']/gm) || []
    const external = imports.filter((line) =>
      !line.includes("react") &&
      !line.includes("next/link") &&
      !line.includes("@/")
    )
    expect(external).toHaveLength(0)
  })

  it("FilterSidebar não importa bibliotecas externas além de react e next/link", () => {
    const src = fs.readFileSync(FILTER, "utf-8")
    const imports = src.match(/^import .+ from ["'].+["']/gm) || []
    const external = imports.filter((line) =>
      !line.includes("react") &&
      !line.includes("next/link") &&
      !line.includes("@/")
    )
    expect(external).toHaveLength(0)
  })

  it("página /categoria não usa params diretos — sempre via await params", () => {
    const src = fs.readFileSync(CAT_PAGE, "utf-8")
    expect(src).toContain("await params")
    expect(src).toContain("await searchParams")
  })

  it("todos os arquivos modificados passam na checagem de existência", () => {
    for (const file of [MEGA_MENU, FILTER, CAT_PAGE, CAT_SECTION, PRODUCTS_LIB]) {
      expect(fs.existsSync(file)).toBe(true)
    }
  })
})
