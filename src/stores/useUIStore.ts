import { create } from 'zustand'

export type ToolType = 'select' | 'line' | 'rect' | 'circle' | 'text'
export type SimSpeed = 'slow' | 'normal' | 'fast'

export const TEXT_FONTS = [
  'Arial',
  'Arial Black',
  'Courier New',
  'Georgia',
  'Impact',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
] as const

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

  /** Text tool font settings. */
  textFont: string
  setTextFont: (f: string) => void
  textFontSize: number
  setTextFontSize: (s: number) => void
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

  textFont: 'Arial',
  setTextFont: (textFont) => set({ textFont }),
  textFontSize: 10,
  setTextFontSize: (textFontSize) => set({ textFontSize }),
}))
