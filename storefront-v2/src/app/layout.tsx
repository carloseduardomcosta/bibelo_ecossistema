import type { Metadata, Viewport } from "next"
import Script from "next/script"
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
      <body>
        {children}
        {/* Meta Pixel — base code (PageView automático) */}
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','1380166206444041');
          fbq('track','PageView');
        `}</Script>
      </body>
    </html>
  )
}
