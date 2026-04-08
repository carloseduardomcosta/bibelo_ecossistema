import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Papelaria Bibelô — Papelaria Artesanal com Curadoria Especial",
    template: "%s | Papelaria Bibelô",
  },
  description:
    "Papelaria artesanal com curadoria especial. Cadernos, canetas, agendas e muito mais. Frete grátis acima de R$ 199.",
  keywords: ["papelaria", "caderno", "caneta", "agenda", "Bibelô", "Timbó SC"],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://papelariabibelo.com.br",
    siteName: "Papelaria Bibelô",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
