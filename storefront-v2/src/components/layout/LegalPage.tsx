import Link from "next/link"

interface LegalPageProps {
  title: string
  children: React.ReactNode
}

export default function LegalPage({ title, children }: LegalPageProps) {
  return (
    <div className="content-container py-8 max-w-3xl mx-auto">
      <nav className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <Link href="/" className="hover:text-bibelo-pink transition-colors">Início</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{title}</span>
      </nav>

      <h1 className="text-2xl md:text-3xl font-bold text-bibelo-dark mb-8">{title}</h1>

      <div className="legal-content space-y-4 text-sm text-gray-600 leading-relaxed">
        {children}
      </div>
    </div>
  )
}
