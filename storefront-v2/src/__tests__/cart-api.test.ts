import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Medusa SDK
vi.mock("@/lib/medusa/client", () => ({
  default: {
    store: {
      cart: {
        create: vi.fn().mockResolvedValue({
          cart: { id: "cart_new_123", items: [], total: 0 },
        }),
        retrieve: vi.fn().mockResolvedValue({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", title: "Caneta", quantity: 1, unit_price: 1500, total: 1500 }],
            total: 1500,
          },
        }),
        createLineItem: vi.fn().mockResolvedValue({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", title: "Caneta", quantity: 1, unit_price: 1500, total: 1500 }],
            total: 1500,
          },
        }),
        updateLineItem: vi.fn().mockResolvedValue({
          cart: {
            id: "cart_123",
            items: [{ id: "li_1", title: "Caneta", quantity: 3, unit_price: 1500, total: 4500 }],
            total: 4500,
          },
        }),
        deleteLineItem: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue({
          cart: { id: "cart_123", total: 2700, discount_total: 300 },
        }),
      },
    },
  },
  medusa: {
    store: {
      cart: {
        create: vi.fn(),
        retrieve: vi.fn(),
        createLineItem: vi.fn(),
        updateLineItem: vi.fn(),
        deleteLineItem: vi.fn(),
        update: vi.fn(),
      },
    },
  },
}))

// Mock fetch para funções que usam fetch direto
const mockFetch = vi.fn()
global.fetch = mockFetch

import {
  createCart,
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  applyCoupon,
  getShippingOptions,
  addShippingMethod,
  completeCart,
} from "@/lib/medusa/cart"

describe("Cart API Functions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe("createCart", () => {
    it("cria carrinho com region padrão", async () => {
      const cart = await createCart()
      expect(cart).toBeTruthy()
      expect(cart?.id).toBe("cart_new_123")
    })
  })

  describe("getCart", () => {
    it("recupera carrinho por ID", async () => {
      const cart = await getCart("cart_123")
      expect(cart).toBeTruthy()
      expect(cart?.id).toBe("cart_123")
    })
  })

  describe("addToCart", () => {
    it("adiciona item ao carrinho", async () => {
      const cart = await addToCart({
        cartId: "cart_123",
        variantId: "var_1",
        quantity: 1,
      })
      expect(cart).toBeTruthy()
      expect(cart?.items).toHaveLength(1)
    })
  })

  describe("updateCartItem", () => {
    it("atualiza quantidade do item", async () => {
      const cart = await updateCartItem({
        cartId: "cart_123",
        lineItemId: "li_1",
        quantity: 3,
      })
      expect(cart).toBeTruthy()
      expect(cart?.items[0].quantity).toBe(3)
    })
  })

  describe("removeCartItem", () => {
    it("remove item do carrinho", async () => {
      const result = await removeCartItem({
        cartId: "cart_123",
        lineItemId: "li_1",
      })
      expect(result).toBe(true)
    })
  })

  describe("applyCoupon", () => {
    it("aplica cupom com sucesso", async () => {
      const { cart, error } = await applyCoupon({
        cartId: "cart_123",
        code: "CLUBEBIBELO",
      })
      expect(cart).toBeTruthy()
      expect(error).toBeNull()
    })
  })

  describe("getShippingOptions", () => {
    it("retorna opções de frete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shipping_options: [
            { id: "so_pac", name: "PAC", amount: 2500 },
            { id: "so_sedex", name: "SEDEX", amount: 4500 },
          ],
        }),
      })

      const options = await getShippingOptions("cart_123")
      expect(options).toHaveLength(2)
      expect(options[0].name).toBe("PAC")
    })

    it("retorna array vazio se falhar", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const options = await getShippingOptions("cart_123")
      expect(options).toHaveLength(0)
    })
  })

  describe("addShippingMethod", () => {
    it("seleciona método de frete", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          cart: { id: "cart_123", shipping_total: 2500 },
        }),
      })

      const cart = await addShippingMethod("cart_123", "so_pac")
      expect(cart).toBeTruthy()
    })

    it("retorna null se falhar", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      const cart = await addShippingMethod("cart_123", "so_pac")
      expect(cart).toBeNull()
    })
  })

  describe("completeCart", () => {
    it("finaliza o carrinho e cria pedido", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: "order",
          order: { id: "order_123", display_id: 1001 },
        }),
      })

      const result = await completeCart("cart_123")
      expect(result.type).toBe("order")
      expect(result.order.display_id).toBe(1001)
    })

    it("lança erro se falhar", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Erro no pagamento" }),
      })

      await expect(completeCart("cart_123")).rejects.toThrow("Erro no pagamento")
    })
  })
})
