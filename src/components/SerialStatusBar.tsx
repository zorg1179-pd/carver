import { useRef, useEffect, useState } from 'react'
import { Play, Pause, XCircle, Plug } from 'lucide-react'
import { useSerialStore } from '@/stores/useSerialStore'
import { useToolpathStore } from '@/stores'
import { startJob, pauseJob, resumeJob, cancelJob, skipToLine, connect } from '@/serial/serialService'

function formatEta(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m > 0 ? `~${m}m ${s}s` : `~${s}s`
}

export default function SerialStatusBar() {
  const { status, controllerName, workPos, currentLine, totalLines, errorMsg } =
    useSerialStore()
  const gcode = useToolpathStore((s) => s.gcode)

  const [skipInput,    setSkipInput]    = useState('')
  const [etaSeconds,   setEtaSeconds]   = useState(0)
  const rateHistoryRef = useRef<number[]>([])
  const prevLineRef    = useRef(0)
  const prevTimeRef    = useRef(Date.now())

  // Rolling-average ETA — resets when status leaves 'running'
  useEffect(() => {
    if (status !== 'running') {
      rateHistoryRef.current = []
      prevLineRef.current    = currentLine
      prevTimeRef.current    = Date.now()
      setEtaSeconds(0)
      return
    }
    const id = setInterval(() => {
      const now    = Date.now()
      const dt     = (now - prevTimeRef.current) / 1000
      const dLines = currentLine - prevLineRef.current
      prevTimeRef.current = now
      prevLineRef.current = currentLine
      if (dt > 0 && dLines > 0) {
        rateHistoryRef.current = [...rateHistoryRef.current.slice(-9), dLines / dt]
      }
      const avg = rateHistoryRef.current.length > 0
        ? rateHistoryRef.current.reduce((a, b) => a + b, 0) / rateHistoryRef.current.length
        : 0
      setEtaSeconds(avg > 0 ? (totalLines - currentLine) / avg : 0)
    }, 1000)
    return () => clearInterval(id)
  }, [status, currentLine, totalLines])

  const progress = totalLines > 0 ? currentLine / totalLines : 0
  const posText  = workPos
    ? `X ${workPos.x.toFixed(3)}  Y ${workPos.y.toFixed(3)}  Z ${workPos.z.toFixed(3)}`
    : null

  return (
    <div className="h-8 bg-gray-900 border-t border-gray-700 flex items-center px-3 gap-3 text-xs shrink-0 select-none">

      {status === 'disconnected' && (
        <span className="text-gray-600 text-[10px]">⚡ Not connected</span>
      )}

      {status === 'connected' && (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
            <span className="text-green-400">{controllerName || 'Connected'}</span>
          </span>
          {posText && (
            <span className="text-gray-500 font-mono text-[10px]">{posText}</span>
          )}
          <button
            onClick={() => startJob(gcode)}
            disabled={!gcode}
            className="ml-auto flex items-center gap-1 px-3 py-1 rounded
                       bg-green-700 hover:bg-green-600 disabled:bg-gray-700
                       disabled:text-gray-500 text-white transition-colors"
          >
            <Play size={11} /> Send G-code
          </button>
        </>
      )}

      {(status === 'running' || status === 'paused') && (
        <>
          <span className={status === 'running' ? 'text-green-400' : 'text-yellow-400'}>
            {status === 'running' ? '▶ Running' : '⏸ Paused'}
          </span>
          <span className="text-gray-500 font-mono text-[10px]">
            {currentLine.toLocaleString()} / {totalLines.toLocaleString()}
          </span>
          {status === 'running' && etaSeconds > 0 && (
            <span className="text-gray-600 text-[10px]">{formatEta(etaSeconds)}</span>
          )}
          {posText && (
            <span className="text-gray-600 font-mono text-[10px] hidden lg:block">{posText}</span>
          )}
          {status === 'paused' && (
            <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
              Skip to line:
              <input
                type="number"
                value={skipInput}
                onChange={(e) => setSkipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const n = parseInt(skipInput, 10)
                    if (!isNaN(n)) { skipToLine(n); setSkipInput('') }
                  }
                  e.stopPropagation()
                }}
                className="w-16 bg-gray-800 border border-gray-600 rounded px-1 py-0.5
                           text-white focus:outline-none focus:border-blue-500
                           [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </label>
          )}
          {/* Progress bar */}
          <div className="flex-1 h-1 bg-gray-800 rounded overflow-hidden">
            <div
              className={`h-full rounded transition-all duration-500 ${
                status === 'running' ? 'bg-green-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex gap-1.5 shrink-0">
            {status === 'running' ? (
              <button
                onClick={pauseJob}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-blue-700
                           bg-blue-900/30 text-blue-300 hover:bg-blue-900/60 transition-colors"
              >
                <Pause size={10} /> Pause
              </button>
            ) : (
              <button
                onClick={resumeJob}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-green-700
                           bg-green-900/30 text-green-300 hover:bg-green-900/60 transition-colors"
              >
                <Play size={10} /> Resume
              </button>
            )}
            <button
              onClick={cancelJob}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-red-800
                         bg-red-900/30 text-red-400 hover:bg-red-900/60 transition-colors"
            >
              <XCircle size={10} /> Cancel
            </button>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <span className="text-red-400">✕ Error</span>
          <span className="text-red-300 text-[10px] truncate max-w-xs">{errorMsg}</span>
          <button
            onClick={connect}
            className="ml-auto flex items-center gap-1 px-3 py-1 rounded border border-green-700
                       text-green-400 hover:bg-green-900/30 transition-colors"
          >
            <Plug size={11} /> Reconnect
          </button>
        </>
      )}
    </div>
  )
}
