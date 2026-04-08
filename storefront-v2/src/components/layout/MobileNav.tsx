"use client"

import BottomNav from "./BottomNav"
import SideMenu from "./SideMenu"
import { useMenuStore } from "@/store/menu"

export default function MobileNav() {
  const { open, closeMenu } = useMenuStore()

  return (
    <>
      <BottomNav />
      <SideMenu open={open} onClose={closeMenu} />
      {/* Espaçador para o conteúdo não ficar atrás da bottom nav no mobile */}
      <div className="md:hidden h-14" />
    </>
  )
}
