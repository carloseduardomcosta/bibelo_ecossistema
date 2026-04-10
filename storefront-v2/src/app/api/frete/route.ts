import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL || "http://localhost:4000"

export async function GET(req: NextRequest) {
  const cep = req.nextUrl.searchParams.get("cep") || ""

  try {
    const res = await fetch(`${API_URL}/api/public/frete?cep=${cep}`, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { error: "Não foi possível calcular o frete agora. Tente na finalização do pedido." },
      { status: 503 }
    )
  }
}
