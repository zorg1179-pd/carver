import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MaterialPreset } from '@/types'
import { BUILT_IN_MATERIALS } from '@/data/materialPresets'

interface MaterialLibraryState {
  customPresets: MaterialPreset[]
  activeId: string | null

  allPresets: () => MaterialPreset[]

  addCustomPreset:    (name: string, preset: Omit<MaterialPreset, 'id' | 'name' | 'isBuiltIn'>) => string
  updateCustomPreset: (id: string,   patch: Partial<Omit<MaterialPreset, 'id' | 'isBuiltIn'>>) => void
  deleteCustomPreset: (id: string) => void
  setActiveId:        (id: string | null) => void
}

export const useMaterialLibraryStore = create<MaterialLibraryState>()(
  persist(
    (set, get) => ({
      customPresets: [],
      activeId: null,

      allPresets: () => [...BUILT_IN_MATERIALS, ...get().customPresets],

      addCustomPreset: (name, preset) => {
        const id = crypto.randomUUID()
        const entry: MaterialPreset = { id, name, isBuiltIn: false, ...preset }
        set(s => ({ customPresets: [...s.customPresets, entry], activeId: id }))
        return id
      },

      updateCustomPreset: (id, patch) => {
        set(s => ({
          customPresets: s.customPresets.map(p => p.id === id ? { ...p, ...patch } : p),
        }))
      },

      deleteCustomPreset: (id) => {
        const { customPresets, activeId } = get()
        set({
          customPresets: customPresets.filter(p => p.id !== id),
          activeId: activeId === id ? null : activeId,
        })
      },

      setActiveId: (activeId) => set({ activeId }),
    }),
    {
      name: 'carver_material_library_v1',
      // Only persist custom presets and activeId — built-ins come from code
      partialize: (s) => ({ customPresets: s.customPresets, activeId: s.activeId }),
    },
  ),
)
