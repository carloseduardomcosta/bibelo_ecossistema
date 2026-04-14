"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createCart, getCart, addToCart, updateCartItem, removeCartItem, applyCoupon } from "@/lib/medusa/cart"
import { reportCartAbandonment } from "@/lib/crm-tracker"
import type { StoreCart, StoreCartLineItem } from "@medusajs/types"

// ── Debounce para abandonment report — 30s após addItem, uma vez por cartId ─
let abandonmentTimer: ReturnType<typeof setTimeout> | null = null
const reportedCartIds = new Set<string>()

function scheduleAbandonmentReport(cart: StoreCart): void {
  if (!cart?.id) return
  if (reportedCartIds.has(cart.id)) return // já reportado nesta sessão

  if (abandonmentTimer) clearTimeout(abandonmentTimer)

  abandonmentTimer = setTimeout(() => {
    // Importa o authStore de forma lazy para evitar dependência circular
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useAuthStore } = require("@/store/auth") as typeof import("@/store/auth")
    const email = useAuthStore.getState().customer?.email
    if (!email) return // só reporta se cliente identificado

    const items = (cart.items || []).map((item: StoreCartLineItem) => ({
      nome: item.title || "",
      preco: item.unit_price || 0,
    }))

    if (items.length === 0) return

    reportedCartIds.add(cart.id)
    reportCartAbandonment({
      email,
      cartId: cart.id,
      items,
    })
  }, 30_000) // 30 segundos de debounce
}

interface CartItem {
  id: string
  variant_id: string
  product_id: string
  title: string
  thumbnail: string | null
  quantity: number
  unit_price: number
  total: number
}

interface CartState {
  cartId: string | null
  items: CartItem[]
  total: number
  subtotal: number
  discount_total: number
  shipping_total: number
  itemCount: number
  isLoading: boolean
  isOpen: boolean

  // Actions
  initCart: () => Promise<void>
  addItem: (variantId: string, quantity?: number) => Promise<void>
  updateItem: (lineItemId: string, quantity: number) => Promise<void>
  removeItem: (lineItemId: string) => Promise<void>
  applyPromoCode: (code: string) => Promise<{ success: boolean; error?: string }>
  refreshCart: () => Promise<void>
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void
}

function mapLineItem(item: StoreCartLineItem): CartItem {
  return {
    id: item.id,
    variant_id: item.variant_id || "",
    product_id: item.product_id || "",
    title: item.title || "",
    thumbnail: item.thumbnail || null,
    quantity: item.quantity,
    unit_price: item.unit_price || 0,
    total: item.total || 0,
  }
}

function mapCart(cart: StoreCart) {
  const items = (cart.items || []).map(mapLineItem)
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0)
  return {
    items,
    itemCount,
    total: cart.total || 0,
    subtotal: cart.subtotal || 0,
    discount_total: cart.discount_total || 0,
    shipping_total: cart.shipping_total || 0,
  }
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cartId: null,
      items: [],
      total: 0,
      subtotal: 0,
      discount_total: 0,
      shipping_total: 0,
      itemCount: 0,
      isLoading: false,
      isOpen: false,

      initCart: async () => {
        const { cartId } = get()
        if (cartId) {
          const cart = await getCart(cartId)
          if (cart) {
            set(mapCart(cart))
            return
          }
        }
        const newCart = await createCart()
        if (newCart) {
          set({ cartId: newCart.id, items: [], total: 0, subtotal: 0, itemCount: 0 })
        }
      },

      addItem: async (variantId, quantity = 1) => {
        set({ isLoading: true })
        let { cartId } = get()

        if (!cartId) {
          const newCart = await createCart()
          if (!newCart) { set({ isLoading: false }); return }
          cartId = newCart.id
          set({ cartId })
        }

        const cart = await addToCart({ cartId, variantId, quantity })
        if (cart) {
          set({ ...mapCart(cart), isOpen: true })

          // Abandonment report: dispara 30s após o addItem, uma vez por cartId
          // Só envia se o customer estiver identificado (email disponível no authStore)
          scheduleAbandonmentReport(cart)
        }
        set({ isLoading: false })
      },

      updateItem: async (lineItemId, quantity) => {
        const { cartId } = get()
        if (!cartId) return
        set({ isLoading: true })
        const cart = await updateCartItem({ cartId, lineItemId, quantity })
        if (cart) {
          set(mapCart(cart))
        }
        set({ isLoading: false })
      },

      removeItem: async (lineItemId) => {
        const { cartId } = get()
        if (!cartId) return
        set({ isLoading: true })
        const success = await removeCartItem({ cartId, lineItemId })
        if (success) {
          await get().refreshCart()
        }
        set({ isLoading: false })
      },

      applyPromoCode: async (code) => {
        const { cartId } = get()
        if (!cartId) return { success: false, error: "Carrinho não encontrado" }
        const { cart, error } = await applyCoupon({ cartId, code })
        if (cart) {
          set({
            total: cart.total || 0,
            discount_total: cart.discount_total || 0,
          })
          return { success: true }
        }
        return { success: false, error: error || "Erro ao aplicar cupom" }
      },

      refreshCart: async () => {
        const { cartId } = get()
        if (!cartId) return
        const cart = await getCart(cartId)
        if (cart) {
          set(mapCart(cart))
        }
      },

      toggleCart: () => set((state) => ({ isOpen: !state.isOpen })),
      openCart: () => set({ isOpen: true }),
      closeCart: () => set({ isOpen: false }),
    }),
    {
      name: "bibelo-cart-v2",
      partialize: (state) => ({ cartId: state.cartId }),
    }
  )
)
