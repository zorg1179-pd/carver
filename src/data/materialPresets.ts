import type { MaterialPreset } from '@/types'

// Conservative feed recommendations for a typical hobby CNC (Shapeoko / X-Carve)
// with a 3.175 mm (1/8") bit.  Users can override per-job in the shape cut config.
export const BUILT_IN_MATERIALS: MaterialPreset[] = [
  {
    id: 'pine',
    name: 'Pine',
    defaultThickness: 19,
    isBuiltIn: true,
    feeds: {
      'flat-end-mill': { feedRate: 2000, plungeRate: 500, maxDepthPerPass: 3,   spindleRpm: 18000 },
      'ball-nose':     { feedRate: 1800, plungeRate: 400, maxDepthPerPass: 2,   spindleRpm: 18000 },
      'v-bit':         { feedRate: 1500, plungeRate: 350, maxDepthPerPass: 2,   spindleRpm: 18000 },
    },
  },
  {
    id: 'mdf',
    name: 'MDF',
    defaultThickness: 18,
    isBuiltIn: true,
    feeds: {
      'flat-end-mill': { feedRate: 1500, plungeRate: 400, maxDepthPerPass: 2,   spindleRpm: 18000 },
      'ball-nose':     { feedRate: 1200, plungeRate: 350, maxDepthPerPass: 1.5, spindleRpm: 18000 },
      'v-bit':         { feedRate: 1200, plungeRate: 300, maxDepthPerPass: 1.5, spindleRpm: 18000 },
    },
  },
  {
    id: 'plywood',
    name: 'Plywood',
    defaultThickness: 18,
    isBuiltIn: true,
    feeds: {
      'flat-end-mill': { feedRate: 1800, plungeRate: 450, maxDepthPerPass: 2.5, spindleRpm: 18000 },
      'ball-nose':     { feedRate: 1500, plungeRate: 400, maxDepthPerPass: 2,   spindleRpm: 18000 },
      'v-bit':         { feedRate: 1400, plungeRate: 350, maxDepthPerPass: 2,   spindleRpm: 18000 },
    },
  },
  {
    id: 'hdpe',
    name: 'HDPE',
    defaultThickness: 12,
    isBuiltIn: true,
    feeds: {
      'flat-end-mill': { feedRate: 1200, plungeRate: 300, maxDepthPerPass: 2,   spindleRpm: 18000 },
      'ball-nose':     { feedRate: 1000, plungeRate: 250, maxDepthPerPass: 1.5, spindleRpm: 18000 },
    },
  },
  {
    id: 'aluminium',
    name: 'Aluminium 6061',
    defaultThickness: 6,
    isBuiltIn: true,
    feeds: {
      'flat-end-mill': { feedRate: 400,  plungeRate: 150, maxDepthPerPass: 0.5, spindleRpm: 18000 },
      'ball-nose':     { feedRate: 350,  plungeRate: 120, maxDepthPerPass: 0.3, spindleRpm: 18000 },
    },
  },
]
