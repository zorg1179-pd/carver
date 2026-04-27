import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ToolProfile } from '@/types'

interface ToolLibraryState {
  profiles: ToolProfile[]
  activeId: string | null

  saveProfile:   (name: string, data: Omit<ToolProfile, 'id' | 'name'>) => string
  updateProfile: (id: string,   data: Omit<ToolProfile, 'id' | 'name'>) => void
  renameProfile: (id: string,   name: string) => void
  deleteProfile: (id: string) => void
  setActiveId:   (id: string | null) => void
}

export const useToolLibraryStore = create<ToolLibraryState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeId: null,

      saveProfile: (name, data) => {
        const id = crypto.randomUUID()
        set(s => ({ profiles: [...s.profiles, { id, name, ...data }], activeId: id }))
        return id
      },

      updateProfile: (id, data) => {
        set(s => ({
          profiles: s.profiles.map(p => p.id === id ? { ...p, ...data } : p),
        }))
      },

      renameProfile: (id, name) => {
        set(s => ({
          profiles: s.profiles.map(p => p.id === id ? { ...p, name } : p),
        }))
      },

      deleteProfile: (id) => {
        const { profiles, activeId } = get()
        const remaining = profiles.filter(p => p.id !== id)
        const newActive = activeId === id ? null : activeId
        set({ profiles: remaining, activeId: newActive })
      },

      setActiveId: (activeId) => set({ activeId }),
    }),
    { name: 'carver_tool_library_v1' },
  ),
)
