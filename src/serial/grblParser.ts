import type { Vec3 } from '@/types'

export interface StatusResponse {
  state:      string
  workPos:    Vec3
  machinePos: Vec3 | null
}

/** Parse a GRBL/FluidNC real-time status line, e.g. <Idle|WPos:1.0,2.0,3.0|FS:0,0> */
export function parseStatusResponse(line: string): StatusResponse | null {
  if (!line.startsWith('<')) return null
  const closeIdx = line.lastIndexOf('>')
  if (closeIdx < 0) return null
  const parts = line.slice(1, closeIdx).split('|')
  if (parts.length < 2) return null

  const state = parts[0]
  let workPos:    Vec3 | null = null
  let machinePos: Vec3 | null = null
  let wco:        Vec3 | null = null

  for (const part of parts.slice(1)) {
    if (part.startsWith('WPos:')) {
      const c = part.slice(5).split(',').map(Number)
      if (c.length >= 3) workPos = { x: c[0], y: c[1], z: c[2] }
    } else if (part.startsWith('MPos:')) {
      const c = part.slice(5).split(',').map(Number)
      if (c.length >= 3) machinePos = { x: c[0], y: c[1], z: c[2] }
    } else if (part.startsWith('WCO:')) {
      const c = part.slice(4).split(',').map(Number)
      if (c.length >= 3) wco = { x: c[0], y: c[1], z: c[2] }
    }
  }

  // Derive WPos from MPos + WCO when WPos not reported directly
  if (!workPos && machinePos && wco) {
    workPos = {
      x: machinePos.x - wco.x,
      y: machinePos.y - wco.y,
      z: machinePos.z - wco.z,
    }
  }

  if (!workPos) return null
  return { state, workPos, machinePos }
}

/** Parse the controller firmware version from a $I response, e.g. [VER:3.7.7:FluidNC v3.7.7] */
export function parseControllerName(line: string): string | null {
  // FluidNC: [VER:3.7.7:FluidNC v3.7.7]
  const fluidMatch = line.match(/^\[VER:[\d.]+:(.+)\]$/)
  if (fluidMatch) return fluidMatch[1]

  // GRBL: [VER:1.1f.20170801:]
  const grblMatch = line.match(/^\[VER:([\w.]+):/)
  if (grblMatch) return `GRBL ${grblMatch[1]}`

  return null
}

const GRBL_ERRORS: Record<number, string> = {
  1:  'Expected command letter',
  2:  'Bad number format',
  3:  'Invalid statement',
  4:  'Negative value',
  5:  'Setting disabled',
  6:  'Step pulse too short',
  7:  'Failed to read settings',
  8:  'Command requires idle state',
  9:  'Homing required before jogging',
  10: 'Soft limits require homing',
  11: 'Max characters exceeded',
  12: 'Setting step/rev > 0',
  13: 'Check door',
  14: 'Line over jog limit',
  15: 'Invalid jog command',
  16: 'Laser mode requires PWM output',
  20: 'Unsupported G-code command',
  21: 'Multiple G-code commands in modal group',
  22: 'Feed rate undefined',
  23: 'G-code command requires integer value',
  24: 'Two G-code commands use same axis words',
  25: 'Repeated G-code word',
  26: 'No axis words for G-code command',
  27: 'Line number value is invalid',
  28: 'G-code command value not integer',
  33: 'Motion command target is invalid',
  34: 'Arc radius too small',
  35: 'G2/G3 missing axis word in plane',
  36: 'Unused value words found',
}

export function getGrblErrorDescription(code: number): string {
  return GRBL_ERRORS[code] ?? `Unknown error (${code})`
}
