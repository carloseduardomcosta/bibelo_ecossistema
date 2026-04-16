export const dynamic = "force-dynamic"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    // fixed inset-0 z-[500]: cobre o (main) layout durante transições client-side
    // overflow-y-auto: permite scroll dentro do overlay
    <div className="fixed inset-0 z-[500] bg-[#FAF7F2] overflow-y-auto">
      {children}
    </div>
  )
}
