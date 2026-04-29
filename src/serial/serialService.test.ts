import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { connect, disconnect, startJob, pauseJob, resumeJob, cancelJob, skipToLine } from './serialService'
import { useSerialStore } from '@/stores/useSerialStore'

// ── Mock WebSerial API ────────────────────────────────────────────────────────
function makeMockPort() {
  const mockWrite   = vi.fn().mockResolvedValue(undefined)
  const mockRelease = vi.fn()
  const mockCancel  = vi.fn().mockResolvedValue(undefined)

  return {
    open:  vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    readable: {
      getReader: () => ({
        read:        vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
        cancel:      mockCancel,
      }),
    },
    writable: {
      getWriter: () => ({
        write:       mockWrite,
        releaseLock: mockRelease,
      }),
    },
    _mockWrite:   mockWrite,
    _mockCancel:  mockCancel,
    _mockRelease: mockRelease,
  }
}

let mockPort: ReturnType<typeof makeMockPort>

beforeEach(() => {
  mockPort = makeMockPort()
  Object.defineProperty(global, 'navigator', {
    value: {
      serial: { requestPort: vi.fn().mockResolvedValue(mockPort) },
    },
    writable: true,
    configurable: true,
  })
  useSerialStore.setState({
    status: 'disconnected', baudRate: 115200, controllerName: '',
    machinePos: null, workPos: null, currentLine: 0, totalLines: 0, errorMsg: null,
  })
})

afterEach(async () => {
  await disconnect()
})

describe('connect()', () => {
  it('calls requestPort and opens port with correct baud rate', async () => {
    await connect()
    expect(navigator.serial.requestPort).toHaveBeenCalled()
    expect(mockPort.open).toHaveBeenCalledWith({ baudRate: 115200 })
  })

  it('sets status to connected', async () => {
    await connect()
    expect(useSerialStore.getState().status).toBe('connected')
  })

  it('sends $I to request firmware version', async () => {
    await connect()
    const calls = mockPort._mockWrite.mock.calls.map(
      (c: [Uint8Array]) => new TextDecoder().decode(c[0]),
    )
    expect(calls).toContain('$I\n')
  })

  it('uses the baud rate from the store', async () => {
    useSerialStore.getState().setBaudRate(9600)
    await connect()
    expect(mockPort.open).toHaveBeenCalledWith({ baudRate: 9600 })
  })
})

describe('disconnect()', () => {
  it('sets status to disconnected and clears positions', async () => {
    await connect()
    useSerialStore.setState({ workPos: { x: 1, y: 2, z: 3 } })
    await disconnect()
    const s = useSerialStore.getState()
    expect(s.status).toBe('disconnected')
    expect(s.workPos).toBeNull()
    expect(s.controllerName).toBe('')
  })
})

describe('startJob()', () => {
  it('sets status to running and sets total lines', async () => {
    await connect()
    await startJob('G0 X0 Y0\nG1 X10 F500\nG0 Z5')
    const s = useSerialStore.getState()
    expect(s.status).toBe('running')
    expect(s.totalLines).toBe(3)
    expect(s.currentLine).toBe(0)
  })

  it('strips blank lines and ; comments from gcode', async () => {
    await connect()
    await startJob('G0 X0 Y0\n; this is a comment\n\nG1 X10 F500')
    expect(useSerialStore.getState().totalLines).toBe(2)
  })

  it('does nothing when not connected', async () => {
    await startJob('G0 X0')
    expect(useSerialStore.getState().status).toBe('disconnected')
  })
})

describe('cancelJob()', () => {
  it('clears the queue and resets to connected status', async () => {
    await connect()
    await startJob('G0 X0\nG1 X10\nG1 X20')
    cancelJob()
    const s = useSerialStore.getState()
    expect(s.status).toBe('connected')
    expect(s.currentLine).toBe(0)
    expect(s.totalLines).toBe(0)
  })
})

describe('skipToLine()', () => {
  it('moves the send queue pointer and updates currentLine', async () => {
    await connect()
    await startJob('G0 X0\nG1 X10\nG1 X20\nG1 X30')
    pauseJob()
    skipToLine(2)
    expect(useSerialStore.getState().currentLine).toBe(2)
  })

  it('clamps to valid range', async () => {
    await connect()
    await startJob('G0 X0\nG1 X10')
    pauseJob()
    skipToLine(999)
    expect(useSerialStore.getState().currentLine).toBe(2)
  })

  it('does nothing when not paused', async () => {
    await connect()
    await startJob('G0 X0\nG1 X10')
    skipToLine(1)  // running, not paused — should be ignored
    expect(useSerialStore.getState().currentLine).toBe(0)
  })
})
