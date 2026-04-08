"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCartStore } from "@/store/cart"
import { useMenuStore } from "@/store/menu"

export default function BottomNav() {
  const pathname = usePathname()
  const { itemCount, openCart } = useCartStore()
  const { openMenu } = useMenuStore()

  const isActive = (href: string) => pathname === href

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {/* Menu — esquerda (drawer abre pela esquerda) */}
        <button
          onClick={openMenu}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-gray-500"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <span className="text-[10px] font-medium leading-none">Menu</span>
        </button>

        {/* Início */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            isActive("/") ? "text-bibelo-pink" : "text-gray-500"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive("/") ? 2 : 1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="text-[10px] font-medium leading-none">Início</span>
        </Link>

        {/* Carrinho — destaque central */}
        <button
          onClick={openCart}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-gray-500 relative"
        >
          <div className="relative">
            <div className="w-10 h-10 -mt-4 bg-bibelo-pink rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
            {itemCount > 0 && (
              <span className="absolute -top-4 -right-1 bg-bibelo-yellow text-bibelo-dark text-[10px] font-bold min-w-[18px] rounded-full flex items-center justify-center leading-none border border-white">
                {itemCount > 9 ? "9+" : itemCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium leading-none text-bibelo-pink -mt-0.5">Carrinho</span>
        </button>

        {/* Buscar */}
        <Link
          href="/busca"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            isActive("/busca") ? "text-bibelo-pink" : "text-gray-500"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive("/busca") ? 2 : 1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <span className="text-[10px] font-medium leading-none">Buscar</span>
        </Link>

        {/* Conta */}
        <Link
          href="/conta"
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            isActive("/conta") ? "text-bibelo-pink" : "text-gray-500"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive("/conta") ? 2 : 1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <span className="text-[10px] font-medium leading-none">Conta</span>
        </Link>
      </div>
    </nav>
  )
}
