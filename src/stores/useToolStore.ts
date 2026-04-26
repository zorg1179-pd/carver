import { create } from 'zustand'
import type { BitType } from '@/types'

interface ToolState {
  bitType: BitType
  diameter: number        // cutting diameter in current units
  vBitAngle: number       // degrees — only relevant when bitType === 'v-bit'
  spindleRpm: number
  feedRate: number        // XY feed in units/min
  plungeRate: number      // Z feed in units/min
  maxDepthPerPass: number
  setBitType: (t: BitType) => void
  setDiameter: (d: number) => void
  setVBitAngle: (a: number) => void
  setSpindleRpm: (r: number) => void
  setFeedRate: (f: number) => void
  setPlungeRate: (f: number) => void
  setMaxDepthPerPass: (d: number) => void
}

export const useToolStore = create<ToolState>((set) => ({
  bitType: 'flat-end-mill',
  diameter: 3.175,        // 1/8" in mm
  vBitAngle: 60,
  spindleRpm: 18000,
  feedRate: 1200,         // mm/min
  plungeRate: 300,
  maxDepthPerPass: 1,
  setBitType: (bitType) => set({ bitType }),
  setDiameter: (diameter) => set({ diameter }),
  setVBitAngle: (vBitAngle) => set({ vBitAngle }),
  setSpindleRpm: (spindleRpm) => set({ spindleRpm }),
  setFeedRate: (feedRate) => set({ feedRate }),
  setPlungeRate: (plungeRate) => set({ plungeRate }),
  setMaxDepthPerPass: (maxDepthPerPass) => set({ maxDepthPerPass }),
}))
