import Link from "next/link"

const BENEFITS = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
    title: "Frete Grátis",
    subtitle: "Leia a Política de Frete",
    href: "/politica-de-frete",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    title: "Pagamento facilitado",
    subtitle: "Vários meios de pagamento",
    href: null,
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    title: "Promoção de 1ª compra",
    subtitle: "CUPOM clicando AQUI",
    href: "/produtos",
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
    title: "Clube VIP no WhatsApp",
    subtitle: "Entre para o Clube Bibelô",
    href: "https://wa.me/5547933862514",
  },
]

export default function BenefitsStrip() {
  return (
    <div className="bg-bibelo-gray-light border-y border-gray-100">
      <div className="content-container">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200">
          {BENEFITS.map((benefit, idx) => {
            const content = (
              <div className="flex items-center gap-3 py-4 px-4">
                <div className="text-bibelo-pink shrink-0">{benefit.icon}</div>
                <div>
                  <p className="font-semibold text-sm text-gray-800 leading-tight">{benefit.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{benefit.subtitle}</p>
                </div>
              </div>
            )

            if (benefit.href) {
              const isExternal = benefit.href.startsWith("http")
              return isExternal ? (
                <a key={idx} href={benefit.href} target="_blank" rel="noreferrer"
                  className="hover:bg-bibelo-pink/5 transition-colors cursor-pointer">
                  {content}
                </a>
              ) : (
                <Link key={idx} href={benefit.href} className="hover:bg-bibelo-pink/5 transition-colors cursor-pointer">
                  {content}
                </Link>
              )
            }

            return <div key={idx}>{content}</div>
          })}
        </div>
      </div>
    </div>
  )
}
