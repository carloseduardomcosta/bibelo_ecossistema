"use client"

// Grid visual do feed @papelariabibelo.
// Posts reais via API ficam disponíveis quando o token Meta receber instagram_basic.
const POSTS = [
  { gradient: "from-pink-300 via-rose-200 to-yellow-100",    emoji: "✏️", label: "Lápis & Cores" },
  { gradient: "from-purple-300 via-pink-200 to-rose-100",    emoji: "📒", label: "Cadernos" },
  { gradient: "from-yellow-200 via-amber-100 to-orange-100", emoji: "🖊️", label: "Canetas Premium" },
  { gradient: "from-rose-300 via-pink-200 to-fuchsia-100",   emoji: "🎁", label: "Kits Presentes" },
  { gradient: "from-teal-200 via-cyan-100 to-sky-100",       emoji: "🗂️", label: "Organizadores" },
  { gradient: "from-violet-300 via-purple-100 to-pink-100",  emoji: "📐", label: "Material Escolar" },
]

export default function InstagramPlaceholder() {
  return (
    <section className="py-10 md:py-14">
      <div className="content-container">

        {/* Cabeçalho */}
        <div className="flex items-end justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Ícone Instagram */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center shadow-sm shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-bibelo-pink leading-none mb-0.5">
                @papelariabibelo
              </p>
              <h2
                className="text-2xl md:text-3xl font-bold text-bibelo-dark leading-tight"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Siga no Instagram
              </h2>
            </div>
          </div>
          <a
            href="https://instagram.com/papelariabibelo"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-bibelo-pink hover:underline"
          >
            Ver perfil →
          </a>
        </div>

        {/* Grid de posts */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          {POSTS.map((post, i) => (
            <a
              key={i}
              href="https://instagram.com/papelariabibelo"
              target="_blank"
              rel="noreferrer"
              className="group relative aspect-square rounded-2xl overflow-hidden"
            >
              {/* Fundo gradiente */}
              <div className={`absolute inset-0 bg-gradient-to-br ${post.gradient}`} />

              {/* Conteúdo */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2">
                <span className="text-2xl md:text-3xl drop-shadow">{post.emoji}</span>
                <span className="text-[10px] md:text-xs font-semibold text-bibelo-dark/70 text-center leading-tight">
                  {post.label}
                </span>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
                  fill="currentColor" viewBox="0 0 24 24"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </div>
            </a>
          ))}
        </div>

        {/* CTA mobile */}
        <div className="mt-4 text-center sm:hidden">
          <a
            href="https://instagram.com/papelariabibelo"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white font-semibold px-6 py-2.5 rounded-full text-sm shadow"
          >
            Ver perfil
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>

      </div>
    </section>
  )
}
