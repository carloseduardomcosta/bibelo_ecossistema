import Link from "next/link"
import Image from "next/image"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <Image
        src="/logo-bibelo.png"
        alt="Papelaria Bibelô"
        width={80}
        height={80}
        className="w-20 h-20 rounded-full border-2 border-bibelo-pink/20 mb-6"
      />
      <h1 className="text-6xl font-black text-bibelo-pink mb-2">404</h1>
      <h2 className="text-xl font-bold text-bibelo-dark mb-2">Página não encontrada</h2>
      <p className="text-gray-500 mb-8 max-w-md">
        A página que você está procurando não existe ou foi movida. Que tal explorar nossos produtos?
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/" className="btn-primary px-8 py-3">
          Voltar ao início
        </Link>
        <Link href="/produtos" className="btn-secondary px-8 py-3">
          Ver produtos
        </Link>
      </div>
    </div>
  )
}
