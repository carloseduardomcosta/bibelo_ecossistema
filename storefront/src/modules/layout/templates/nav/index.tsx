import { Suspense } from "react"

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
    <div className="sticky top-0 inset-x-0 z-50 group">
      <TopBar />
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-ui-border-base">
        <nav className="content-container flex items-center justify-between w-full h-full">
          {/* Left: Mobile menu + Mega menu (desktop) */}
          <div className="flex items-center gap-x-4 h-full flex-1 basis-0">
            <div className="h-full small:hidden">
              <SideMenu
                regions={regions}
                locales={locales}
                currentLocale={currentLocale}
              />
            </div>
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
          </div>

          {/* Center: Logo */}
          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="font-heading text-2xl font-semibold text-bibelo-dark hover:text-bibelo-pink transition-colors"
              data-testid="nav-store-link"
            >
              Papelaria Bibelô
            </LocalizedClientLink>
          </div>

          {/* Right: Account + Cart */}
          <div className="flex items-center gap-x-4 h-full flex-1 basis-0 justify-end">
            <AccountDropdown customer={customer} />
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="hover:text-bibelo-pink flex items-center gap-x-1.5"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                  <span className="text-sm">0</span>
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
