import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PostProcessorState {
  activeId: string
  setActiveId: (id: string) => void
}

export const usePostProcessorStore = create<PostProcessorState>()(
  persist(
    (set) => ({
      activeId: 'fluidnc',
      setActiveId: (activeId) => set({ activeId }),
    }),
    { name: 'carver_post_processor_v1' },
  ),
)
