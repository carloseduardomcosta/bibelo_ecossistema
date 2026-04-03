"use client"

import { Popover, PopoverButton, PopoverPanel, Transition } from "@headlessui/react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Fragment } from "react"
import { HttpTypes } from "@medusajs/types"
import { signout } from "@lib/data/customer"

type AccountDropdownProps = {
  customer: HttpTypes.StoreCustomer | null
}

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
)

const AccountDropdown = ({ customer }: AccountDropdownProps) => {
  return (
    <Popover className="relative h-full flex items-center">
      <PopoverButton className="h-full flex items-center outline-none">
        <div className="flex flex-col items-center gap-y-0.5 px-3 py-1.5 rounded-lg text-bibelo-dark/70 hover:text-bibelo-pink hover:bg-bibelo-rosa/30 transition-colors">
          <UserIcon />
          <span className="text-[10px] font-medium leading-none hidden small:block">
            {customer ? customer.first_name : "Minha conta"}
          </span>
        </div>
      </PopoverButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-bibelo-rosa rounded-lg shadow-lg overflow-hidden">
          {({ close }) => (
            <>
              {customer ? (
                <div className="py-2">
                  <div className="px-4 py-2 border-b border-bibelo-rosa">
                    <p className="text-sm font-medium text-bibelo-dark">
                      Olá, {customer.first_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {customer.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <LocalizedClientLink
                      href="/account"
                      className="block px-4 py-2 text-sm text-bibelo-dark hover:bg-bibelo-rosa transition-colors"
                      onClick={close}
                    >
                      Minha Conta
                    </LocalizedClientLink>
                    <LocalizedClientLink
                      href="/account/orders"
                      className="block px-4 py-2 text-sm text-bibelo-dark hover:bg-bibelo-rosa transition-colors"
                      onClick={close}
                    >
                      Meus Pedidos
                    </LocalizedClientLink>
                    <LocalizedClientLink
                      href="/account/addresses"
                      className="block px-4 py-2 text-sm text-bibelo-dark hover:bg-bibelo-rosa transition-colors"
                      onClick={close}
                    >
                      Endereços
                    </LocalizedClientLink>
                  </div>
                  <div className="border-t border-bibelo-rosa py-1">
                    <button
                      onClick={async () => {
                        await signout()
                        close()
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-bibelo-rosa transition-colors"
                    >
                      Sair
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <LocalizedClientLink
                    href="/account"
                    className="block w-full text-center py-2.5 bg-bibelo-pink text-white text-sm font-medium rounded-lg hover:bg-[#e050a8] transition-colors"
                    onClick={close}
                  >
                    Entrar
                  </LocalizedClientLink>
                  <LocalizedClientLink
                    href="/account"
                    className="block w-full text-center py-2.5 border border-bibelo-pink text-bibelo-pink text-sm font-medium rounded-lg hover:bg-bibelo-rosa transition-colors"
                    onClick={close}
                  >
                    Criar conta
                  </LocalizedClientLink>
                </div>
              )}
            </>
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}

export default AccountDropdown
