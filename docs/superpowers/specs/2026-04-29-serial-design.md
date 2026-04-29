# Phase 2.2 — WebSerial Send-to-Machine Design

## Overview

Closes the design→cut loop by letting users send generated G-code directly to a connected FluidNC/GRBL controller from the browser via the WebSerial API. Adds real-time machine position feedback as a canvas crosshair and a job progress bar with ETA.

---

## New Files

| File | Purpose |
|---|---|
| `src/serial/serialService.ts` | WebSerial wrapper — connect, read loop, write queue, status polling |
| `src/stores/useSerialStore.ts` | Zustand store — connection state, position, job progress, actions |
| `src/components/SerialStatusBar.tsx` | Always-visible bar docked to the bottom of the canvas |
| `src/canvas/MachinePositionLayer.tsx` | Konva layer that draws the position crosshair |

## Modified Files

| File | Change |
|---|---|
| `src/components/HeaderBar.tsx` | Add Connect button with baud-rate / disconnect popover |
| `src/canvas/CanvasStage.tsx` | Mount `MachinePositionLayer` |
| `src/pages/EditorPage.tsx` | Render `SerialStatusBar` below the canvas |

---

## Store Shape (`useSerialStore.ts`)

```ts
type SerialStatus = 'disconnected' | 'connected' | 'running' | 'paused' | 'error'

interface SerialState {
  status:         SerialStatus
  baudRate:       number                                   // default 115200
  controllerName: string                                   // e.g. "FluidNC v3.7"
  machinePos:     { x: number; y: number; z: number } | null
  workPos:        { x: number; y: number; z: number } | null
  currentLine:    number
  totalLines:     number
  errorMsg:       string | null
  // actions
  connect:        () => Promise<void>
  disconnect:     () => Promise<void>
  startJob:       (gcode: string) => Promise<void>
  pauseJob:       () => void
  resumeJob:      () => void
  cancelJob:      () => void
  skipToLine:     (line: number) => void
  setBaudRate:    (rate: number) => void
}
```

`progress` is derived: `currentLine / totalLines`. Not stored separately.

The store is **runtime-only** — not persisted to localStorage or the `.carver` project file.

---

## `serialService.ts` Internals

A plain TS module (not a class). Holds refs to the open `SerialPort`, reader, and writer internally. Interacts with the store via `useSerialStore.getState()`.

### Connect flow

1. `navigator.serial.requestPort()` — browser shows native port picker
2. `port.open({ baudRate })` — opens the port
3. Send `$I\n` — controller responds with firmware string → stored as `controllerName`
4. Start read loop (background, runs until `disconnect()`)
5. Start position poll interval: `?` every 250 ms

### Send protocol (GRBL/FluidNC ok-handshake)

- Strip blank lines and comments (`; ...`, `( ... )`) from G-code before sending
- Send one line at a time; wait for `ok\r\n` before sending the next
- `error:N` response → pause job, surface error in status bar — do not auto-skip
- Real-time commands (sent outside the handshake queue):
  - `!` → feed hold (pause)
  - `~` → cycle start (resume)
  - `\x18` → soft reset (cancel), then clear the send queue

### Status polling

- `?` is a real-time command — write it directly to the port every 250 ms without entering the handshake queue
- Parse response format:
  - `<State|WPos:x,y,z|FS:f,s>` — WPos available directly
  - `<State|MPos:x,y,z|WCO:wx,wy,wz|...>` — compute WPos = MPos − WCO
- Store both `workPos` and `machinePos`; canvas crosshair uses `workPos`

### Read loop

A single `TextDecoderStream` pipeline reads all incoming bytes. Lines are dispatched by prefix:

| Pattern | Action |
|---|---|
| `ok` | Advance send queue, increment `currentLine` |
| `error:N` | Pause job, set `errorMsg` to GRBL error description |
| `<...>` | Parse position, update store |
| `[MSG:...]` | Ignored |
| `$I` response | Store as `controllerName` |

### Disconnect

1. Cancel the reader and release the port lock
2. Close the port
3. Clear `workPos`, `machinePos`, reset `status → 'disconnected'`

---

## UI Components

### `HeaderBar.tsx` — Connect button

- **Disconnected:** gray "⚡ Connect" button
- **Connected:** green "● FluidNC v3.7" button
- **On click:** small popover with baud rate selector (115200 / 57600 / 9600) and a red "Disconnect" button
- **WebSerial unavailable:** button is disabled with tooltip "WebSerial requires Chrome or Edge"

### `SerialStatusBar.tsx` — Bottom bar (always visible)

Four states:

| State | Content |
|---|---|
| `connected` (idle) | Green dot · controller name · X/Y/Z position · "▶ Send G-code" button |
| `running` | "▶ Running" · line counter · ETA · position · progress bar · Pause + Cancel |
| `paused` | "⏸ Paused" · line counter · skip-to-line input · progress bar · Resume + Cancel |
| `error` | "✕ Error" · error message · Reconnect button |

**Skip to line:** Only available when paused. Sets `currentLine` to the requested index in the pre-split lines array; does not auto-resume — user must click Resume. Useful for restarting after a bit change partway through a job.

**ETA calculation:** rolling average of lines/second over the last 10 seconds × remaining lines. Resets on pause/resume.

**Send G-code button:** enabled only when `useToolpathStore.gcode` is non-empty.

### `MachinePositionLayer.tsx` — Konva crosshair

- A Konva `Layer` added above the toolpath layer in `CanvasStage`
- Only rendered when `status !== 'disconnected'`
- Draws: two full-span lines (crosshair), a small circle, and an X/Y label at `workPos`
- Coordinates mapped from work space (mm) to canvas pixels using the same scale/offset as the toolpath renderer

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Mid-job disconnect | Read loop catches stream error → `status → 'error'`, message "Connection lost". Reconnect button re-runs `connect()`. User can resume from `currentLine`. |
| `error:N` from controller | Job pauses, GRBL error description shown. User decides to cancel or fix and resume. |
| WebSerial not supported | Detected via `'serial' in navigator` on connect click. Button disabled with tooltip. |
| Port already in use | `port.open()` throws — caught, shown as error message in status bar. |

---

## Data Flow

```
User clicks Connect (header)
  → serialService.connect(baudRate)
  → port opens, $I sent, read loop starts, poll interval starts
  → useSerialStore: status → 'connected', controllerName set

User clicks "Send G-code" (status bar)
  → reads useToolpathStore.gcode
  → serialService.startJob(gcode)
  → lines split and queued, status → 'running'
  → each ok: currentLine++, store updated
  → each ?: workPos updated → MachinePositionLayer re-renders crosshair
  → all lines sent: status → 'connected'

User clicks Pause
  → write '!' to port
  → status → 'paused'

User clicks Resume
  → write '~' to port
  → status → 'running'

User clicks Cancel
  → write '\x18' to port, clear queue
  → status → 'connected'
```

---

## Out of Scope

- Tool change support
- Jogging controls (move machine manually)
- Macro/custom command buttons
- File transfer via SD card or Wi-Fi (WebSerial only)
- Persisting serial state to the `.carver` project file
