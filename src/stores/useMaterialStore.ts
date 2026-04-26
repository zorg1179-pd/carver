import { create } from 'zustand'

interface MaterialState {
  thickness: number       // stock thickness in current units
  stockSurfaceZ: number   // Z offset if using fixture offsets
  setThickness: (t: number) => void
  setStockSurfaceZ: (z: number) => void
}

export const useMaterialStore = create<MaterialState>((set) => ({
  thickness: 19,          // ~3/4" in mm
  stockSurfaceZ: 0,
  setThickness: (thickness) => set({ thickness }),
  setStockSurfaceZ: (stockSurfaceZ) => set({ stockSurfaceZ }),
}))
