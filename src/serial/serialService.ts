import { useSerialStore } from '@/stores/useSerialStore'
import { parseStatusResponse, parseControllerName, getGrblErrorDescription } from './grblParser'

// ── Module-level serial state ─────────────────────────────────────────────────
let port:       SerialPort | null                              = null
let portReader: ReadableStreamDefaultReader<Uint8Array> | null = null
let writer:     WritableStreamDefaultWriter<Uint8Array> | null = null
let pollTimer:  ReturnType<typeof setInterval> | null          = null
let allLines:   string[]                                       = []
let sendQueue:  string[]                                       = []
let waitingForOk = false

const enc = new TextEncoder()

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeRaw(data: string): Promise<void> {
  if (!writer) return
  await writer.write(enc.encode(data))
}

function handleLine(line: string): void {
  if (!line) return

  if (line === 'ok') {
    if (!waitingForOk) return
    waitingForOk = false
    useSerialStore.setState((s) => ({ currentLine: s.currentLine + 1 }))
    flushQueue()
    return
  }

  if (line.startsWith('error:')) {
    const code = parseInt(line.slice(6), 10)
    useSerialStore.setState({
      errorMsg: `error:${code} — ${getGrblErrorDescription(code)}`,
      status: 'paused',
    })
    waitingForOk = false
    return
  }

  if (line.startsWith('<')) {
    const result = parseStatusResponse(line)
    if (result) {
      useSerialStore.setState({ workPos: result.workPos, machinePos: result.machinePos })
    }
    return
  }

  const name = parseControllerName(line)
  if (name) useSerialStore.setState({ controllerName: name })
}

function flushQueue(): void {
  if (waitingForOk || sendQueue.length === 0) return
  if (useSerialStore.getState().status === 'paused') return
  const line = sendQueue.shift()!
  waitingForOk = true
  writeRaw(line + '\n').catch(() => {})
}

async function readLoop(): Promise<void> {
  if (!port?.readable) return
  portReader = port.readable.getReader()
  const dec = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await portReader.read()
      if (done) break
      buffer += dec.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const trimmed = raw.trim()
        if (trimmed) handleLine(trimmed)
      }
    }
  } catch {
    if (useSerialStore.getState().status !== 'disconnected') {
      useSerialStore.setState({ status: 'error', errorMsg: 'Connection lost' })
    }
  } finally {
    portReader = null
    stopPoll()
  }
}

function startPoll(): void {
  stopPoll()
  pollTimer = setInterval(() => {
    writer?.write(enc.encode('?')).catch(() => {})
  }, 250)
}

function stopPoll(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function connect(): Promise<void> {
  const { baudRate } = useSerialStore.getState()
  try {
    port = await navigator.serial.requestPort()
    await port.open({ baudRate })
    writer = port.writable.getWriter()
    useSerialStore.setState({ status: 'connected', errorMsg: null, controllerName: '' })
    readLoop()
    startPoll()
    await writeRaw('$I\n')
  } catch (err) {
    useSerialStore.setState({
      status: 'error',
      errorMsg: err instanceof Error ? err.message : 'Failed to connect',
    })
  }
}

export async function disconnect(): Promise<void> {
  stopPoll()
  sendQueue = []
  allLines  = []
  waitingForOk = false
  try {
    await portReader?.cancel()
    portReader = null
    writer?.releaseLock()
    writer = null
    await port?.close()
    port = null
  } catch { /* ignore cleanup errors */ }
  useSerialStore.setState({
    status: 'disconnected',
    workPos: null,
    machinePos: null,
    currentLine: 0,
    totalLines: 0,
    controllerName: '',
    errorMsg: null,
  })
}

export async function startJob(gcode: string): Promise<void> {
  if (useSerialStore.getState().status !== 'connected') return
  const lines = gcode
    .split('\n')
    // TODO: also strip (...) parenthesis-style G-code comments for CAM compatibility
    .map((l) => l.replace(/;.*$/, '').trim())
    .filter((l) => l.length > 0)
  allLines  = lines
  sendQueue = [...lines]
  waitingForOk = false
  useSerialStore.setState({ totalLines: lines.length, currentLine: 0, status: 'running', errorMsg: null })
  flushQueue()
}

export function pauseJob(): void {
  if (useSerialStore.getState().status !== 'running') return
  useSerialStore.setState({ status: 'paused' })
  writer?.write(enc.encode('!')).catch(() => {})
}

export function resumeJob(): void {
  if (useSerialStore.getState().status !== 'paused') return
  useSerialStore.setState({ status: 'running' })
  writer?.write(enc.encode('~')).catch(() => {})
  flushQueue()
}

export function cancelJob(): void {
  const { status } = useSerialStore.getState()
  if (status !== 'running' && status !== 'paused') return
  sendQueue    = []
  allLines     = []
  waitingForOk = false
  writer?.write(enc.encode('\x18')).catch(() => {})
  useSerialStore.setState({ status: 'connected', currentLine: 0, totalLines: 0, errorMsg: null })
}

export function skipToLine(line: number): void {
  if (useSerialStore.getState().status !== 'paused') return
  const clamped = Math.max(0, Math.min(line, allLines.length))
  sendQueue    = allLines.slice(clamped)
  waitingForOk = false
  useSerialStore.setState({ currentLine: clamped })
}
