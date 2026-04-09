import Medusa from "@medusajs/js-sdk"

// Server-side (Docker interno) vs client-side (browser, URL pública)
const BACKEND_URL =
  typeof window === "undefined"
    ? (process.env.MEDUSA_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000")
    : (process.env.NEXT_PUBLIC_MEDUSA_PUBLIC_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000")

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export const medusa = new Medusa({
  baseUrl: BACKEND_URL,
  publishableKey: PUBLISHABLE_KEY,
  debug: process.env.NODE_ENV === "development",
})

export default medusa
