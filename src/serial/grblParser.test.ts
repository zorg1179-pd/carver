import { describe, it, expect } from 'vitest'
import {
  parseStatusResponse,
  parseControllerName,
  getGrblErrorDescription,
} from './grblParser'

describe('parseStatusResponse', () => {
  it('parses WPos directly', () => {
    const result = parseStatusResponse('<Idle|WPos:1.000,2.000,3.000|FS:0,0>')
    expect(result).toEqual({
      state: 'Idle',
      workPos: { x: 1, y: 2, z: 3 },
      machinePos: null,
    })
  })

  it('derives WPos from MPos + WCO', () => {
    const result = parseStatusResponse(
      '<Run|MPos:10.000,20.000,5.000|WCO:5.000,10.000,0.000|FS:500,12000>',
    )
    expect(result?.workPos).toEqual({ x: 5, y: 10, z: 5 })
    expect(result?.machinePos).toEqual({ x: 10, y: 20, z: 5 })
  })

  it('stores MPos when both WPos and MPos are present', () => {
    const result = parseStatusResponse(
      '<Idle|WPos:0,0,0|MPos:5,5,0|FS:0,0>',
    )
    expect(result?.machinePos).toEqual({ x: 5, y: 5, z: 0 })
    expect(result?.workPos).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('returns null for non-status lines', () => {
    expect(parseStatusResponse('ok')).toBeNull()
    expect(parseStatusResponse('error:1')).toBeNull()
    expect(parseStatusResponse('')).toBeNull()
  })

  it('returns the state string', () => {
    const result = parseStatusResponse('<Run|WPos:0,0,0|FS:1000,12000>')
    expect(result?.state).toBe('Run')
  })
})

describe('parseControllerName', () => {
  it('parses FluidNC version string', () => {
    expect(parseControllerName('[VER:3.7.7:FluidNC v3.7.7]')).toBe('FluidNC v3.7.7')
  })

  it('parses GRBL version string', () => {
    expect(parseControllerName('[VER:1.1f.20170801:]')).toBe('GRBL 1.1f.20170801')
  })

  it('returns null for unrecognized lines', () => {
    expect(parseControllerName('ok')).toBeNull()
    expect(parseControllerName('[OPT:V,15,128]')).toBeNull()
    expect(parseControllerName('')).toBeNull()
  })
})

describe('getGrblErrorDescription', () => {
  it('returns known error descriptions', () => {
    expect(getGrblErrorDescription(1)).toBe('Expected command letter')
    expect(getGrblErrorDescription(9)).toBe('Homing required before jogging')
    expect(getGrblErrorDescription(22)).toBe('Feed rate undefined')
  })

  it('returns fallback for unknown codes', () => {
    expect(getGrblErrorDescription(999)).toBe('Unknown error (999)')
  })
})
