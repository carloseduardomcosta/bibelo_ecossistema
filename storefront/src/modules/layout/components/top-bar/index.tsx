const TopBar = () => {
  return (
    <div className="bg-bibelo-amarelo text-bibelo-dark text-xs hidden small:block">
      <div className="content-container flex items-center justify-between h-10">
        <span className="font-medium">
          Frete grátis acima de R$ 199
        </span>
        <div className="flex items-center gap-x-6">
          <span className="flex items-center gap-x-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            Timbó/SC
          </span>
          <a
            href="https://wa.me/5547933862514"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-x-1 hover:text-bibelo-pink transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            (47) 9 3386-2514
          </a>
        </div>
      </div>
    </div>
  )
}

export default TopBar
