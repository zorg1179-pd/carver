import type { Layer, Shape, Units, BitType } from '@/types'

export const CARVER_VERSION = 1 as const
export const LS_KEY = 'carver_project_v1'

export interface MachineData {
  bedWidth: number
  bedHeight: number
  units: Units
  safeHeight: number
  originPosition: 'front-left' | 'center'
}

export interface MaterialData {
  thickness: number
  stockSurfaceZ: number
}

export interface ToolData {
  bitType: BitType
  diameter: number
  vBitAngle: number
  spindleRpm: number
  feedRate: number
  plungeRate: number
  maxDepthPerPass: number
}

export interface CarverProject {
  version: 1
  machine: MachineData
  material: MaterialData
  tool: ToolData
  shapes: Shape[]
  layers?: Layer[]  // optional — absent in v1 files saved before 2.1
}

export function serializeProject(
  machine: MachineData,
  material: MaterialData,
  tool: ToolData,
  shapes: Shape[],
  layers?: Layer[],
): CarverProject {
  return { version: CARVER_VERSION, machine, material, tool, shapes, layers }
}

export function deserializeProject(raw: unknown): CarverProject {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid project file')
  const data = raw as Record<string, unknown>
  if (data.version !== CARVER_VERSION) {
    throw new Error(`Unsupported project version: ${data.version ?? 'unknown'}`)
  }
  if (!Array.isArray(data.shapes)) throw new Error('Invalid project: missing shapes array')
  if (!data.machine || !data.material || !data.tool) {
    throw new Error('Invalid project: missing machine, material, or tool sections')
  }
  return raw as CarverProject
}

export const DEFAULT_MACHINE: MachineData = {
  bedWidth: 300,
  bedHeight: 200,
  units: 'mm',
  safeHeight: 5,
  originPosition: 'front-left',
}

export const DEFAULT_MATERIAL: MaterialData = {
  thickness: 19,
  stockSurfaceZ: 0,
}

export const DEFAULT_TOOL: ToolData = {
  bitType: 'flat-end-mill',
  diameter: 3.175,
  vBitAngle: 60,
  spindleRpm: 18000,
  feedRate: 1200,
  plungeRate: 300,
  maxDepthPerPass: 1,
}
