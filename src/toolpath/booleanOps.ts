import paper from 'paper'

let ready = false
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
