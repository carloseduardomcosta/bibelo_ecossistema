import Link from "next/link"
import Image from "next/image"
import CartInitializer from "@/components/cart/CartInitializer"
import CrmTracker from "@/components/layout/CrmTracker"

export const dynamic = "force-dynamic"

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    // fixed inset-0 z-[500]: cobre o (main) layout durante transições client-side
    <div className="fixed inset-0 z-[500] bg-white overflow-y-auto">
      {/* Header slim — logo + compra segura */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-10">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo-bibelo.png"
              alt="Papelaria Bibelô"
              width={32}
              height={32}
              className="rounded-full border border-bibelo-pink/20"
            />
            <span className="text-sm font-semibold text-bibelo-dark hidden sm:block">
              Papelaria Bibelô
            </span>
          </Link>

          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
            <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            Compra segura
          </div>
        </div>
      </header>

      {/* Inicializadores headless */}
      <CartInitializer />
      <CrmTracker />

      {children}
    </div>
  )
}
