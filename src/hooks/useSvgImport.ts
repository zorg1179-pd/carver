import { useState, useCallback } from 'react'
import { parseSvg, fitToBed } from '@/svg/parseSvg'
import { useDocumentStore, useMachineStore } from '@/stores'

export type ImportState = 'idle' | 'loading' | 'done' | 'error'

export interface ImportStatus {
  state:    ImportState
  message:  string
  count:    number
  warnings: string[]
}

const IDLE: ImportStatus = { state: 'idle', message: '', count: 0, warnings: [] }

export function useSvgImport() {
  const { addShape }           = useDocumentStore()
  const { bedWidth, bedHeight } = useMachineStore()
  const [status, setStatus]   = useState<ImportStatus>(IDLE)

  const importFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
      setStatus({ state:'error', message:'Only .svg files are supported', count:0, warnings:[] })
      return
    }

    setStatus({ state:'loading', message:'Parsing…', count:0, warnings:[] })

    try {
      const text = await file.text()
      const { shapes, warnings, originalSizeMm } = parseSvg(text)

      if (shapes.length === 0) {
        setStatus({ state:'error', message: warnings[0] ?? 'No drawable shapes found', count:0, warnings })
        return
      }

      const fitted = fitToBed(shapes, bedWidth, bedHeight)
      fitted.forEach(addShape)

      const sizeNote = originalSizeMm
        ? ` · original ${originalSizeMm.width.toFixed(1)} × ${originalSizeMm.height.toFixed(1)} mm`
        : ''

      setStatus({
        state:   'done',
        message: `Imported ${fitted.length} path${fitted.length !== 1 ? 's' : ''}${sizeNote}`,
        count:   fitted.length,
        warnings,
      })
    } catch (err) {
      setStatus({ state:'error', message: String(err), count:0, warnings:[] })
    }
  }, [addShape, bedWidth, bedHeight])

  const clearStatus = useCallback(() => setStatus(IDLE), [])

  return { importFile, status, clearStatus }
}
