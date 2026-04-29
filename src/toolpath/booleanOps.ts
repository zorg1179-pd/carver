import paper from 'paper'

let ready = false

/** Lazy-init paper.js in headless mode (no canvas element required). */
function setup() {
  if (!ready) {
    paper.setup(new paper.Size(1, 1))
    ready = true
  }
}

/**
 * Returns the SVG path data for (outerD minus each hole in holesD).
 * Uses paper.js boolean subtract. Both paths must be closed.
 * Returns null if the operation fails.
 */
export function subtractPaths(outerD: string, holesD: string[]): string | null {
  if (!holesD.length) return outerD
  setup()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let outer: any = new paper.CompoundPath(outerD)
    for (const holeD of holesD) {
      const hole = new paper.CompoundPath(holeD)
      const result = outer.subtract(hole)
      outer.remove()
      hole.remove()
      outer = result
    }
    const data: string = outer.pathData
    outer.remove()
    return data || null
  } catch {
    return null
  }
}

/**
 * Returns the union of all supplied SVG path strings.
 * Paths are merged left-to-right; overlapping regions are filled once.
 */
export function unitePaths(paths: string[]): string | null {
  if (paths.length === 0) return null
  if (paths.length === 1) return paths[0]
  setup()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = new paper.CompoundPath(paths[0])
    for (const d of paths.slice(1)) {
      const other = new paper.CompoundPath(d)
      const unified = result.unite(other)
      result.remove()
      other.remove()
      result = unified
    }
    const data: string = result.pathData
    result.remove()
    return data || null
  } catch {
    return null
  }
}

/**
 * Returns the intersection of all supplied SVG path strings.
 * Requires at least two paths; successive intersections are computed left-to-right.
 */
export function intersectPaths(paths: string[]): string | null {
  if (paths.length < 2) return null
  setup()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = new paper.CompoundPath(paths[0])
    for (const d of paths.slice(1)) {
      const other = new paper.CompoundPath(d)
      const intersected = result.intersect(other)
      result.remove()
      other.remove()
      result = intersected
    }
    const data: string = result.pathData
    result.remove()
    return data || null
  } catch {
    return null
  }
}
