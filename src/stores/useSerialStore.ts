import { create } from 'zustand'
import type { Vec3 } from '@/types'

export type SerialStatus =
  | 'disconnected'
  | 'connected'
  | 'running'
  | 'paused'
  | 'error'

interface SerialState {
  status:         SerialStatus
  baudRate:       number
  controllerName: string
  machinePos:     Vec3 | null
  workPos:        Vec3 | null
  currentLine:    number
  totalLines:     number
  errorMsg:       string | null
  setBaudRate:    (rate: number) => void
}

export const useSerialStore = create<SerialState>((set) => ({
  status:         'disconnected',
  baudRate:       115200,
  controllerName: '',
  machinePos:     null,
  workPos:        null,
  currentLine:    0,
  totalLines:     0,
  errorMsg:       null,
  setBaudRate: (baudRate) => set({ baudRate }),
}))
