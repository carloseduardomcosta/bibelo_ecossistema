const BENEFITS = [
  { icon: "🚚", text: "Frete grátis acima de R$ 199" },
  { icon: "💳", text: "Pix sem juros" },
  { icon: "📍", text: "Timbó/SC" },
  { icon: "💬", label: "Grupo VIP WhatsApp", href: "https://wa.me/5547933862514" },
]

const BenefitsStrip = () => {
  return (
    <div className="w-full bg-bibelo-amarelo border-b border-bibelo-rosa">
      <div className="content-container py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        {BENEFITS.map((b, i) => (
          b.href ? (
            <a
              key={i}
              href={b.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-bibelo-dark font-medium hover:text-bibelo-pink transition-colors"
            >
              <span>{b.icon}</span>
              <span>{b.label}</span>
            </a>
          ) : (
            <span key={i} className="flex items-center gap-1.5 text-sm text-bibelo-dark font-medium">
              <span>{b.icon}</span>
              <span>{b.text}</span>
            </span>
          )
        ))}
      </div>
    </div>
  )
}

export default BenefitsStrip
