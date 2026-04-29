import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MachineProfile } from '@/types'
import { BUILT_IN_MACHINE_PROFILES } from '@/data/machineProfiles'

interface MachineProfileState {
  customProfiles: MachineProfile[]
  activeId: string | null

  allProfiles: () => MachineProfile[]
  saveProfile:   (name: string, data: Omit<MachineProfile, 'id' | 'name' | 'isBuiltIn'>) => string
  updateProfile: (id: string,   data: Omit<MachineProfile, 'id' | 'name' | 'isBuiltIn'>) => void
  deleteProfile: (id: string) => void
  setActiveId:   (id: string | null) => void
}

export const useMachineProfileStore = create<MachineProfileState>()(
  persist(
    (set, get) => ({
      customProfiles: [],
      activeId: null,

      allProfiles: () => [...BUILT_IN_MACHINE_PROFILES, ...get().customProfiles],

      saveProfile: (name, data) => {
        const id = crypto.randomUUID()
        const profile: MachineProfile = { id, name, isBuiltIn: false, ...data }
        set(s => ({ customProfiles: [...s.customProfiles, profile], activeId: id }))
        return id
      },

      updateProfile: (id, data) => {
        set(s => ({
          customProfiles: s.customProfiles.map(p =>
            p.id === id ? { ...p, ...data } : p,
          ),
        }))
      },

      deleteProfile: (id) => {
        const { customProfiles, activeId } = get()
        set({
          customProfiles: customProfiles.filter(p => p.id !== id),
          activeId: activeId === id ? null : activeId,
        })
      },

      setActiveId: (activeId) => set({ activeId }),
    }),
    {
      name: 'carver_machine_profiles_v1',
      partialize: (s) => ({ customProfiles: s.customProfiles, activeId: s.activeId }),
    },
  ),
)
