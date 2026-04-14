"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCartStore } from "@/store/cart"
import { trackAddToCart } from "@/lib/meta-pixel"
import { trackAddToCart as crmTrackAddToCart } from "@/lib/crm-tracker"

interface Props {
  variantId: string
  productName?: string
  price?: number
}

export default function BuyNowButton({ variantId, productName, price }: Props) {
  const [loading, setLoading] = useState(false)
  const { addItem } = useCartStore()
  const router = useRouter()

  const handleBuyNow = async () => {
    if (loading) return
    setLoading(true)
    await addItem(variantId, 1)
    if (productName && price) {
      trackAddToCart({ contentId: variantId, contentName: productName, value: price })
      crmTrackAddToCart({ productId: variantId, productName, price })
    }
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
