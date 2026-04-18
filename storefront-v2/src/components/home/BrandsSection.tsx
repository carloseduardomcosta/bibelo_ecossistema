import Link from "next/link"

const BRANDS = [
  { nome: "Faber-Castell", slug: "faber-castell", cor: "#009543", texto: "#fff", inicial: "F" },
  { nome: "Tilibra",       slug: "tilibra",       cor: "#e11d48", texto: "#fff", inicial: "T" },
  { nome: "BRW",           slug: "brw",           cor: "#1d4ed8", texto: "#fff", inicial: "B" },
  { nome: "Tris",          slug: "tris",           cor: "#7c3aed", texto: "#fff", inicial: "T" },
  { nome: "Cis",           slug: "cis",            cor: "#ea580c", texto: "#fff", inicial: "C" },
  { nome: "Stabilo",       slug: "stabilo",        cor: "#84cc16", texto: "#fff", inicial: "S" },
]

export default function BrandsSection() {
  return (
    <section className="py-10 md:py-14">
      <div className="content-container">

        {/* Cabeçalho */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold text-bibelo-pink mb-1">
              Grandes marcas
            </p>
            <h2
              className="text-2xl md:text-3xl font-bold text-bibelo-dark"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Compre por Marca
            </h2>
          </div>
          <Link
            href="/produtos"
            className="text-sm font-medium text-bibelo-pink hover:underline hidden sm:block"
          >
            Ver todos →
          </Link>
        </div>

        {/* Grid de marcas */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {BRANDS.map((brand) => (
            <Link
              key={brand.slug}
              href={`/produtos?q=${brand.slug}`}
              className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-bibelo-gray bg-white hover:shadow-md hover:-translate-y-1 transition-all duration-200"
            >
              {/* Avatar com inicial */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-xl shadow-sm"
                style={{ backgroundColor: brand.cor, color: brand.texto }}
              >
                {brand.inicial}
              </div>
              <span className="text-xs font-semibold text-bibelo-dark text-center leading-tight group-hover:text-bibelo-pink transition-colors">
                {brand.nome}
              </span>
            </Link>
          ))}
        </div>

      </div>
    </section>
  )
}
