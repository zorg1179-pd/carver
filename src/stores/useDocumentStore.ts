import { create } from 'zustand'
import type { Shape, ShapeUpdate } from '@/types'

const MAX_HISTORY = 50

function pushPast(past: Shape[][], current: Shape[]): Shape[][] {
  return [...past.slice(-(MAX_HISTORY - 1)), current]
}

interface DocumentState {
  shapes: Shape[]
  past: Shape[][]
  future: Shape[][]
  selectedIds: string[]
  addShape: (shape: Shape) => void
  updateShape: (id: string, updates: ShapeUpdate) => void
  removeShape: (id: string) => void
  removeSelectedShapes: () => void
  /** Replace selection with a single shape (or clear if null). */
  setSelectedId: (id: string | null) => void
  /** Replace the entire selection with the given set of IDs. */
  setSelectedIds: (ids: string[]) => void
  /** Toggle a shape in/out of the current multi-selection. */
  addToSelection: (id: string) => void
  clearSelection: () => void
  /** Reset shapes + clear history (used for project load/new). */
  clearShapes: () => void
  /** Bulk-set shapes for project load — resets history. */
  setShapes: (shapes: Shape[]) => void
  undo: () => void
  redo: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  shapes: [],
  past: [],
  future: [],
  selectedIds: [],

  addShape: (shape) =>
    set((s) => ({
      shapes: [...s.shapes, shape],
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  updateShape: (id, updates) =>
    set((s) => ({
      shapes: s.shapes.map((sh) => sh.id === id ? ({ ...sh, ...updates } as Shape) : sh),
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  removeShape: (id) =>
    set((s) => ({
      shapes: s.shapes.filter((sh) => sh.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  removeSelectedShapes: () =>
    set((s) => ({
      shapes: s.shapes.filter((sh) => !s.selectedIds.includes(sh.id)),
      selectedIds: [],
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  setSelectedId: (id) => set({ selectedIds: id ? [id] : [] }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((sid) => sid !== id)
        : [...s.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),

  clearShapes: () => set({ shapes: [], selectedIds: [], past: [], future: [] }),

  setShapes: (shapes) => set({ shapes, selectedIds: [], past: [], future: [] }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const previous = s.past[s.past.length - 1]
      return {
        shapes: previous,
        past: s.past.slice(0, -1),
        future: [s.shapes, ...s.future.slice(0, MAX_HISTORY - 1)],
        selectedIds: [],
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[0]
      return {
        shapes: next,
        past: pushPast(s.past, s.shapes),
        future: s.future.slice(1),
        selectedIds: [],
      }
    }),
}))
