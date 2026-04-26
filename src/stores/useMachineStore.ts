import { create } from 'zustand'
import type { Units } from '@/types'

interface MachineState {
  bedWidth: number
  bedHeight: number
  units: Units
  safeHeight: number
  originPosition: 'front-left' | 'center'
  setBedWidth: (w: number) => void
  setBedHeight: (h: number) => void
  setUnits: (u: Units) => void
  setSafeHeight: (h: number) => void
  setOriginPosition: (p: 'front-left' | 'center') => void
}

export const useMachineStore = create<MachineState>((set) => ({
  bedWidth: 300,
  bedHeight: 200,
  units: 'mm',
  safeHeight: 5,
  originPosition: 'front-left',
  setBedWidth: (bedWidth) => set({ bedWidth }),
  setBedHeight: (bedHeight) => set({ bedHeight }),
  setUnits: (units) => set({ units }),
  setSafeHeight: (safeHeight) => set({ safeHeight }),
  setOriginPosition: (originPosition) => set({ originPosition }),
}))
