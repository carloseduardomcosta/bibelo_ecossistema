import { NextRequest, NextResponse } from "next/server"

const MEDUSA_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://bibelo_medusa:9000"

// Origem pública (não usar request.nextUrl.origin — resolve para 0.0.0.0 dentro do Docker)
const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_STORE_URL || "https://homolog.papelariabibelo.com.br"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const params = new URLSearchParams()
  searchParams.forEach((value, key) => params.set(key, value))

  try {
    const medusaRes = await fetch(
      `${MEDUSA_URL}/auth/customer/google/callback?${params.toString()}`,
      { headers: { "Content-Type": "application/json" } }
    )

    const data = await medusaRes.json()

    if (data.token) {
      return NextResponse.redirect(`${PUBLIC_ORIGIN}/conta/callback?token=${data.token}`)
    }

    const error = encodeURIComponent(data.error || data.message || "auth_failed")
    return NextResponse.redirect(`${PUBLIC_ORIGIN}/conta/callback?error=${error}`)
  } catch {
    return NextResponse.redirect(`${PUBLIC_ORIGIN}/conta/callback?error=connection_failed`)
  }
}
