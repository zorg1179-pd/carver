import { create } from 'zustand'
import type { Layer, Shape, ShapeUpdate } from '@/types'

const MAX_HISTORY = 50

/** Append current shapes snapshot to the undo stack, capping at MAX_HISTORY entries. */
function pushPast(past: Shape[][], current: Shape[]): Shape[][] {
  return [...past.slice(-(MAX_HISTORY - 1)), current]
}

export const DEFAULT_LAYER: Layer = {
  id: 'default',
  name: 'Default',
  visible: true,
  locked: false,
  color: null,
}

interface DocumentState {
  // ── Shapes ──────────────────────────────────────────────────────────────────
  shapes: Shape[]
  past: Shape[][]
  future: Shape[][]
  selectedIds: string[]

  addShape: (shape: Shape) => void
  updateShape: (id: string, updates: ShapeUpdate) => void
  /** Batch-update multiple shapes in a single undo entry (used by alignment). */
  updateShapes: (updates: { id: string; update: ShapeUpdate }[]) => void
  removeShape: (id: string) => void
  removeSelectedShapes: () => void
  /** Remove a set of shapes and insert one replacement in a single undo entry. */
  replaceShapesWithOne: (removeIds: string[], add: Shape) => void
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

  // ── Layers ──────────────────────────────────────────────────────────────────
  layers: Layer[]
  activeLayerId: string

  /** Add a new layer; makes it active and returns its id. */
  addLayer: (name: string) => string
  updateLayer: (id: string, updates: Partial<Omit<Layer, 'id'>>) => void
  /** Delete a layer; shapes on it are moved to 'default'. Cannot delete 'default'. */
  deleteLayer: (id: string) => void
  moveLayerUp: (id: string) => void
  moveLayerDown: (id: string) => void
  setActiveLayerId: (id: string) => void
  /** Reassign shapes to a different layer. */
  moveShapesToLayer: (ids: string[], layerId: string) => void
  /** Bulk-replace layers (used for project load). */
  setLayers: (layers: Layer[], activeLayerId?: string) => void
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  shapes: [],
  past: [],
  future: [],
  selectedIds: [],

  // ── Shape actions ────────────────────────────────────────────────────────────

  addShape: (shape) =>
    set((s) => ({
      // Stamp the active layer onto shapes that don't have one yet
      shapes: [...s.shapes, { layerId: s.activeLayerId, ...shape }],
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  updateShape: (id, updates) =>
    set((s) => ({
      shapes: s.shapes.map((sh) => sh.id === id ? ({ ...sh, ...updates } as Shape) : sh),
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  updateShapes: (updates) =>
    set((s) => ({
      shapes: s.shapes.map((sh) => {
        const u = updates.find((u) => u.id === sh.id)
        return u ? ({ ...sh, ...u.update } as Shape) : sh
      }),
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

  replaceShapesWithOne: (removeIds, add) =>
    set((s) => ({
      shapes: [...s.shapes.filter((sh) => !removeIds.includes(sh.id)), add],
      selectedIds: [add.id],
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

  // ── Layer state ──────────────────────────────────────────────────────────────

  layers: [DEFAULT_LAYER],
  activeLayerId: 'default',

  addLayer: (name) => {
    const id = crypto.randomUUID()
    set((s) => ({
      layers: [...s.layers, { id, name, visible: true, locked: false, color: null }],
      activeLayerId: id,
    }))
    return id
  },

  updateLayer: (id, updates) =>
    set((s) => ({
      layers: s.layers.map((l) => l.id === id ? { ...l, ...updates } : l),
    })),

  deleteLayer: (id) => {
    if (id === 'default') return  // the Default layer is permanent
    set((s) => ({
      // Move all shapes off the deleted layer to 'default'
      shapes: s.shapes.map((sh) => sh.layerId === id ? { ...sh, layerId: 'default' } : sh),
      layers: s.layers.filter((l) => l.id !== id),
      activeLayerId: s.activeLayerId === id ? 'default' : s.activeLayerId,
      past: pushPast(s.past, s.shapes),
      future: [],
    }))
  },

  moveLayerUp: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id)
      if (idx >= s.layers.length - 1) return s
      const next = [...s.layers]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return { layers: next }
    }),

  moveLayerDown: (id) =>
    set((s) => {
      const idx = s.layers.findIndex((l) => l.id === id)
      if (idx <= 0) return s
      const next = [...s.layers]
      ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      return { layers: next }
    }),

  setActiveLayerId: (activeLayerId) => set({ activeLayerId }),

  moveShapesToLayer: (ids, layerId) =>
    set((s) => ({
      shapes: s.shapes.map((sh) => ids.includes(sh.id) ? { ...sh, layerId } : sh),
      past: pushPast(s.past, s.shapes),
      future: [],
    })),

  setLayers: (layers, activeLayerId) =>
    set({
      layers: layers.length ? layers : [DEFAULT_LAYER],
      activeLayerId: activeLayerId ?? layers[0]?.id ?? 'default',
    }),
}))
