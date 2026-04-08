"use client"

import { useEffect } from "react"
import { useCartStore } from "@/store/cart"

export default function CartInitializer() {
  const { initCart } = useCartStore()

  useEffect(() => {
    initCart()
  }, [initCart])

  return null
}
