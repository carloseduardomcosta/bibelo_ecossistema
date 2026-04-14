import { create } from "zustand"

interface TrackingState {
  open: boolean
  codigoInicial: string
  openTracking: (codigo?: string) => void
  closeTracking: () => void
}

export const useTrackingStore = create<TrackingState>((set) => ({
  open: false,
  codigoInicial: "",
  openTracking: (codigo = "") => set({ open: true, codigoInicial: codigo }),
  closeTracking: () => set({ open: false, codigoInicial: "" }),
}))
