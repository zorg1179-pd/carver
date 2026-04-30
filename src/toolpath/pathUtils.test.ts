import { describe, it, expect } from 'vitest'
import {
  reversePath,
  openClosePath,
  joinPaths,
  insertNodeAt,
  deleteNode,
  breakPath,
  convertSegment,
  findSegmentHit,
  weldNearestEndpoints,
} from './pathUtils'

describe('reversePath', () => {
  it('reverses a simple line path (start becomes end)', () => {
    const result = reversePath('M0,0 L10,0 L20,10')
    expect(result).toMatch(/^M20,10/)
    expect(result).toMatch(/0,0$/)
  })

  it('a closed path remains closed after reverse', () => {
    const result = reversePath('M0,0 L10,0 L10,10 Z')
    expect(result.trim()).toMatch(/Z$/)
  })

  it('reverses a cubic bezier by swapping cp1 and cp2', () => {
    const result = reversePath('M0,0 C10,5 20,5 30,0')
    expect(result).toMatch(/^M30,0/)
    expect(result).toContain('C20,5')
    expect(result).toMatch(/0,0$/)
  })

  it('reversing twice returns to original start point', () => {
    const data = 'M0,0 L10,0 C15,5 25,5 30,0'
    expect(reversePath(reversePath(data))).toMatch(/^M0,0/)
  })
})

describe('openClosePath', () => {
  it('adds Z to an open path', () => {
    expect(openClosePath('M0,0 L10,0')).toBe('M0,0 L10,0 Z')
  })

  it('removes Z from a closed path', () => {
    expect(openClosePath('M0,0 L10,0 Z')).toBe('M0,0 L10,0')
  })

  it('handles lowercase z', () => {
    expect(openClosePath('M0,0 L10,0 z')).toBe('M0,0 L10,0')
  })
})

describe('joinPaths', () => {
  it('concatenates two path data strings into one compound path', () => {
    const result = joinPaths(['M0,0 L10,0', 'M20,0 L30,0'])
    expect(result).toContain('M0,0')
    expect(result).toContain('M20,0')
  })

  it('result contains both M commands', () => {
    const result = joinPaths(['M5,5 L15,5', 'M0,0 L10,10'])
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(2)
  })
})

describe('insertNodeAt', () => {
  it('splits a line segment at midpoint, inserting a new point', () => {
    const result = insertNodeAt('M0,0 L10,0', 0, 0.5)
    const mCount = (result.match(/M/g) ?? []).length
    const lCount = (result.match(/L/g) ?? []).length
    expect(mCount).toBe(1)
    expect(lCount).toBe(2)
    expect(result).toContain('5,0')
  })

  it('does not change the start or end point', () => {
    const result = insertNodeAt('M0,0 L10,0', 0, 0.5)
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/10,0$/)
  })

  it('splits a cubic bezier into two C commands', () => {
    const result = insertNodeAt('M0,0 C0,10 10,10 10,0', 0, 0.5)
    const cCount = (result.match(/C/g) ?? []).length
    expect(cCount).toBe(2)
  })

  it('returns unchanged data for out-of-range segment index', () => {
    const data = 'M0,0 L10,0'
    expect(insertNodeAt(data, 5, 0.5)).toBe(data)
  })
})

describe('deleteNode', () => {
  it('deletes middle node from a 3-point line path', () => {
    const result = deleteNode('M0,0 L10,0 L20,10', 1)
    const lCount = (result.match(/L/g) ?? []).length
    expect(lCount).toBe(1)
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/20,10$/)
  })

  it('preserves start and end anchors', () => {
    const result = deleteNode('M0,0 L5,10 L10,0 L15,10 L20,0', 2)
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/20,0$/)
  })

  it('returns data unchanged when trying to delete the first anchor (index 0)', () => {
    const data = 'M0,0 L10,0 L20,0'
    expect(deleteNode(data, 0)).toBe(data)
  })

  it('preserves closure when deleting a middle node from a closed path', () => {
    const result = deleteNode('M0,0 L10,0 L20,10 Z', 1)
    expect(result.trim()).toMatch(/Z$/)
  })
})

describe('breakPath', () => {
  it('splits a 3-anchor path at node 1 into two paths', () => {
    const [p1, p2] = breakPath('M0,0 L10,0 L20,10', 1)
    expect(p1).toMatch(/^M0,0/)
    expect(p1).toMatch(/10,0$/)
    expect(p2).toMatch(/^M10,0/)
    expect(p2).toMatch(/20,10$/)
  })

  it('returns original and empty string when breaking at endpoint', () => {
    const data = 'M0,0 L10,0 L20,0'
    const [p1, p2] = breakPath(data, 0)
    expect(p1).toBe(data)
    expect(p2).toBe('')
  })
})

describe('convertSegment', () => {
  it('converts a line segment to a cubic bezier with C command', () => {
    const result = convertSegment('M0,0 L10,0', 0)
    expect(result).toContain('C')
    expect(result).not.toContain('L10,0')
  })

  it('converts a cubic bezier to a line', () => {
    const result = convertSegment('M0,0 C3,5 7,5 10,0', 0)
    expect(result).not.toContain('C')
    expect(result).toContain('L')
  })
})

describe('findSegmentHit', () => {
  it('returns null when the click is far from the path', () => {
    expect(findSegmentHit('M0,0 L100,0', 50, 50, 5)).toBeNull()
  })

  it('finds a horizontal line segment when click is within threshold', () => {
    const hit = findSegmentHit('M0,0 L100,0', 50, 2, 5)
    expect(hit).not.toBeNull()
    expect(hit!.segmentIdx).toBe(0)
    expect(hit!.t).toBeCloseTo(0.5, 1)
  })

  it('returns the correct segment index for a multi-segment path', () => {
    const hit = findSegmentHit('M0,0 L50,0 L100,0', 75, 2, 5)
    expect(hit).not.toBeNull()
    expect(hit!.segmentIdx).toBe(1)
  })
})

describe('weldNearestEndpoints', () => {
  it('connects end of path A to start of path B', () => {
    const result = weldNearestEndpoints('M0,0 L10,0', 'M10,0 L20,0')
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/20,0$/)
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(1)
  })

  it('reverses path B if its end is closer to path A end than its start', () => {
    const result = weldNearestEndpoints('M0,0 L10,0', 'M20,0 L10,0')
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(1)
    expect(result).toMatch(/^M0,0/)
  })

  it('handles paths with near-zero coordinates that serialize in scientific notation', () => {
    // Manually create a path string with scientific notation coordinates
    const pathA = 'M0,0 L10,0'
    const pathB = 'M1e-10,5 L10,5'  // scientific notation in M command
    // Should not throw and should produce a single continuous path
    const result = weldNearestEndpoints(pathA, pathB)
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(1)
  })
})
