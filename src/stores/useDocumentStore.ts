import { create } from 'zustand'
import type { Shape, ShapeUpdate } from '@/types'

interface DocumentState {
  shapes: Shape[]
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
  clearShapes: () => void
}

export const useDocumentStore = create<DocumentState>((set) => ({
  shapes: [],
  selectedIds: [],

  addShape: (shape) =>
    set((state) => ({ shapes: [...state.shapes, shape] })),

  updateShape: (id, updates) =>
    set((state) => ({
      shapes: state.shapes.map((s) =>
        s.id === id ? ({ ...s, ...updates } as Shape) : s,
      ),
    })),

  removeShape: (id) =>
    set((state) => ({
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedIds: state.selectedIds.filter((sid) => sid !== id),
    })),

  removeSelectedShapes: () =>
    set((state) => ({
      shapes: state.shapes.filter((s) => !state.selectedIds.includes(s.id)),
      selectedIds: [],
    })),

  setSelectedId: (id) =>
    set({ selectedIds: id ? [id] : [] }),

  setSelectedIds: (ids) =>
    set({ selectedIds: ids }),

  addToSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((sid) => sid !== id)
        : [...state.selectedIds, id],
    })),

  clearSelection: () => set({ selectedIds: [] }),

  clearShapes: () => set({ shapes: [], selectedIds: [] }),
}))
