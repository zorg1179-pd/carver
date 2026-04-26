import { create } from 'zustand'
import type { Toolpath } from '@/types'

interface ToolpathState {
  toolpaths: Toolpath[]
  gcode: string
  isComputing: boolean
  setToolpaths: (toolpaths: Toolpath[]) => void
  setGcode: (gcode: string) => void
  setIsComputing: (computing: boolean) => void
  clear: () => void
}

export const useToolpathStore = create<ToolpathState>((set) => ({
  toolpaths: [],
  gcode: '',
  isComputing: false,
  setToolpaths: (toolpaths) => set({ toolpaths }),
  setGcode: (gcode) => set({ gcode }),
  setIsComputing: (isComputing) => set({ isComputing }),
  clear: () => set({ toolpaths: [], gcode: '' }),
}))
