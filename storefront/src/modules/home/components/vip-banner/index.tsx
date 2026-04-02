const VipBanner = () => {
  return (
    <section className="w-full bg-bibelo-dark py-12">
      <div className="content-container flex flex-col small:flex-row items-center justify-between gap-6">
        <div className="text-center small:text-left">
          <h2 className="font-heading text-2xl small:text-3xl font-semibold text-white mb-2">
            Grupo VIP WhatsApp
          </h2>
          <p className="text-white/70 text-sm small:text-base max-w-md">
            Novidades em primeira mão, promoções exclusivas e dicas de papelaria.
            Mais de 115 membros que adoram papelaria!
          </p>
        </div>
        <a
          href="https://wa.me/5547933862514?text=Oi!%20Quero%20entrar%20no%20Grupo%20VIP!"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-white font-semibold px-8 py-3.5 rounded-full transition-colors text-sm small:text-base shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.918l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.347 0-4.518-.802-6.235-2.147a.75.75 0 00-.652-.13l-3.08 1.033 1.033-3.08a.75.75 0 00-.13-.652A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
          </svg>
          Entrar no Grupo VIP
        </a>
      </div>
    </section>
  )
}

export default VipBanner
