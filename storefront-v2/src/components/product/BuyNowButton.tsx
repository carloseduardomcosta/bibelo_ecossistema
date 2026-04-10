"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cart"

interface Props {
  variantId: string
}

export default function BuyNowButton({ variantId }: Props) {
  const [loading, setLoading] = useState(false)
  const { addItem } = useCartStore()
  const router = useRouter()

  const handleBuyNow = async () => {
    if (loading) return
    setLoading(true)
    await addItem(variantId, 1)
    router.push("/checkout")
  }

  return (
    <button
      onClick={handleBuyNow}
      disabled={loading}
      className="w-full py-4 rounded-full font-bold text-base bg-bibelo-dark text-white hover:bg-black active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-wait"
    >
      {loading ? "Aguarde..." : "Comprar agora"}
    </button>
  )
}
