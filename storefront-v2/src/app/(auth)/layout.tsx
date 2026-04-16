export const dynamic = "force-dynamic"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {children}
    </div>
  )
}
