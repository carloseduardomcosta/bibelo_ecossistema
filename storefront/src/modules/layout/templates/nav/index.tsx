import { Suspense } from "react"
import Image from "next/image"
import { listRegions } from "@lib/data/regions"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { retrieveCustomer } from "@lib/data/customer"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"
import TopBar from "@modules/layout/components/top-bar"
import MegaMenu from "@modules/layout/components/mega-menu"
import AccountDropdown from "@modules/layout/components/account-dropdown"
import SearchBarInline from "@modules/layout/components/search-bar-inline"

export default async function Nav() {
  const [regions, locales, currentLocale, categories, customer] =
    await Promise.all([
      listRegions().then((regions: StoreRegion[]) => regions),
      listLocales(),
      getLocale(),
      listCategories(),
      retrieveCustomer().catch(() => null),
    ])

  const { collections } = await listCollections({
    fields: "id, handle, title",
  })

  return (
    <div className="sticky top-0 inset-x-0 z-50">
      {/* Topbar: cinza, redes sociais + contato */}
      <TopBar />

      {/* Header principal: branco, 3 colunas — logo | busca | utilidades */}
      <header className="bg-white border-b border-bibelo-rosa/30 shadow-none">
        <div className="content-container">
          <div className="flex items-center gap-x-4 py-3">

            {/* Coluna Esquerda: Logo */}
            <div className="flex items-center shrink-0">
              {/* Mobile: menu hamburguer */}
              <div className="small:hidden mr-2">
                <SideMenu
                  regions={regions}
                  locales={locales}
                  currentLocale={currentLocale}
                />
              </div>
              <LocalizedClientLink
                href="/"
                data-testid="nav-store-link"
                className="flex items-center"
              >
                <Image
                  src="/logo-bibelo.webp"
                  alt="Papelaria Bibelô"
                  width={160}
                  height={64}
                  className="h-14 w-auto object-contain"
                  priority
                />
              </LocalizedClientLink>
            </div>

            {/* Coluna Central: Busca expandida — igual ao PROD */}
            <div className="flex-1 hidden small:block">
              <SearchBarInline />
            </div>

            {/* Coluna Direita: Atendimento + Conta + Carrinho */}
            <div className="flex items-center gap-x-1 shrink-0">
              {/* Atendimento — desktop */}
              <a
                href="https://wa.me/5547933862514"
                target="_blank"
                rel="noreferrer"
                className="hidden small:flex flex-col items-center gap-y-0.5 px-3 py-1.5 rounded-lg text-bibelo-dark/70 hover:text-bibelo-pink hover:bg-bibelo-rosa/30 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <span className="text-[10px] font-medium leading-none">Atendimento</span>
              </a>

              {/* Conta */}
              <AccountDropdown customer={customer} />

              {/* Carrinho */}
              <Suspense
                fallback={
                  <LocalizedClientLink
                    className="flex flex-col items-center gap-y-0.5 px-3 py-1.5 rounded-lg text-bibelo-dark/70 hover:text-bibelo-pink hover:bg-bibelo-rosa/30 transition-colors"
                    href="/cart"
                    data-testid="nav-cart-link"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <span className="text-[10px] font-medium leading-none hidden small:block">Meu carrinho</span>
                  </LocalizedClientLink>
                }
              >
                <CartButton />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Segunda linha: Menu de navegação — igual ao PROD */}
        <div className="hidden small:block border-t border-bibelo-rosa/30">
          <nav className="content-container">
            <div className="flex items-center gap-x-1 h-10">
              <LocalizedClientLink
                href="/"
                className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest text-bibelo-dark/80 hover:text-bibelo-pink hover:border-b-2 hover:border-bibelo-pink transition-all"
              >
                Início
              </LocalizedClientLink>
              <LocalizedClientLink
                href="/store"
                className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest text-bibelo-dark/80 hover:text-bibelo-pink hover:border-b-2 hover:border-bibelo-pink transition-all"
              >
                Todos os Produtos
              </LocalizedClientLink>
              <MegaMenu
                categories={categories || []}
                collections={
                  collections?.map((c) => ({
                    id: c.id,
                    title: c.title,
                    handle: c.handle,
                  })) || []
                }
              />
              <LocalizedClientLink
                href="/store?sort=created_at"
                className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest text-bibelo-dark/80 hover:text-bibelo-pink hover:border-b-2 hover:border-bibelo-pink transition-all"
              >
                Novidades
              </LocalizedClientLink>
              <LocalizedClientLink
                href="/store?sort=price_asc"
                className="px-4 h-full flex items-center text-xs font-semibold uppercase tracking-widest text-bibelo-pink hover:border-b-2 hover:border-bibelo-pink transition-all"
              >
                Promoções
              </LocalizedClientLink>
            </div>
          </nav>
        </div>
      </header>
    </div>
  )
}
