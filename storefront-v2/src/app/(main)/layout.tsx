import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import CartDrawer from "@/components/cart/CartDrawer"
import CartInitializer from "@/components/cart/CartInitializer"
import MobileNav from "@/components/layout/MobileNav"
import DiscountPopup from "@/components/home/DiscountPopup"
import WhatsAppFloat from "@/components/layout/WhatsAppFloat"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CartInitializer />
      <Header />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <CartDrawer />
      <MobileNav />
      <DiscountPopup />
      <WhatsAppFloat />
    </>
  )
}
