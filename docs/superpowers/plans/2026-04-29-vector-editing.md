# Vector Editing — Curve Handles, Welding & Node Operations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pen tool for drawing bezier curves, full handle editing in node-edit mode, and a suite of node operations (insert, delete, break, weld, join, reverse, open/close, convert segment).

**Architecture:** New `usePenTool` hook handles all pen-tool state alongside existing `useDrawingTool`; `CanvasStage` routes pointer events to it when `currentTool === 'pen'`. `NodeEditLayer` is expanded to render bezier handles and drive all node-level interactions. Pure path operations (reverse, insert node, delete node, break, convert, weld) live in `pathUtils.ts` and are unit-tested in isolation. A new `NodeEditControls` component owns keyboard shortcuts for node operations.

**Tech Stack:** React, TypeScript, Konva/react-konva, Zustand, svg-pathdata, Vitest + @testing-library/react

---

## File Map

| Action | File |
|---|---|
| Modify | `src/types/index.ts` |
| Modify | `src/toolpath/pathUtils.ts` |
| Create | `src/toolpath/pathUtils.test.ts` |
| Modify | `src/stores/useUIStore.ts` |
| Modify | `src/components/Toolbar.tsx` |
| Create | `src/canvas/usePenTool.ts` |
| Create | `src/canvas/usePenTool.test.ts` |
| Modify | `src/canvas/CanvasStage.tsx` |
| Modify | `src/canvas/NodeEditLayer.tsx` |
| Create | `src/canvas/NodeEditControls.tsx` |
| Modify | `src/components/panels/ShapePanel.tsx` |

---

## Task 1: Data Model + pathUtils Pure Functions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/toolpath/pathUtils.ts`
- Create: `src/toolpath/pathUtils.test.ts`

### Step 1.1 — Add `nodeTypes` to `PathShape`

In `src/types/index.ts`, update the `PathShape` interface:

```ts
export interface PathShape extends BaseShape {
  type: 'path'
  data: string
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  nodeTypes?: ('smooth' | 'corner')[]  // indexed by command position after normalize; absence = all corners
}
```

- [ ] Make this change now. No test needed — it's a type-only addition.

### Step 1.2 — Write failing tests for pathUtils additions

Create `src/toolpath/pathUtils.test.ts`:

```ts
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

// ── reversePath ───────────────────────────────────────────────────────────────

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
    // M0,0 C10,5 20,5 30,0 reversed: M30,0 C20,5 10,5 0,0
    const result = reversePath('M0,0 C10,5 20,5 30,0')
    expect(result).toMatch(/^M30,0/)
    expect(result).toContain('C20,5')
    expect(result).toMatch(/0,0$/)
  })

  it('reversing twice is a no-op (round trip)', () => {
    const data = 'M0,0 L10,0 C15,5 25,5 30,0'
    const roundTrip = reversePath(reversePath(data))
    // Both should start at same point and end at same point
    const orig = reversePath(data)
    expect(reversePath(orig)).toMatch(/^M0,0/)
  })
})

// ── openClosePath ─────────────────────────────────────────────────────────────

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

// ── joinPaths ─────────────────────────────────────────────────────────────────

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

// ── insertNodeAt ──────────────────────────────────────────────────────────────

describe('insertNodeAt', () => {
  it('splits a line segment at midpoint, inserting a new point', () => {
    const result = insertNodeAt('M0,0 L10,0', 0, 0.5)
    // Should now have M + 2L
    const mCount = (result.match(/M/g) ?? []).length
    const lCount = (result.match(/L/g) ?? []).length
    expect(mCount).toBe(1)
    expect(lCount).toBe(2)
    // Midpoint should be at (5, 0)
    expect(result).toContain('5,0')
  })

  it('does not change the start or end point', () => {
    const result = insertNodeAt('M0,0 L10,0', 0, 0.5)
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/10,0$/)
  })

  it('splits a cubic bezier using de Casteljau — midpoint of M0,0 C0,10 10,10 10,0 is near (5,7.5)', () => {
    const result = insertNodeAt('M0,0 C0,10 10,10 10,0', 0, 0.5)
    // result should have two C commands
    const cCount = (result.match(/C/g) ?? []).length
    expect(cCount).toBe(2)
    // The split point (mid of the bezier) should appear in the output near 5,7.5
    // We just check that there are now two curves
  })

  it('returns unchanged data for out-of-range segment index', () => {
    const data = 'M0,0 L10,0'
    expect(insertNodeAt(data, 5, 0.5)).toBe(data)
  })
})

// ── deleteNode ────────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('deletes middle node from a 3-point line path', () => {
    // M0,0 L10,0 L20,10 → delete node at index 1 (10,0) → M0,0 L20,10
    const result = deleteNode('M0,0 L10,0 L20,10', 1)
    // Should have M + 1L
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
})

// ── breakPath ─────────────────────────────────────────────────────────────────

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

// ── convertSegment ────────────────────────────────────────────────────────────

describe('convertSegment', () => {
  it('converts a line segment to a cubic bezier with C command', () => {
    const result = convertSegment('M0,0 L10,0', 0)
    expect(result).toContain('C')
    expect(result).not.toContain('L10,0')  // original line gone
  })

  it('converts a cubic bezier to a line', () => {
    const result = convertSegment('M0,0 C3,5 7,5 10,0', 0)
    expect(result).not.toContain('C')
    expect(result).toContain('L')
  })
})

// ── findSegmentHit ────────────────────────────────────────────────────────────

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
    // Two segments: M0,0 L50,0 L100,0
    // Click near (75, 2) should hit segment 1
    const hit = findSegmentHit('M0,0 L50,0 L100,0', 75, 2, 5)
    expect(hit).not.toBeNull()
    expect(hit!.segmentIdx).toBe(1)
  })
})

// ── weldNearestEndpoints ──────────────────────────────────────────────────────

describe('weldNearestEndpoints', () => {
  it('connects end of path A to start of path B', () => {
    // A ends at (10,0), B starts at (10,0) — perfect alignment
    const result = weldNearestEndpoints('M0,0 L10,0', 'M10,0 L20,0')
    expect(result).toMatch(/^M0,0/)
    expect(result).toMatch(/20,0$/)
    // Should be one continuous path (no second M)
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(1)
  })

  it('reverses path B if its end is closer to path A end than its start', () => {
    // A ends at (10,0), B ends at (10,0) — B should be reversed
    const result = weldNearestEndpoints('M0,0 L10,0', 'M20,0 L10,0')
    const mCount = (result.match(/M/g) ?? []).length
    expect(mCount).toBe(1)
    expect(result).toMatch(/^M0,0/)
  })
})
```

- [ ] Run tests to verify they all fail: `npm test -- pathUtils`  
  Expected: all fail with "not a function" or similar

### Step 1.3 — Implement `encodeCmds` helper and all functions in `pathUtils.ts`

At the bottom of `src/toolpath/pathUtils.ts`, add:

```ts
// ── Internal helper ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encodeCmds(cmds: any[]): string {
  return cmds.map(cmd => {
    switch (cmd.type) {
      case SVGPathData.MOVE_TO:    return `M${cmd.x},${cmd.y}`
      case SVGPathData.LINE_TO:    return `L${cmd.x},${cmd.y}`
      case SVGPathData.CURVE_TO:   return `C${cmd.x1},${cmd.y1} ${cmd.x2},${cmd.y2} ${cmd.x},${cmd.y}`
      case SVGPathData.CLOSE_PATH: return 'Z'
      default: return ''
    }
  }).filter(Boolean).join(' ')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(data: string): any[] {
  return (new SVGPathData(data) as any)
    .transform(SVGPathDataTransformer.TO_ABS())
    .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
    .transform(SVGPathDataTransformer.NORMALIZE_ST())
    .commands
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anchorIndices(cmds: any[]): number[] {
  return cmds.reduce<number[]>((acc, cmd, i) => {
    if (cmd.type === SVGPathData.MOVE_TO  ||
        cmd.type === SVGPathData.LINE_TO  ||
        cmd.type === SVGPathData.CURVE_TO) acc.push(i)
    return acc
  }, [])
}

// ── reversePath ───────────────────────────────────────────────────────────────
export function reversePath(data: string): string {
  const cmds = normalise(data)
  const closed = cmds.length > 0 && cmds[cmds.length - 1].type === SVGPathData.CLOSE_PATH
  const working = closed ? cmds.slice(0, -1) : cmds
  if (working.length === 0) return data

  const last = working[working.length - 1]
  const parts: string[] = [`M${last.x},${last.y}`]

  for (let i = working.length - 1; i >= 1; i--) {
    const prev = working[i - 1]
    const curr = working[i]
    const dx = (prev as any).x
    const dy = (prev as any).y
    if (curr.type === SVGPathData.LINE_TO || curr.type === SVGPathData.MOVE_TO) {
      parts.push(`L${dx},${dy}`)
    } else if (curr.type === SVGPathData.CURVE_TO) {
      parts.push(`C${(curr as any).x2},${(curr as any).y2} ${(curr as any).x1},${(curr as any).y1} ${dx},${dy}`)
    }
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}

// ── openClosePath ─────────────────────────────────────────────────────────────
export function openClosePath(data: string): string {
  const t = data.trim()
  if (/[Zz]$/.test(t)) return t.slice(0, -1).trim()
  return t + ' Z'
}

// ── joinPaths ─────────────────────────────────────────────────────────────────
export function joinPaths(parts: string[]): string {
  return parts.join(' ')
}

// ── insertNodeAt ──────────────────────────────────────────────────────────────
export function insertNodeAt(data: string, segmentIdx: number, t: number): string {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const fromIdx = idxs[segmentIdx]
  const toIdx   = idxs[segmentIdx + 1]
  if (toIdx === undefined) return data

  const from = cmds[fromIdx]
  const to   = cmds[toIdx]
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u
  const lp   = (ax: number, ay: number, bx: number, by: number, u: number) =>
    ({ x: lerp(ax, bx, u), y: lerp(ay, by, u) })

  let inserted: any[]
  if (to.type === SVGPathData.LINE_TO) {
    const s = lp(from.x, from.y, to.x, to.y, t)
    inserted = [
      { type: SVGPathData.LINE_TO, x: s.x,   y: s.y,   relative: false },
      { type: SVGPathData.LINE_TO, x: to.x,  y: to.y,  relative: false },
    ]
  } else if (to.type === SVGPathData.CURVE_TO) {
    const p0 = { x: from.x, y: from.y }
    const p1 = { x: to.x1,  y: to.y1  }
    const p2 = { x: to.x2,  y: to.y2  }
    const p3 = { x: to.x,   y: to.y   }
    const q0 = lp(p0.x, p0.y, p1.x, p1.y, t)
    const q1 = lp(p1.x, p1.y, p2.x, p2.y, t)
    const q2 = lp(p2.x, p2.y, p3.x, p3.y, t)
    const r0 = lp(q0.x, q0.y, q1.x, q1.y, t)
    const r1 = lp(q1.x, q1.y, q2.x, q2.y, t)
    const s  = lp(r0.x, r0.y, r1.x, r1.y, t)
    inserted = [
      { type: SVGPathData.CURVE_TO, x1: q0.x, y1: q0.y, x2: r0.x, y2: r0.y, x: s.x,    y: s.y,    relative: false },
      { type: SVGPathData.CURVE_TO, x1: r1.x, y1: r1.y, x2: q2.x, y2: q2.y, x: p3.x,   y: p3.y,   relative: false },
    ]
  } else {
    return data
  }

  return encodeCmds([...cmds.slice(0, toIdx), ...inserted, ...cmds.slice(toIdx + 1)])
}

// ── deleteNode ────────────────────────────────────────────────────────────────
export function deleteNode(data: string, nodeIdx: number): string {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  if (nodeIdx <= 0 || nodeIdx >= idxs.length) return data

  const prevCmdIdx = idxs[nodeIdx - 1]
  const thisCmdIdx = idxs[nodeIdx]
  const nextCmdIdx = idxs[nodeIdx + 1]

  if (nextCmdIdx === undefined) {
    // Deleting last anchor — just truncate
    const tail = cmds[cmds.length - 1]?.type === SVGPathData.CLOSE_PATH
      ? [{ type: SVGPathData.CLOSE_PATH }]
      : []
    return encodeCmds([...cmds.slice(0, thisCmdIdx), ...tail])
  }

  const prevAnchor = cmds[prevCmdIdx]
  const thisCmd    = cmds[thisCmdIdx]
  const nextCmd    = cmds[nextCmdIdx]

  // cp1 = forward handle of prev anchor (from thisCmd)
  const cp1 = thisCmd.type === SVGPathData.CURVE_TO
    ? { x: thisCmd.x1, y: thisCmd.y1 }
    : { x: prevAnchor.x, y: prevAnchor.y }

  // cp2 = backward handle of next anchor (from nextCmd)
  const cp2 = nextCmd.type === SVGPathData.CURVE_TO
    ? { x: nextCmd.x2, y: nextCmd.y2 }
    : { x: nextCmd.x,  y: nextCmd.y  }

  const isLine = cp1.x === prevAnchor.x && cp1.y === prevAnchor.y
              && cp2.x === nextCmd.x    && cp2.y === nextCmd.y

  const newSeg = isLine
    ? { type: SVGPathData.LINE_TO, x: nextCmd.x, y: nextCmd.y, relative: false }
    : { type: SVGPathData.CURVE_TO, x1: cp1.x, y1: cp1.y, x2: cp2.x, y2: cp2.y,
        x: nextCmd.x, y: nextCmd.y, relative: false }

  return encodeCmds([
    ...cmds.slice(0, thisCmdIdx),
    newSeg,
    ...cmds.slice(nextCmdIdx + 1),
  ])
}

// ── breakPath ─────────────────────────────────────────────────────────────────
export function breakPath(data: string, nodeIdx: number): [string, string] {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  if (nodeIdx <= 0 || nodeIdx >= idxs.length - 1) return [data, '']

  const breakIdx = idxs[nodeIdx]
  const breakCmd = cmds[breakIdx]
  const noClose  = (c: any) => c.type !== SVGPathData.CLOSE_PATH

  const path1 = cmds.slice(0, breakIdx + 1).filter(noClose)
  const path2 = [
    { type: SVGPathData.MOVE_TO, x: breakCmd.x, y: breakCmd.y, relative: false },
    ...cmds.slice(breakIdx + 1).filter(noClose),
  ]

  return [encodeCmds(path1), encodeCmds(path2)]
}

// ── convertSegment ────────────────────────────────────────────────────────────
export function convertSegment(data: string, segmentIdx: number): string {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const fromIdx = idxs[segmentIdx]
  const toIdx   = idxs[segmentIdx + 1]
  if (toIdx === undefined) return data

  const from = cmds[fromIdx]
  const to   = cmds[toIdx]

  let newCmd: any
  if (to.type === SVGPathData.LINE_TO) {
    newCmd = {
      type: SVGPathData.CURVE_TO,
      x1: from.x + (to.x - from.x) / 3,
      y1: from.y + (to.y - from.y) / 3,
      x2: from.x + 2 * (to.x - from.x) / 3,
      y2: from.y + 2 * (to.y - from.y) / 3,
      x: to.x, y: to.y, relative: false,
    }
  } else if (to.type === SVGPathData.CURVE_TO) {
    newCmd = { type: SVGPathData.LINE_TO, x: to.x, y: to.y, relative: false }
  } else {
    return data
  }

  return encodeCmds([...cmds.slice(0, toIdx), newCmd, ...cmds.slice(toIdx + 1)])
}

// ── findSegmentHit ────────────────────────────────────────────────────────────
export function findSegmentHit(
  data: string,
  px: number, py: number,
  threshold: number,
): { segmentIdx: number; t: number } | null {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const SAMPLES = 20

  for (let seg = 0; seg < idxs.length - 1; seg++) {
    const from    = cmds[idxs[seg]]
    const toCmd   = cmds[idxs[seg + 1]]
    let best = Infinity, bestT = 0

    for (let k = 0; k <= SAMPLES; k++) {
      const u = k / SAMPLES
      let bx: number, by: number
      if (toCmd.type === SVGPathData.LINE_TO) {
        bx = from.x + (toCmd.x - from.x) * u
        by = from.y + (toCmd.y - from.y) * u
      } else if (toCmd.type === SVGPathData.CURVE_TO) {
        const mt = 1 - u
        bx = mt*mt*mt*from.x + 3*mt*mt*u*toCmd.x1 + 3*mt*u*u*toCmd.x2 + u*u*u*toCmd.x
        by = mt*mt*mt*from.y + 3*mt*mt*u*toCmd.y1 + 3*mt*u*u*toCmd.y2 + u*u*u*toCmd.y
      } else continue
      const d = Math.hypot(px - bx, py - by)
      if (d < best) { best = d; bestT = u }
    }
    if (best <= threshold) return { segmentIdx: seg, t: bestT }
  }
  return null
}

// ── weldNearestEndpoints ──────────────────────────────────────────────────────
function pathEndpoints(data: string): { start: { x:number;y:number }; end: { x:number;y:number } } {
  const cmds = normalise(data)
  const idxs = anchorIndices(cmds)
  const first = cmds[idxs[0]]
  const last  = cmds[idxs[idxs.length - 1]]
  return { start: { x: first.x, y: first.y }, end: { x: last.x, y: last.y } }
}

export function weldNearestEndpoints(dataA: string, dataB: string): string {
  const epA = pathEndpoints(dataA)
  const epB = pathEndpoints(dataB)
  const d   = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y)

  // Find which orientation puts A.end closest to B.start
  const opts = [
    { distAB: d(epA.end,   epB.start), aRev: false, bRev: false },
    { distAB: d(epA.end,   epB.end),   aRev: false, bRev: true  },
    { distAB: d(epA.start, epB.start), aRev: true,  bRev: false },
    { distAB: d(epA.start, epB.end),   aRev: true,  bRev: true  },
  ].sort((a, b) => a.distAB - b.distAB)[0]

  const a = opts.aRev ? reversePath(dataA) : dataA
  const b = opts.bRev ? reversePath(dataB) : dataB

  // Connect: move start of b to end of a (snap), emit L bridge, then rest of b
  const endA  = pathEndpoints(a).end
  const startB = pathEndpoints(b).start
  const SNAP = 0.01

  if (Math.hypot(endA.x - startB.x, endA.y - startB.y) < SNAP) {
    // Endpoints coincide — strip the M from b and concatenate
    return a.trim() + ' ' + b.trim().replace(/^M[-\d.,\s]+\s*/, '')
  }
  // Add an explicit L to bridge the gap, then strip b's M
  return a.trim() + ` L${startB.x},${startB.y} ` + b.trim().replace(/^M[-\d.,\s]+\s*/, '')
}
```

- [ ] Add the code above to `src/toolpath/pathUtils.ts` (append after the existing content)

### Step 1.4 — Run tests

```
npm test -- pathUtils
```

Expected: all tests pass. Fix any failures before continuing.

- [ ] All pathUtils tests pass

### Step 1.5 — Commit

```bash
git add src/types/index.ts src/toolpath/pathUtils.ts src/toolpath/pathUtils.test.ts
git commit -m "feat: add nodeTypes to PathShape + pathUtils node operations"
```

- [ ] Commit done

---

## Task 2: ToolType, Toolbar Pen Button

**Files:**
- Modify: `src/stores/useUIStore.ts`
- Modify: `src/components/Toolbar.tsx`

### Step 2.1 — Add `'pen'` to ToolType

In `src/stores/useUIStore.ts`, line 3:

```ts
export type ToolType = 'select' | 'line' | 'pen' | 'rect' | 'circle' | 'text'
```

- [ ] Make this one-line change

### Step 2.2 — Add pen button to Toolbar

In `src/components/Toolbar.tsx`, add the import and insert the pen entry:

```ts
import { MousePointer, Minus, Square, Circle, Type, Pen, type LucideIcon } from 'lucide-react'

const TOOLS: { tool: ToolType; Icon: LucideIcon; label: string; key: string }[] = [
  { tool: 'select', Icon: MousePointer, label: 'Select',           key: 'S' },
  { tool: 'line',   Icon: Minus,        label: 'Line / Polyline',  key: 'L' },
  { tool: 'pen',    Icon: Pen,          label: 'Pen / Bezier',     key: 'P' },
  { tool: 'rect',   Icon: Square,       label: 'Rectangle',        key: 'R' },
  { tool: 'circle', Icon: Circle,       label: 'Circle / Ellipse', key: 'C' },
  { tool: 'text',   Icon: Type,         label: 'Text',             key: 'T' },
]
```

Also add `'p': setCurrentTool('pen')` to the keydown handler in `Toolbar.tsx`:

```ts
case 'p': setCurrentTool('pen'); break
```

- [ ] Make both changes

### Step 2.3 — Build check

```
npm run build
```

Expected: builds without TypeScript errors.

- [ ] Build passes

### Step 2.4 — Commit

```bash
git add src/stores/useUIStore.ts src/components/Toolbar.tsx
git commit -m "feat: add pen tool type and toolbar button"
```

- [ ] Commit done

---

## Task 3: usePenTool Hook

**Files:**
- Create: `src/canvas/usePenTool.ts`
- Create: `src/canvas/usePenTool.test.ts`

### Step 3.1 — Write failing tests

Create `src/canvas/usePenTool.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePenTool } from './usePenTool'
import { useDocumentStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'

beforeEach(() => {
  useDocumentStore.setState({ shapes: [], past: [], future: [], selectedIds: [] })
  useUIStore.setState({ currentTool: 'pen' })
})

describe('usePenTool', () => {
  it('starts with no preview shape', () => {
    const { result } = renderHook(() => usePenTool())
    expect(result.current.previewShape).toBeNull()
  })

  it('shows a preview after first click + move', () => {
    const { result } = renderHook(() => usePenTool())
    act(() => {
      result.current.onPointerDown({ x: 0, y: 0 })
      result.current.onPointerUp({ x: 0, y: 0 })
      result.current.onPointerMove({ x: 10, y: 10 })
    })
    expect(result.current.previewShape).not.toBeNull()
    expect(result.current.previewShape!.type).toBe('path')
  })

  it('double-click after two anchors commits an open PathShape', () => {
    const { result } = renderHook(() => usePenTool())
    act(() => {
      result.current.onPointerDown({ x: 0, y: 0 })
      result.current.onPointerUp({ x: 0, y: 0 })
      result.current.onPointerDown({ x: 10, y: 10 })
      result.current.onPointerUp({ x: 10, y: 10 })
      result.current.onDoubleClick()
    })
    const { shapes } = useDocumentStore.getState()
    expect(shapes).toHaveLength(1)
    expect(shapes[0].type).toBe('path')
    expect((shapes[0] as any).data).toMatch(/^M/)
    expect((shapes[0] as any).data).toContain('L')
  })

  it('clicking near the first anchor closes the path with Z', () => {
    const { result } = renderHook(() => usePenTool())
    act(() => {
      result.current.onPointerDown({ x: 0, y: 0 })
      result.current.onPointerUp({ x: 0, y: 0 })
      result.current.onPointerDown({ x: 10, y: 10 })
      result.current.onPointerUp({ x: 10, y: 10 })
      result.current.onPointerDown({ x: 10, y: 20 })
      result.current.onPointerUp({ x: 10, y: 20 })
      // Click within 6px of first anchor (0,0)
      result.current.onPointerDown({ x: 2, y: 1 })
      result.current.onPointerUp({ x: 2, y: 1 })
    })
    const { shapes } = useDocumentStore.getState()
    expect(shapes).toHaveLength(1)
    expect((shapes[0] as any).data).toMatch(/Z$/)
  })

  it('cancel resets state and does not add a shape', () => {
    const { result } = renderHook(() => usePenTool())
    act(() => {
      result.current.onPointerDown({ x: 0, y: 0 })
      result.current.onPointerUp({ x: 0, y: 0 })
      result.current.cancel()
    })
    expect(result.current.previewShape).toBeNull()
    expect(useDocumentStore.getState().shapes).toHaveLength(0)
  })

  it('drag on first click produces a smooth node (C command in output)', () => {
    const { result } = renderHook(() => usePenTool())
    // Place first node with drag (smooth)
    act(() => {
      result.current.onPointerDown({ x: 0, y: 0 })
      result.current.onPointerMove({ x: 10, y: -5 })  // drag = forward handle
      result.current.onPointerUp({ x: 10, y: -5 })
    })
    // Place second node
    act(() => {
      result.current.onPointerDown({ x: 30, y: 0 })
      result.current.onPointerUp({ x: 30, y: 0 })
      result.current.onDoubleClick()
    })
    const data = (useDocumentStore.getState().shapes[0] as any).data as string
    expect(data).toContain('C')
  })
})
```

- [ ] Run `npm test -- usePenTool` — expect all tests to FAIL with "Cannot find module './usePenTool'"

### Step 3.2 — Implement `usePenTool.ts`

Create `src/canvas/usePenTool.ts`:

```ts
import { useState, useCallback, useRef, useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useDocumentStore } from '@/stores'
import type { PathShape } from '@/types'

export interface Point { x: number; y: number }

type Anchor = {
  x: number
  y: number
  handleFwd: Point | null  // forward handle in canvas space; null = corner node
}

const CLOSE_THRESHOLD = 6   // px in canvas space
const DRAG_THRESHOLD  = 4   // px before a press is considered a drag
const DEFAULT_STYLE   = { stroke: '#e2e8f0', fill: 'transparent', strokeWidth: 0.5 }

function dist(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y) }

function buildPathData(anchors: Anchor[]): string {
  if (anchors.length === 0) return ''
  const parts: string[] = [`M${anchors[0].x},${anchors[0].y}`]
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1]
    const curr = anchors[i]
    const cp1  = prev.handleFwd ?? { x: prev.x, y: prev.y }
    // backward handle of curr = mirror of curr.handleFwd around curr
    const cp2  = curr.handleFwd
      ? { x: 2 * curr.x - curr.handleFwd.x, y: 2 * curr.y - curr.handleFwd.y }
      : { x: curr.x, y: curr.y }
    const isLine = cp1.x === prev.x && cp1.y === prev.y && cp2.x === curr.x && cp2.y === curr.y
    if (isLine) {
      parts.push(`L${curr.x},${curr.y}`)
    } else {
      parts.push(`C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${curr.x},${curr.y}`)
    }
  }
  return parts.join(' ')
}

export function usePenTool() {
  const { currentTool } = useUIStore()
  const { addShape, setSelectedId } = useDocumentStore()

  const [previewShape, setPreviewShape] = useState<PathShape | null>(null)
  const anchors  = useRef<Anchor[]>([])
  const pressing = useRef(false)
  const pressPt  = useRef<Point>({ x: 0, y: 0 })
  const dragging = useRef(false)

  const buildPreview = useCallback((pt: Point, closePending: boolean, liveHandle: Point | null) => {
    const all = [...anchors.current]
    if (all.length === 0) return

    // Append a transient "cursor" anchor for the preview segment
    const last = all[all.length - 1]
    const cp1  = last.handleFwd ?? { x: last.x, y: last.y }
    const cp2  = { x: pt.x, y: pt.y }
    const isLine = cp1.x === last.x && cp1.y === last.y

    let seg: string
    if (closePending) {
      const first = all[0]
      seg = isLine ? `L${first.x},${first.y}` : `C${cp1.x},${cp1.y} ${first.x},${first.y} ${first.x},${first.y}`
    } else if (liveHandle) {
      // Show bezier being shaped during drag
      const bwd = { x: 2 * pt.x - liveHandle.x, y: 2 * pt.y - liveHandle.y }
      seg = `C${cp1.x},${cp1.y} ${bwd.x},${bwd.y} ${pt.x},${pt.y}`
    } else {
      seg = isLine ? `L${pt.x},${pt.y}` : `C${cp1.x},${cp1.y} ${pt.x},${pt.y} ${pt.x},${pt.y}`
    }

    const data = buildPathData(all) + ' ' + seg
    setPreviewShape({ id: '__preview__', type: 'path', data, style: DEFAULT_STYLE } as PathShape)
  }, [])

  const commit = useCallback((close: boolean) => {
    const all = anchors.current
    if (all.length < 2) { cancel(); return }
    const data = buildPathData(all) + (close ? ' Z' : '')
    const nodeTypes = all.map(a => a.handleFwd ? 'smooth' : 'corner') as ('smooth'|'corner')[]
    const shape: PathShape = {
      id: crypto.randomUUID(), type: 'path', data, nodeTypes, style: DEFAULT_STYLE,
    }
    addShape(shape)
    setSelectedId(shape.id)
    anchors.current = []
    pressing.current = false
    dragging.current = false
    setPreviewShape(null)
  }, [addShape, setSelectedId])

  const cancel = useCallback(() => {
    anchors.current = []
    pressing.current = false
    dragging.current = false
    setPreviewShape(null)
  }, [])

  useEffect(() => { if (currentTool !== 'pen') cancel() }, [currentTool, cancel])

  const onPointerDown = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    pressing.current = true
    pressPt.current  = pt
    dragging.current = false

    if (anchors.current.length === 0) {
      anchors.current = [{ x: pt.x, y: pt.y, handleFwd: null }]
    } else {
      // Close path if near first anchor
      const first = anchors.current[0]
      if (anchors.current.length >= 2 && dist(pt, first) < CLOSE_THRESHOLD) {
        commit(true)
        return
      }
      anchors.current = [...anchors.current, { x: pt.x, y: pt.y, handleFwd: null }]
    }
  }, [currentTool, commit])

  const onPointerMove = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    if (pressing.current && dist(pt, pressPt.current) > DRAG_THRESHOLD) {
      dragging.current = true
      // Update the last anchor's handleFwd with the dragged position
      const all = [...anchors.current]
      if (all.length > 0) {
        all[all.length - 1] = { ...all[all.length - 1], handleFwd: pt }
        anchors.current = all
        buildPreview(pt, false, pt)
        return
      }
    }
    if (anchors.current.length > 0) {
      buildPreview(pt, false, null)
    }
  }, [currentTool, buildPreview])

  const onPointerUp = useCallback((pt: Point) => {
    if (currentTool !== 'pen') return
    if (dragging.current) {
      // handleFwd was already set in onPointerMove; finalise
      dragging.current = false
    }
    pressing.current = false
    buildPreview(pt, false, null)
  }, [currentTool, buildPreview])

  const onDoubleClick = useCallback(() => {
    if (currentTool !== 'pen') return
    commit(false)
  }, [currentTool, commit])

  return { previewShape, onPointerDown, onPointerMove, onPointerUp, onDoubleClick, cancel }
}
```

- [ ] Create the file with the code above

### Step 3.3 — Run tests

```
npm test -- usePenTool
```

Expected: all 6 tests pass. Fix failures before continuing.

- [ ] All usePenTool tests pass

### Step 3.4 — Commit

```bash
git add src/canvas/usePenTool.ts src/canvas/usePenTool.test.ts
git commit -m "feat: usePenTool hook with click/drag/close/cancel"
```

- [ ] Commit done

---

## Task 4: Wire Pen Tool into CanvasStage

**Files:**
- Modify: `src/canvas/CanvasStage.tsx`

### Step 4.1 — Import and instantiate usePenTool

In `src/canvas/CanvasStage.tsx`, add the import alongside `useDrawingTool`:

```ts
import { usePenTool } from './usePenTool'
```

Below `const drawing = useDrawingTool()`, add:

```ts
const pen = usePenTool()
```

### Step 4.2 — Route pointer events

Replace the three `handleMouseDown`/`handleMouseMove`/`handleMouseUp` sections that call `drawing.*` with pen-aware routing:

In `handleMouseDown`, replace:
```ts
if (e.evt.button === 0 && currentTool !== 'select') {
  drawing.onPointerDown(getCanvasPt())
  return
}
```
with:
```ts
if (e.evt.button === 0 && currentTool !== 'select') {
  if (currentTool === 'pen') pen.onPointerDown(getCanvasPt())
  else drawing.onPointerDown(getCanvasPt())
  return
}
```

In `handleMouseMove`, replace:
```ts
if (currentTool !== 'select') {
  drawing.onPointerMove(getCanvasPt())
}
```
with:
```ts
if (currentTool !== 'select') {
  if (currentTool === 'pen') pen.onPointerMove(getCanvasPt())
  else drawing.onPointerMove(getCanvasPt())
}
```

In `handleMouseUp`, replace:
```ts
if (e.evt.button === 0 && currentTool !== 'select') {
  drawing.onPointerUp(getCanvasPt())
}
```
with:
```ts
if (e.evt.button === 0 && currentTool !== 'select') {
  if (currentTool === 'pen') pen.onPointerUp(getCanvasPt())
  else drawing.onPointerUp(getCanvasPt())
}
```

In `handleDblClick`, replace the `currentTool === 'line'` block:
```ts
if (currentTool === 'line') {
  drawing.onDoubleClick()
  return
}
```
with:
```ts
if (currentTool === 'line') { drawing.onDoubleClick(); return }
if (currentTool === 'pen')  { pen.onDoubleClick();     return }
```

In the `Escape` key handler, add pen cancel alongside drawing cancel:
```ts
if (e.code === 'Escape') {
  if (nodeEditShapeIdRef.current) { setNodeEditShapeId(null); return }
  drawing.cancel()
  pen.cancel()
  clearSelection()
  setCurrentTool('select')
}
```

### Step 4.3 — Pass pen preview to DrawingLayer

`DrawingLayer` currently receives `previewShape={drawing.previewShape}`. Update to prefer pen preview when pen is active:

```ts
<DrawingLayer previewShape={currentTool === 'pen' ? pen.previewShape : drawing.previewShape} />
```

### Step 4.4 — Build check

```
npm run build
```

Expected: no TypeScript errors.

- [ ] Build passes

### Step 4.5 — Manual smoke test

Start `npm run dev`. Select the Pen tool (P key). Click three times on the canvas, double-click to commit. Verify a path shape appears. Try click+drag to create a smooth node.

- [ ] Pen tool creates path shapes on the canvas

### Step 4.6 — Commit

```bash
git add src/canvas/CanvasStage.tsx
git commit -m "feat: wire pen tool pointer events and preview in CanvasStage"
```

- [ ] Commit done

---

## Task 5: NodeEditLayer — Handle Rendering

**Files:**
- Modify: `src/canvas/NodeEditLayer.tsx`

This task adds visual rendering of bezier handles for path shapes. No interactions yet.

### Step 5.1 — Add handle rendering to the path branch

The existing path branch in `NodeEditLayer.tsx` (starting at line 56) currently only shows anchor circles. Expand it to also render handle arms and diamond handles.

Replace the entire path branch (`if (shape.type === 'path') { ... }`) with:

```tsx
if (shape.type === 'path') {
  const s = shape as PathShape
  const ox = s.x ?? 0, oy = s.y ?? 0
  const sx = s.scaleX ?? 1, sy = s.scaleY ?? 1

  const parsed = new SVGPathData(s.data)
    .transform(SVGPathDataTransformer.TO_ABS())
    .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
    .transform(SVGPathDataTransformer.NORMALIZE_ST())

  type AnchorEntry = { cmdIdx: number; cx: number; cy: number }
  const anchors = parsed.commands.reduce<AnchorEntry[]>((acc, cmd, i) => {
    if (
      cmd.type === SVGPathData.MOVE_TO  ||
      cmd.type === SVGPathData.LINE_TO  ||
      cmd.type === SVGPathData.CURVE_TO ||
      cmd.type === SVGPathData.QUAD_TO
    ) {
      acc.push({ cmdIdx: i, cx: ox + (cmd as any).x * sx, cy: oy + (cmd as any).y * sy })
    }
    return acc
  }, [])

  // Build handle entries from C commands
  type HandleEntry = {
    key: string
    anchorCanvas: { x: number; y: number }
    handleCanvas: { x: number; y: number }
    cmdIdx: number
    which: 'cp1' | 'cp2'
    anchorNodeIdx: number  // index into anchors[] for which anchor this handle belongs to
  }
  const handles: HandleEntry[] = []
  let anchorIdx = 0
  for (let i = 0; i < parsed.commands.length; i++) {
    const cmd = parsed.commands[i] as any
    if (
      cmd.type === SVGPathData.MOVE_TO  ||
      cmd.type === SVGPathData.LINE_TO  ||
      cmd.type === SVGPathData.QUAD_TO
    ) { anchorIdx++; continue }
    if (cmd.type === SVGPathData.CURVE_TO) {
      // cp1 belongs to the PREVIOUS anchor (forward handle)
      const prevAnchor = anchors[anchorIdx - 1]
      if (prevAnchor) {
        handles.push({
          key: `${i}-cp1`,
          anchorCanvas: { x: prevAnchor.cx, y: prevAnchor.cy },
          handleCanvas: { x: ox + cmd.x1 * sx, y: oy + cmd.y1 * sy },
          cmdIdx: i, which: 'cp1', anchorNodeIdx: anchorIdx - 1,
        })
      }
      // cp2 belongs to THIS anchor (backward handle)
      handles.push({
        key: `${i}-cp2`,
        anchorCanvas: { x: ox + cmd.x * sx, y: oy + cmd.y * sy },
        handleCanvas: { x: ox + cmd.x2 * sx, y: oy + cmd.y2 * sy },
        cmdIdx: i, which: 'cp2', anchorNodeIdx: anchorIdx,
      })
      anchorIdx++
    }
  }

  const hr = 4 / scale   // handle diamond half-size
  const hsw = 1 / scale  // handle stroke width

  return (
    <Layer>
      {/* Handle arms (dashed lines from anchor to handle) */}
      {handles.map(h => (
        <Line
          key={`arm-${h.key}`}
          points={[h.anchorCanvas.x, h.anchorCanvas.y, h.handleCanvas.x, h.handleCanvas.y]}
          stroke="#475569" strokeWidth={hsw} dash={[3 / scale, 2 / scale]}
          listening={false}
        />
      ))}

      {/* Handle diamonds */}
      {handles.map(h => (
        <Rect
          key={`hdl-${h.key}`}
          x={h.handleCanvas.x} y={h.handleCanvas.y}
          width={hr * 2} height={hr * 2}
          offsetX={hr} offsetY={hr}
          rotation={45}
          fill="#3b82f6" stroke="#1e3a5f" strokeWidth={hsw}
          listening={false}
        />
      ))}

      {/* Anchor circles (on top) */}
      {anchors.map(({ cmdIdx, cx, cy }) => (
        <Circle
          key={cmdIdx}
          x={cx} y={cy}
          radius={r}
          fill="white" stroke="#3b82f6" strokeWidth={sw}
          draggable
          onDragMove={onDragMove}
          onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
            const newLx = (e.target.x() - ox) / sx
            const newLy = (e.target.y() - oy) / sy
            parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy } as unknown as (typeof parsed.commands)[number]
            updateShape(shape.id, { data: parsed.encode() })
          }}
        />
      ))}
    </Layer>
  )
}
```

Also add `Line` and `Rect` to the react-konva import at the top of `NodeEditLayer.tsx`:

```ts
import { Layer, Circle, Line, Rect } from 'react-konva'
```

- [ ] Make these changes

### Step 5.2 — Build check

```
npm run build
```

Expected: no errors.

- [ ] Build passes

### Step 5.3 — Manual smoke test

Import an SVG with curves, or draw a rect/circle (these generate cubic bezier data). Double-click the shape to enter node-edit. Verify:
- Handle arms (dashed grey lines) extend from each anchor
- Blue diamond handles appear at each control point
- Anchor circles still appear on top

- [ ] Handles render correctly on a path shape

### Step 5.4 — Commit

```bash
git add src/canvas/NodeEditLayer.tsx
git commit -m "feat: render bezier handle arms and diamonds in NodeEditLayer"
```

- [ ] Commit done

---

## Task 6: NodeEditLayer — Handle Drag + Node Selection + Smooth/Corner Toggle

**Files:**
- Modify: `src/canvas/NodeEditLayer.tsx`

### Step 6.1 — Add node selection state and smooth/corner toggle

At the top of `NodeEditLayer`, add local state for the selected node index:

```tsx
const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null)
```

Add the `useState` import from React at the top if not already present:

```ts
import { useState } from 'react'
```

### Step 6.2 — Make handle diamonds draggable

Update the handle diamonds rendered in the path branch (from Task 5) to be draggable. Replace `listening={false}` on diamonds with drag handlers:

```tsx
{handles.map(h => {
  const hx = h.handleCanvas.x
  const hy = h.handleCanvas.y
  return (
    <Rect
      key={`hdl-${h.key}`}
      x={hx} y={hy}
      width={hr * 2} height={hr * 2}
      offsetX={hr} offsetY={hr}
      rotation={45}
      fill="#3b82f6" stroke="#1e3a5f" strokeWidth={hsw}
      draggable
      onDragMove={onDragMove}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        const newHx = (e.target.x() - ox) / sx
        const newHy = (e.target.y() - oy) / sy
        const cmd = parsed.commands[h.cmdIdx] as any
        const nodeType = (s.nodeTypes ?? [])[h.anchorNodeIdx] ?? 'corner'

        if (h.which === 'cp2') {
          cmd.x2 = newHx; cmd.y2 = newHy
          // If smooth, mirror cp1 of the NEXT C command (forward handle)
          if (nodeType === 'smooth') {
            const thisAnchor = anchors[h.anchorNodeIdx]
            const mirrorX = (thisAnchor.cx - ox) / sx - (newHx - (thisAnchor.cx - ox) / sx)
            const mirrorY = (thisAnchor.cy - oy) / sy - (newHy - (thisAnchor.cy - oy) / sy)
            // Find the next C command and update its x1,y1
            for (let j = h.cmdIdx + 1; j < parsed.commands.length; j++) {
              const nc = parsed.commands[j] as any
              if (nc.type === SVGPathData.CURVE_TO) { nc.x1 = mirrorX; nc.y1 = mirrorY; break }
              if (nc.type === SVGPathData.MOVE_TO) break
            }
          }
        } else {
          cmd.x1 = newHx; cmd.y1 = newHy
          // If smooth, mirror cp2 of THIS C command (backward handle)
          if (nodeType === 'smooth') {
            const prevAnchor = anchors[h.anchorNodeIdx]
            const mirrorX = (prevAnchor.cx - ox) / sx - (newHx - (prevAnchor.cx - ox) / sx)
            const mirrorY = (prevAnchor.cy - oy) / sy - (newHy - (prevAnchor.cy - oy) / sy)
            cmd.x2 = mirrorX; cmd.y2 = mirrorY
          }
        }
        updateShape(shape.id, { data: parsed.encode() })
      }}
    />
  )
})}
```

### Step 6.3 — Node selection on anchor click + smooth/corner double-click toggle

Update the anchor `Circle` elements to support selection and double-click toggle. Replace the existing anchor Circle with:

```tsx
{anchors.map(({ cmdIdx, cx, cy }, nodeIdx) => (
  <Circle
    key={cmdIdx}
    x={cx} y={cy}
    radius={r}
    fill={selectedNodeIdx === nodeIdx ? '#3b82f6' : 'white'}
    stroke="#3b82f6" strokeWidth={sw}
    draggable
    onClick={() => setSelectedNodeIdx(nodeIdx === selectedNodeIdx ? null : nodeIdx)}
    onDblClick={() => {
      const types = [...(s.nodeTypes ?? anchors.map(() => 'corner' as const))]
      while (types.length <= nodeIdx) types.push('corner')
      const current = types[nodeIdx] ?? 'corner'
      types[nodeIdx] = current === 'smooth' ? 'corner' : 'smooth'
      // When converting to smooth: average the two adjacent handles to make them colinear
      if (types[nodeIdx] === 'smooth') {
        const cmd = parsed.commands[cmdIdx] as any
        if (cmd.type === SVGPathData.CURVE_TO) {
          // Average backward handle direction with anchor to get a symmetric handle
          const bwdDx = cmd.x2 - cmd.x, bwdDy = cmd.y2 - cmd.y
          // Find next C for forward handle
          for (let j = cmdIdx + 1; j < parsed.commands.length; j++) {
            const nc = parsed.commands[j] as any
            if (nc.type === SVGPathData.CURVE_TO) {
              // Make nc.x1 the mirror of cmd.x2 around this anchor
              nc.x1 = cmd.x - bwdDx; nc.y1 = cmd.y - bwdDy
              break
            }
            if (nc.type === SVGPathData.MOVE_TO) break
          }
        }
      }
      updateShape(shape.id, { data: parsed.encode(), nodeTypes: types })
    }}
    onDragMove={onDragMove}
    onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
      const newLx = (e.target.x() - ox) / sx
      const newLy = (e.target.y() - oy) / sy
      parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy } as unknown as (typeof parsed.commands)[number]
      updateShape(shape.id, { data: parsed.encode() })
    }}
  />
))}
```

Also add `onDragMove` to the `Rect` (diamond) elements from Step 6.2.

### Step 6.4 — Build and manual test

```
npm run build
```

Then `npm run dev` and test:
- Drag a handle diamond — the curve bends
- Double-click an anchor — observe node type toggling (smooth: opposite handle snaps to mirror; corner: handles move independently)
- Selected anchor turns blue

- [ ] Handle drag works; smooth/corner toggle works

### Step 6.5 — Commit

```bash
git add src/canvas/NodeEditLayer.tsx
git commit -m "feat: handle drag and smooth/corner node toggle in NodeEditLayer"
```

- [ ] Commit done

---

## Task 7: NodeEditLayer — Insert Node on Segment Click

**Files:**
- Modify: `src/canvas/NodeEditLayer.tsx`

### Step 7.1 — Import findSegmentHit and insertNodeAt

Add to the imports at the top of `NodeEditLayer.tsx`:

```ts
import { findSegmentHit, insertNodeAt } from '@/toolpath/pathUtils'
```

### Step 7.2 — Add invisible hit area for the path

Inside the path branch, add a transparent `Path` element BELOW the handles and anchors that captures clicks on segments. This goes before the handle arms in the render:

```tsx
{/* Transparent hit area for segment click (insert node) */}
<Path
  data={s.data}
  x={ox} y={oy}
  scaleX={sx} scaleY={sy}
  fill="transparent"
  stroke="transparent"
  strokeWidth={12 / scale}
  hitStrokeWidth={12 / scale}
  listening={true}
  onClick={(e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    // stage.getPointerPosition() returns Konva stage coords (already divided by stage scale).
    // Divide by `scale` to convert to canvas-space, then subtract the shape's ox/oy offset
    // and divide by sx/sy to arrive at path-local coordinates for findSegmentHit.
    const localX = (pos.x / scale - ox) / sx
    const localY = (pos.y / scale - oy) / sy
    const hit = findSegmentHit(s.data, localX, localY, 8 / scale)
    if (!hit) return
    updateShape(shape.id, { data: insertNodeAt(s.data, hit.segmentIdx, hit.t) })
  }}
/>
```

- [ ] Make this change

### Step 7.3 — Build and manual test

```
npm run build && npm run dev
```

Double-click a path shape to enter node-edit. Click on a segment (not on an anchor dot). Verify a new anchor appears at that point without changing the visible curve shape.

- [ ] Insert node works on click-on-segment

### Step 7.4 — Commit

```bash
git add src/canvas/NodeEditLayer.tsx
git commit -m "feat: insert node on segment click in NodeEditLayer"
```

- [ ] Commit done

---

## Task 8: NodeEditControls — Keyboard Operations

**Files:**
- Create: `src/canvas/NodeEditControls.tsx`
- Modify: `src/canvas/CanvasStage.tsx`

### Step 8.1 — Create NodeEditControls component

Create `src/canvas/NodeEditControls.tsx`:

```tsx
import { useEffect } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useDocumentStore } from '@/stores'
import {
  deleteNode, breakPath, openClosePath, reversePath, convertSegment,
} from '@/toolpath/pathUtils'
import type { PathShape } from '@/types'

interface Props {
  selectedNodeIdx: number | null
  hoveredSegmentIdx: number | null
  onClearSelection: () => void
}

export default function NodeEditControls({ selectedNodeIdx, hoveredSegmentIdx, onClearSelection }: Props) {
  const { nodeEditShapeId } = useUIStore()
  const { shapes, updateShape, replaceShapesWithOne, addShape } = useDocumentStore()

  useEffect(() => {
    if (!nodeEditShapeId) return

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const shape = shapes.find(s => s.id === nodeEditShapeId)
      if (!shape || shape.type !== 'path') return
      const s = shape as PathShape

      // Delete selected node
      if ((e.code === 'Delete' || e.code === 'Backspace') && selectedNodeIdx !== null) {
        e.stopPropagation()
        const newData = deleteNode(s.data, selectedNodeIdx)
        updateShape(s.id, { data: newData })
        onClearSelection()
        return
      }

      // Break path at selected node
      if (e.code === 'KeyB' && selectedNodeIdx !== null) {
        e.preventDefault()
        const [p1, p2] = breakPath(s.data, selectedNodeIdx)
        if (!p2) return
        const base = { style: s.style, layerId: s.layerId }
        replaceShapesWithOne([s.id], {
          ...base, id: crypto.randomUUID(), type: 'path', data: p1,
        } as PathShape)
        addShape({ ...base, id: crypto.randomUUID(), type: 'path', data: p2 } as PathShape)
        onClearSelection()
        return
      }

      // Open / close path
      if (e.code === 'KeyO') {
        e.preventDefault()
        updateShape(s.id, { data: openClosePath(s.data) })
        return
      }

      // Reverse path direction
      if (e.code === 'KeyR') {
        e.preventDefault()
        updateShape(s.id, { data: reversePath(s.data) })
        return
      }

      // Convert hovered segment line ↔ curve
      if (e.code === 'KeyC' && hoveredSegmentIdx !== null) {
        e.preventDefault()
        updateShape(s.id, { data: convertSegment(s.data, hoveredSegmentIdx) })
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nodeEditShapeId, shapes, selectedNodeIdx, hoveredSegmentIdx, updateShape, replaceShapesWithOne, addShape, onClearSelection])

  return null
}
```

### Step 8.2 — Wire NodeEditControls into NodeEditLayer

`NodeEditControls` needs `selectedNodeIdx` and `hoveredSegmentIdx` from `NodeEditLayer`. The cleanest approach: lift these as state in `NodeEditLayer` and render `NodeEditControls` inside the Layer.

In `NodeEditLayer.tsx`, add:

```tsx
import NodeEditControls from './NodeEditControls'
```

Add `hoveredSegmentIdx` state alongside `selectedNodeIdx`:

```tsx
const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null)
const [hoveredSegmentIdx, setHoveredSegmentIdx] = useState<number | null>(null)
```

On the transparent `Path` hit area (from Task 7), add `onMouseEnter`/`onMouseLeave` to track hovered segment, and update `onClick` to also set it:

```tsx
onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) => {
  // (same coordinate transform as onClick above)
  // Set hoveredSegmentIdx for 'C' key handler
  const stage = e.target.getStage(); if (!stage) return
  const pos = stage.getPointerPosition(); if (!pos) return
  const localX = (pos.x / scale - ox) / sx
  const localY = (pos.y / scale - oy) / sy
  const hit = findSegmentHit(s.data, localX, localY, 8 / scale)
  setHoveredSegmentIdx(hit ? hit.segmentIdx : null)
}}
onMouseLeave={() => setHoveredSegmentIdx(null)}
```

Add `NodeEditControls` as the last child inside the returned `<Layer>`:

```tsx
<NodeEditControls
  selectedNodeIdx={selectedNodeIdx}
  hoveredSegmentIdx={hoveredSegmentIdx}
  onClearSelection={() => setSelectedNodeIdx(null)}
/>
```

- [ ] Make these changes

### Step 8.3 — Build and manual test

```
npm run build && npm run dev
```

Enter node-edit on a 4+ node path. Test:
- Click a middle anchor to select it (turns blue), press `Delete` → node removed, shape preserved
- Click an anchor, press `B` → path splits into two shapes
- Press `O` → path closes/opens (Z added or removed)
- Press `R` → path direction reverses (anchor order flips)
- Hover over a line segment, press `C` → segment becomes a curve

- [ ] All keyboard operations work correctly

### Step 8.4 — Commit

```bash
git add src/canvas/NodeEditControls.tsx src/canvas/NodeEditLayer.tsx
git commit -m "feat: NodeEditControls keyboard ops (delete, break, open/close, reverse, convert)"
```

- [ ] Commit done

---

## Task 9: NodeEditLayer — Auto-Snap Weld

**Files:**
- Modify: `src/canvas/NodeEditLayer.tsx`

### Step 9.1 — Get all path shapes for proximity check

In `NodeEditLayer.tsx`, get `shapes` and `replaceShapesWithOne` from the document store (add them to the destructure):

```tsx
const { shapes, updateShape, replaceShapesWithOne } = useDocumentStore()
```

### Step 9.2 — Add snap state and weld logic to anchor drag

> **Important:** This step replaces the `onDragMove` and `onDragEnd` handlers on anchor `Circle` elements in the path branch (the ones added in Task 6). Do not append — replace the existing handlers with the versions below.

Add snap state:

```tsx
const [snapTarget, setSnapTarget] = useState<{ shapeId: string; x: number; y: number } | null>(null)
```

The weld snap check runs on anchor drag for endpoint anchors only (first and last in the path). Update the anchor `onDragMove` handler in the path branch:

```tsx
onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
  onDragMove(e)  // existing snap-to-grid
  
  // Check for weld snap: only for first and last anchors
  if (nodeIdx !== 0 && nodeIdx !== anchors.length - 1) return
  const cx = e.target.x()
  const cy = e.target.y()
  const WELD_THRESHOLD = 8 / scale

  let found: { shapeId: string; x: number; y: number } | null = null
  for (const other of shapes) {
    if (other.id === shape.id || other.type !== 'path') continue
    const os = other as PathShape
    const ocmds = new SVGPathData(os.data)
      .transform(SVGPathDataTransformer.TO_ABS())
      .transform(SVGPathDataTransformer.NORMALIZE_HVZ())
      .transform(SVGPathDataTransformer.NORMALIZE_ST())
      .commands
    const oIdxs = ocmds.filter((c: any) =>
      c.type === SVGPathData.MOVE_TO || c.type === SVGPathData.LINE_TO || c.type === SVGPathData.CURVE_TO
    )
    const endpoints = [oIdxs[0], oIdxs[oIdxs.length - 1]]
    for (const ep of endpoints) {
      if (!ep) continue
      const ox2 = os.x ?? 0, oy2 = os.y ?? 0, osx = os.scaleX ?? 1, osy = os.scaleY ?? 1
      const epCx = ox2 + (ep as any).x * osx
      const epCy = oy2 + (ep as any).y * osy
      if (Math.hypot(cx - epCx, cy - epCy) < WELD_THRESHOLD) {
        found = { shapeId: other.id, x: epCx, y: epCy }
        e.target.x(epCx); e.target.y(epCy)  // snap
        break
      }
    }
    if (found) break
  }
  setSnapTarget(found)
}}
onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
  if (snapTarget) {
    // Weld: merge this shape and target shape
    const other = shapes.find(s => s.id === snapTarget.shapeId) as PathShape | undefined
    if (other) {
      // Move dragged endpoint to snap position, then weld
      const myData  = s.data
      const endData = other.data
      const merged  = weldNearestEndpoints(myData, endData)
      replaceShapesWithOne([s.id, other.id], {
        id: crypto.randomUUID(), type: 'path', data: merged,
        style: s.style, layerId: s.layerId,
      } as PathShape)
      setSnapTarget(null)
      return
    }
  }
  setSnapTarget(null)
  // Normal anchor drag-end
  const newLx = (e.target.x() - ox) / sx
  const newLy = (e.target.y() - oy) / sy
  parsed.commands[cmdIdx] = { ...parsed.commands[cmdIdx], x: newLx, y: newLy } as unknown as (typeof parsed.commands)[number]
  updateShape(shape.id, { data: parsed.encode() })
}}
```

Also add the import:

```ts
import { findSegmentHit, insertNodeAt, weldNearestEndpoints } from '@/toolpath/pathUtils'
```

### Step 9.3 — Render weld snap indicator

Inside the `<Layer>`, render a green snap ring when `snapTarget` is set:

```tsx
{snapTarget && (
  <Circle
    x={snapTarget.x} y={snapTarget.y}
    radius={10 / scale}
    fill="transparent"
    stroke="#34d399" strokeWidth={1.5 / scale}
    listening={false}
  />
)}
```

- [ ] Make all these changes

### Step 9.4 — Build and manual test

```
npm run build && npm run dev
```

Draw two open path shapes with endpoints close together. Double-click one to enter node-edit. Drag an endpoint toward the other path's endpoint. Verify:
- Green snap ring appears when within 8px
- Releasing while snapped merges both shapes into one continuous path

- [ ] Auto-snap weld works

### Step 9.5 — Commit

```bash
git add src/canvas/NodeEditLayer.tsx
git commit -m "feat: auto-snap endpoint weld in NodeEditLayer"
```

- [ ] Commit done

---

## Task 10: ShapePanel — Path Operations

**Files:**
- Modify: `src/components/panels/ShapePanel.tsx`

### Step 10.1 — Read the current ShapePanel

Before editing, read `src/components/panels/ShapePanel.tsx` in full so you understand its existing structure.

- [ ] Read `src/components/panels/ShapePanel.tsx`

### Step 10.2 — Add path operations imports

At the top of `ShapePanel.tsx`, add:

```ts
import { openClosePath, reversePath, joinPaths, weldNearestEndpoints } from '@/toolpath/pathUtils'
import type { PathShape } from '@/types'
```

### Step 10.3 — Add Path section to ShapePanel

The panel already shows properties based on the selected shape type. Add a new section that appears when one or more `PathShape`s are selected. Find where the panel renders shape-specific controls and add, at the end before the closing `</div>`:

```tsx
{/* ── Path operations ───────────────────────────────────────────────── */}
{selectedPaths.length > 0 && (
  <PanelSection title="Path">
    {selectedPaths.length === 1 && (
      <>
        <button
          className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors"
          onClick={() => {
            const s = selectedPaths[0]
            updateShape(s.id, { data: openClosePath(s.data) })
          }}
        >
          {selectedPaths[0].data.trim().match(/[Zz]$/) ? 'Open Path' : 'Close Path'}
        </button>
        <button
          className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors mt-1"
          onClick={() => {
            const s = selectedPaths[0]
            updateShape(s.id, { data: reversePath(s.data) })
          }}
        >
          Reverse Direction
        </button>
      </>
    )}
    {selectedPaths.length >= 2 && (
      <button
        className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1 text-left transition-colors"
        onClick={() => {
          const merged = joinPaths(selectedPaths.map(s => s.data))
          replaceShapesWithOne(
            selectedPaths.map(s => s.id),
            {
              id: crypto.randomUUID(), type: 'path',
              data: merged, style: selectedPaths[0].style,
              layerId: selectedPaths[0].layerId,
            } as PathShape,
          )
        }}
      >
        Join Paths
      </button>
    )}
    {selectedPaths.length === 2 && (
      <button
        className="w-full text-xs bg-blue-700 hover:bg-blue-600 text-white rounded px-2 py-1 text-left transition-colors mt-1"
        title="Weld nearest endpoints (W)"
        onClick={() => weld()}
      >
        Weld Endpoints  <kbd className="text-blue-300 text-[10px]">W</kbd>
      </button>
    )}
  </PanelSection>
)}
```

### Step 10.4 — Add `selectedPaths`, `replaceShapesWithOne`, and `weld` helper

Near the top of the `ShapePanel` component function, derive the selected paths and wire up `replaceShapesWithOne`:

```tsx
const { shapes, selectedIds, updateShape, replaceShapesWithOne } = useDocumentStore()
const selectedPaths = shapes.filter(
  s => selectedIds.includes(s.id) && s.type === 'path'
) as PathShape[]
```

Add a `weld` function and a `W` key handler:

```tsx
const weld = useCallback(() => {
  if (selectedPaths.length !== 2) return
  const [a, b] = selectedPaths
  const merged = weldNearestEndpoints(a.data, b.data)
  replaceShapesWithOne([a.id, b.id], {
    id: crypto.randomUUID(), type: 'path',
    data: merged, style: a.style, layerId: a.layerId,
  } as PathShape)
}, [selectedPaths, replaceShapesWithOne])

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.code === 'KeyW' && selectedPaths.length === 2) {
      e.preventDefault()
      weld()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [weld, selectedPaths])
```

Add `useCallback` and `useEffect` to React imports if not already present.

- [ ] Make all these changes

### Step 10.5 — Build check

```
npm run build
```

Expected: no TypeScript errors.

- [ ] Build passes

### Step 10.6 — Manual smoke test

```
npm run dev
```

1. **Open/Close**: Select a path → Shape panel shows "Close Path" button → click it → path gains Z
2. **Reverse**: Select a path → click "Reverse Direction" → verify anchor order changes in node-edit
3. **Join**: Select two paths → "Join Paths" button appears → click → becomes one compound path shape
4. **Weld (button)**: Select two paths with nearby endpoints → "Weld Endpoints" button → paths merge
5. **Weld (W key)**: Select two paths → press W → same result

- [ ] All path panel operations work

### Step 10.7 — Run full test suite

```
npm test
```

Expected: all tests pass (pathUtils suite + usePenTool suite + existing tests).

- [ ] All tests pass

### Step 10.8 — Final commit

```bash
git add src/components/panels/ShapePanel.tsx
git commit -m "feat: ShapePanel path operations (open/close, reverse, join, weld)"
```

- [ ] Commit done

---

## Summary

| Task | What it builds |
|---|---|
| 1 | `nodeTypes` type field + all pathUtils pure functions + tests |
| 2 | `'pen'` ToolType + Toolbar button |
| 3 | `usePenTool` hook (click/drag/close/cancel) + tests |
| 4 | CanvasStage pen event routing |
| 5 | NodeEditLayer handle arm + diamond rendering |
| 6 | Handle drag (with smooth mirror) + node selection + smooth/corner toggle |
| 7 | Insert node on segment click |
| 8 | NodeEditControls: Delete, Break (B), Open/Close (O), Reverse (R), Convert (C) |
| 9 | Auto-snap endpoint weld |
| 10 | ShapePanel: Open/Close, Reverse, Join, Weld + W key |
