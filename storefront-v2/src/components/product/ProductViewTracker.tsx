"use client"

import { useEffect } from "react"
import { trackProductView } from "@/lib/crm-tracker"

interface Props {
  productId: string
  productName: string
  price?: number
  imageUrl?: string
}

export default function ProductViewTracker({ productId, productName, price, imageUrl }: Props) {
  useEffect(() => {
    trackProductView({ productId, productName, price, imageUrl })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  return null
}
