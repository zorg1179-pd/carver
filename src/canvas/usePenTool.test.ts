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
