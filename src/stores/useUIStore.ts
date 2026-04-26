import { create } from 'zustand'

export type ToolType = 'select' | 'line' | 'rect' | 'circle' | 'text'
export type SimSpeed = 'slow' | 'normal' | 'fast'

interface UIState {
  currentTool: ToolType
  setCurrentTool: (t: ToolType) => void

  /** Whether the toolpath overlay is visible on the canvas. */
  showToolpaths: boolean
  setShowToolpaths: (v: boolean) => void

  /** Whether the tool-head animation is running. */
  toolpathPlaying: boolean
  setToolpathPlaying: (v: boolean) => void

  /** Animation playback speed. */
  toolpathSpeed: SimSpeed
  setToolpathSpeed: (s: SimSpeed) => void

  /** Incrementing this token resets the animation to the start. */
  toolpathResetToken: number
  resetToolpathAnimation: () => void
}

export const useUIStore = create<UIState>((set) => ({
  currentTool: 'select',
  setCurrentTool: (currentTool) => set({ currentTool }),

  showToolpaths: false,
  setShowToolpaths: (showToolpaths) => set({ showToolpaths }),

  toolpathPlaying: false,
  setToolpathPlaying: (toolpathPlaying) => set({ toolpathPlaying }),

  toolpathSpeed: 'normal',
  setToolpathSpeed: (toolpathSpeed) => set({ toolpathSpeed }),

  toolpathResetToken: 0,
  resetToolpathAnimation: () =>
    set((s) => ({ toolpathResetToken: s.toolpathResetToken + 1, toolpathPlaying: false })),
}))
