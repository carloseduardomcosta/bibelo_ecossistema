import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock do Medusa cart API antes de importar a store
vi.mock("@/lib/medusa/cart", () => ({
  createCart: vi.fn().mockResolvedValue({ id: "cart_test_123" }),
  getCart: vi.fn().mockResolvedValue({
    id: "cart_test_123",
    items: [
      {
        id: "item_1",
        variant_id: "var_1",
        product_id: "prod_1",
        title: "Caneta Rainbow",
        thumbnail: "/img.jpg",
        quantity: 2,
        unit_price: 1500,
        total: 3000,
      },
    ],
    total: 3000,
    subtotal: 3000,
    discount_total: 0,
    shipping_total: 0,
  }),
  addToCart: vi.fn().mockResolvedValue({
    id: "cart_test_123",
    items: [
      {
        id: "item_1",
        variant_id: "var_1",
        product_id: "prod_1",
        title: "Caneta Rainbow",
        thumbnail: "/img.jpg",
        quantity: 1,
        unit_price: 1500,
        total: 1500,
      },
    ],
    total: 1500,
    subtotal: 1500,
    discount_total: 0,
    shipping_total: 0,
  }),
  updateCartItem: vi.fn().mockResolvedValue({
    id: "cart_test_123",
    items: [
      {
        id: "item_1",
        variant_id: "var_1",
        product_id: "prod_1",
        title: "Caneta Rainbow",
        thumbnail: "/img.jpg",
        quantity: 3,
        unit_price: 1500,
        total: 4500,
      },
    ],
    total: 4500,
    subtotal: 4500,
    discount_total: 0,
    shipping_total: 0,
  }),
  removeCartItem: vi.fn().mockResolvedValue(true),
  applyCoupon: vi.fn().mockResolvedValue({
    cart: { total: 2700, discount_total: 300 },
    error: null,
  }),
}))

import { useCartStore } from "@/store/cart"

describe("CartStore", () => {
  beforeEach(() => {
    // Reset store entre testes
    useCartStore.setState({
      cartId: null,
      items: [],
      total: 0,
      subtotal: 0,
      discount_total: 0,
      shipping_total: 0,
      itemCount: 0,
      isLoading: false,
      isOpen: false,
    })
  })

  it("estado inicial está vazio", () => {
    const state = useCartStore.getState()
    expect(state.cartId).toBeNull()
    expect(state.items).toHaveLength(0)
    expect(state.total).toBe(0)
    expect(state.itemCount).toBe(0)
    expect(state.isOpen).toBe(false)
  })

  it("initCart cria um novo carrinho quando não existe", async () => {
    await useCartStore.getState().initCart()
    const state = useCartStore.getState()
    expect(state.cartId).toBe("cart_test_123")
  })

  it("initCart recupera carrinho existente", async () => {
    useCartStore.setState({ cartId: "cart_test_123" })
    await useCartStore.getState().initCart()
    const state = useCartStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.items[0].title).toBe("Caneta Rainbow")
    expect(state.total).toBe(3000)
  })

  it("addItem adiciona produto ao carrinho", async () => {
    useCartStore.setState({ cartId: "cart_test_123" })
    await useCartStore.getState().addItem("var_1")
    const state = useCartStore.getState()
    expect(state.items).toHaveLength(1)
    expect(state.isOpen).toBe(true) // Abre o carrinho ao adicionar
    expect(state.isLoading).toBe(false)
  })

  it("addItem cria carrinho se não existe", async () => {
    await useCartStore.getState().addItem("var_1")
    const state = useCartStore.getState()
    expect(state.cartId).toBe("cart_test_123")
    expect(state.items).toHaveLength(1)
  })

  it("updateItem atualiza quantidade", async () => {
    useCartStore.setState({ cartId: "cart_test_123" })
    await useCartStore.getState().updateItem("item_1", 3)
    const state = useCartStore.getState()
    expect(state.items[0].quantity).toBe(3)
    expect(state.total).toBe(4500)
  })

  it("removeItem remove do carrinho", async () => {
    useCartStore.setState({ cartId: "cart_test_123" })
    await useCartStore.getState().removeItem("item_1")
    const state = useCartStore.getState()
    expect(state.isLoading).toBe(false)
  })

  it("applyPromoCode aplica cupom com sucesso", async () => {
    useCartStore.setState({ cartId: "cart_test_123" })
    const result = await useCartStore.getState().applyPromoCode("CLUBEBIBELO")
    expect(result.success).toBe(true)
    const state = useCartStore.getState()
    expect(state.discount_total).toBe(300)
  })

  it("applyPromoCode falha sem carrinho", async () => {
    const result = await useCartStore.getState().applyPromoCode("CLUBEBIBELO")
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it("toggleCart alterna visibilidade", () => {
    expect(useCartStore.getState().isOpen).toBe(false)
    useCartStore.getState().toggleCart()
    expect(useCartStore.getState().isOpen).toBe(true)
    useCartStore.getState().toggleCart()
    expect(useCartStore.getState().isOpen).toBe(false)
  })

  it("openCart e closeCart controlam visibilidade", () => {
    useCartStore.getState().openCart()
    expect(useCartStore.getState().isOpen).toBe(true)
    useCartStore.getState().closeCart()
    expect(useCartStore.getState().isOpen).toBe(false)
  })
})
