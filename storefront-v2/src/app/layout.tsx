import type { Metadata, Viewport } from "next"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

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
      <head>
        <meta name="theme-color" content="#fe68c4" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>{children}</body>
    </html>
  )
}
