import { describe, it, expect, beforeEach } from 'vitest'
import { useSerialStore } from './useSerialStore'

const DEFAULT_STATE = {
  status: 'disconnected' as const,
  baudRate: 115200,
  controllerName: '',
  machinePos: null,
  workPos: null,
  currentLine: 0,
  totalLines: 0,
  errorMsg: null,
}

beforeEach(() => {
  useSerialStore.setState(DEFAULT_STATE)
})

describe('useSerialStore', () => {
  it('initializes with default state', () => {
    const { status, baudRate, workPos, errorMsg } = useSerialStore.getState()
    expect(status).toBe('disconnected')
    expect(baudRate).toBe(115200)
    expect(workPos).toBeNull()
    expect(errorMsg).toBeNull()
  })

  it('setBaudRate updates baud rate', () => {
    useSerialStore.getState().setBaudRate(9600)
    expect(useSerialStore.getState().baudRate).toBe(9600)
  })

  it('setState can update status', () => {
    useSerialStore.setState({ status: 'connected' })
    expect(useSerialStore.getState().status).toBe('connected')
  })

  it('setState can update positions', () => {
    const work = { x: 1.5, y: 2.5, z: -3 }
    useSerialStore.setState({ workPos: work })
    expect(useSerialStore.getState().workPos).toEqual(work)
  })

  it('setState can update line progress', () => {
    useSerialStore.setState({ currentLine: 42, totalLines: 100 })
    const s = useSerialStore.getState()
    expect(s.currentLine).toBe(42)
    expect(s.totalLines).toBe(100)
  })
})
