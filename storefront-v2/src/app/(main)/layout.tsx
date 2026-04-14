import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import CartDrawer from "@/components/cart/CartDrawer"
import TrackingDrawer from "@/components/tracking/TrackingDrawer"
import CartInitializer from "@/components/cart/CartInitializer"
import MobileNav from "@/components/layout/MobileNav"
import DiscountPopup from "@/components/home/DiscountPopup"
import WhatsAppFloat from "@/components/layout/WhatsAppFloat"
import CrmTracker from "@/components/layout/CrmTracker"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CartInitializer />
      <CrmTracker />
      <Header />
      <main className="min-h-screen">{children}</main>
      <Footer />
      <CartDrawer />
      <TrackingDrawer />
      <MobileNav />
      <DiscountPopup />
      <WhatsAppFloat />
    </>
  )
}
