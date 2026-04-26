import { useEffect, useRef, useState, useCallback } from 'react'
import {
  serializeProject, deserializeProject,
  LS_KEY, DEFAULT_MACHINE, DEFAULT_MATERIAL, DEFAULT_TOOL,
  type CarverProject,
} from '@/project/projectFile'
import { useMachineStore, useMaterialStore, useToolStore, useDocumentStore, useToolpathStore } from '@/stores'
import { useUIStore } from '@/stores/useUIStore'

export function useProjectFile() {
  const machine  = useMachineStore()
  const material = useMaterialStore()
  const tool     = useToolStore()
  const { shapes, clearShapes, addShape } = useDocumentStore()
  const clearToolpaths  = useToolpathStore(s => s.clear)
  const resetAnimation  = useUIStore(s => s.resetToolpathAnimation)

  const [isDirty,     setIsDirty]     = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [loadError,   setLoadError]   = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressRef = useRef(true) // prevents auto-save during initial load / new / open

  // Always-current snapshot — updated on every render, no stale closure in timer callbacks
  const snapshotRef = useRef<CarverProject>(null!)
  snapshotRef.current = serializeProject(
    {
      bedWidth: machine.bedWidth, bedHeight: machine.bedHeight,
      units: machine.units, safeHeight: machine.safeHeight,
      originPosition: machine.originPosition,
    },
    { thickness: material.thickness, stockSurfaceZ: material.stockSurfaceZ },
    {
      bitType: tool.bitType, diameter: tool.diameter, vBitAngle: tool.vBitAngle,
      spindleRpm: tool.spindleRpm, feedRate: tool.feedRate,
      plungeRate: tool.plungeRate, maxDepthPerPass: tool.maxDepthPerPass,
    },
    shapes,
  )

  // Always-current apply function — updated on every render so it always calls the latest setters
  const applyRef = useRef<(p: CarverProject) => void>(null!)
  applyRef.current = (project: CarverProject) => {
    const m = project.machine
    machine.setBedWidth(m.bedWidth)
    machine.setBedHeight(m.bedHeight)
    machine.setUnits(m.units)
    machine.setSafeHeight(m.safeHeight)
    machine.setOriginPosition(m.originPosition)

    const mat = project.material
    material.setThickness(mat.thickness)
    material.setStockSurfaceZ(mat.stockSurfaceZ)

    const t = project.tool
    tool.setBitType(t.bitType)
    tool.setDiameter(t.diameter)
    tool.setVBitAngle(t.vBitAngle)
    tool.setSpindleRpm(t.spindleRpm)
    tool.setFeedRate(t.feedRate)
    tool.setPlungeRate(t.plungeRate)
    tool.setMaxDepthPerPass(t.maxDepthPerPass)

    clearShapes()
    project.shapes.forEach(s => addShape(s))
    clearToolpaths()
    resetAnimation()
  }

  const writeLS = useCallback((project: CarverProject) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(project))
      setIsDirty(false)
      setLastSavedAt(new Date())
    } catch { /* storage full or private browsing */ }
  }, [])

  // Auto-save: watches all primitive store values, debounces 1.5 s
  useEffect(() => {
    if (suppressRef.current) return
    setIsDirty(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => writeLS(snapshotRef.current), 1500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    machine.bedWidth, machine.bedHeight, machine.units, machine.safeHeight, machine.originPosition,
    material.thickness, material.stockSurfaceZ,
    tool.bitType, tool.diameter, tool.vBitAngle, tool.spindleRpm, tool.feedRate,
    tool.plungeRate, tool.maxDepthPerPass,
    shapes,
    writeLS,
  ])

  // Restore from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      try {
        const project = deserializeProject(JSON.parse(raw))
        applyRef.current(project)
        setLastSavedAt(new Date())
      } catch (err) {
        console.warn('Failed to restore project:', err)
      }
    }
    // Allow auto-save after store updates from applyProject have propagated
    setTimeout(() => { suppressRef.current = false }, 300)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const newProject = useCallback(() => {
    if (isDirty && !window.confirm('Start a new project? Unsaved changes will be lost.')) return
    suppressRef.current = true
    applyRef.current({
      version: 1,
      machine: DEFAULT_MACHINE,
      material: DEFAULT_MATERIAL,
      tool: DEFAULT_TOOL,
      shapes: [],
    })
    localStorage.removeItem(LS_KEY)
    setIsDirty(false)
    setLastSavedAt(null)
    setTimeout(() => { suppressRef.current = false }, 300)
  }, [isDirty])

  const saveToFile = useCallback(() => {
    const project = snapshotRef.current
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `carver_${new Date().toISOString().slice(0, 10)}.carver`
    a.click()
    URL.revokeObjectURL(url)
    writeLS(project)
  }, [writeLS])

  const loadFromFile = useCallback((file: File) => {
    setLoadError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const project = deserializeProject(JSON.parse(e.target!.result as string))
        suppressRef.current = true
        applyRef.current(project)
        writeLS(project)
        setTimeout(() => { suppressRef.current = false }, 300)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load project')
      }
    }
    reader.readAsText(file)
  }, [writeLS])

  return { isDirty, lastSavedAt, loadError, newProject, saveToFile, loadFromFile }
}
