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
    "Papelaria artesanal com curadoria especial em Timbó/SC. Cadernos, canetas, agendas e muito mais. Frete grátis para Sul e Sudeste acima de R$ 79.",
  keywords: [
    "papelaria",
    "caderno",
    "caneta",
    "agenda",
    "Bibelô",
    "Timbó SC",
    "papelaria online",
    "artigos de papelaria",
    "material escolar",
  ],
  authors: [{ name: "Papelaria Bibelô" }],
  creator: "Papelaria Bibelô",
  publisher: "Papelaria Bibelô",
  metadataBase: new URL("https://homolog.papelariabibelo.com.br"),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://homolog.papelariabibelo.com.br",
    siteName: "Papelaria Bibelô",
    title: "Papelaria Bibelô — Papelaria Artesanal com Curadoria Especial",
    description:
      "Papelaria artesanal com curadoria especial em Timbó/SC. Cadernos, canetas, agendas e muito mais.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Papelaria Bibelô",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@papelariabibelo",
    creator: "@papelariabibelo",
    title: "Papelaria Bibelô — Papelaria Artesanal com Curadoria Especial",
    description:
      "Papelaria artesanal com curadoria especial em Timbó/SC. Cadernos, canetas, agendas e muito mais.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
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
