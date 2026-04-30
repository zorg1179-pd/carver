# Vector Editing — Curve Handles, Welding & Extended Node Operations

**Date:** 2026-04-29
**Status:** Approved

---

## Overview

Adds full bezier curve editing to the Carver canvas: a pen tool for drawing curves from scratch, control-handle editing for existing path shapes, and a suite of node-level operations (insert, delete, break, convert, open/close, reverse, join, weld). The goal is a CNC-focused vector editor on par with Inkscape for the operations that matter in CAM workflows.

---

## Scope

**In scope:**
- Pen tool (Illustrator-style click/click+drag interaction)
- Bezier handle editing in node-edit mode (drag handles, toggle smooth/corner)
- Insert node on segment
- Delete node (shape-preserving bezier reconstruction)
- Break path at node
- Open / close path toggle
- Convert segment line ↔ curve
- Reverse path direction
- Join paths (compound path)
- Weld endpoints (auto-snap + manual)

**Out of scope:**
- Multi-node drag-select box within a single path
- Pen tool snapping to existing nodes/handles
- Per-handle-drag undo granularity (each drag-end is one undo step)

---

## Data Model

### `PathShape` — new optional field

```ts
export interface PathShape extends BaseShape {
  type: 'path'
  data: string
  x?: number; y?: number
  scaleX?: number; scaleY?: number
  nodeTypes?: ('smooth' | 'corner')[]  // indexed by command position after normalize
}
```

`nodeTypes` is optional. Absence means all corners — safe default for existing and imported paths. The pen tool writes it during drawing; the node editor updates it on double-click. Index alignment: after `SVGPathData.TO_ABS() + NORMALIZE_HVZ() + NORMALIZE_ST()`, each entry corresponds to the command at that index (only `M`, `L`, `C`, `Q` entries are meaningful; `Z` entries are ignored).

---

## New Files

### `src/canvas/usePenTool.ts`

Owns all pen-tool state. Runs alongside `useDrawingTool`; `CanvasStage` routes pointer events here when `currentTool === 'pen'`.

**State:**
```
inProgressCmds: SVGCommand[]       // commands placed so far
previewPt: Point | null            // cursor position for live preview segment
dragHandle: Point | null           // handle being pulled during click+drag
nodeTypes: ('smooth'|'corner')[]   // mirrors nodeTypes for the in-progress path
```

**Pointer interactions:**

| Gesture | Result |
|---|---|
| Click on empty canvas | Place corner node; straight segment to previous |
| Click+drag | Place smooth node; drag pulls out symmetric handles |
| Click on first node | Close path with `Z`, commit `PathShape` |
| Double-click | Commit as open path |
| `Escape` | Discard in-progress path |

**Preview rendering:** returns a dashed `PathShape` preview (same pattern as existing tools). While dragging a handle, the live bezier from last confirmed node to cursor renders with handle arms visible.

**On commit:** calls `addShape` with the final `PathShape` (`data` = encoded SVG, `nodeTypes` = recorded array), then resets to idle.

---

### `src/canvas/NodeEditControls.tsx`

Keyboard event handler + context menu for node-level operations. Extracted from `NodeEditLayer` to keep that component focused on rendering and drag interactions.

Listens for keydown when `nodeEditShapeId` is set:

| Key | Action |
|---|---|
| `Delete` | Delete selected node (shape-preserving) |
| `B` | Break path at selected node |
| `O` | Toggle open/close path |
| `R` | Reverse path direction |
| `C` | Convert hovered segment line ↔ curve |

Right-click on a segment surfaces a small context menu with line ↔ curve convert.

---

## Modified Files

### `src/stores/useUIStore.ts`

```ts
export type ToolType = 'select' | 'line' | 'pen' | 'rect' | 'circle' | 'text'
```

### `src/components/Toolbar.tsx`

Pen tool inserted between Line and Rectangle. Icon: `lucide-react` `Pen`. Keyboard shortcut `P`.

```
Select (S) → Line (L) → Pen (P) → Rectangle (R) → Circle (C) → Text (T)
```

### `src/canvas/NodeEditLayer.tsx`

**Handle rendering:** For each `C` command, render two handle arms (dashed gray line + filled blue diamond) from anchor to `(x1,y1)` and from anchor to `(x2,y2)`. Quadratic `Q` commands get one arm. Anchors remain white circles. Smooth nodes have colinear diamonds; corner nodes have independent diamonds.

**Node selection:** local `useState<number | null>` for `selectedNodeIdx`. Click anchor to select; click elsewhere or `Escape` to deselect.

**Drag interactions:**

| Gesture | Behaviour |
|---|---|
| Drag anchor | Moves endpoint; smooth nodes carry handles rigidly; corner nodes move endpoint only |
| Drag handle diamond | Moves control point; if smooth node, mirrors opposite handle to maintain colinearity |
| Double-click anchor | Toggle `smooth` ↔ `corner` in `nodeTypes` (corner→smooth averages handles to colinear; smooth→corner splits them) |
| Click on segment | Insert node at that parametric point — curve shape unchanged |
| Drag endpoint within 8px of another path's endpoint | Green snap ring appears; release = auto-weld |

**Auto-snap weld:** On each anchor drag-move, `NodeEditLayer` scans all other `PathShape` endpoints in canvas space. If the dragged endpoint is within 8px of a foreign endpoint, render a green snap ring. On drag-end in snap range, call `replaceShapesWithOne` merging both paths into one `PathShape`. Merge logic: move the dragged endpoint to exactly the foreign endpoint position, then concatenate the two path data strings with a direct `L` command connecting them (not a new `M` — the result is one continuous open path). Merge `nodeTypes` arrays at the same index boundary.

### `src/components/panels/ShapePanel.tsx`

New **Path** section appears when one or more `PathShape`s are selected:

| Button | Condition | Action |
|---|---|---|
| Open / Close path | Single path | Toggle `Z` suffix |
| Reverse direction | Single path | Call `reversePath()` from `pathUtils.ts` |
| Join paths | 2+ paths | Concatenate `data` strings → `replaceShapesWithOne` |
| Weld endpoints | Exactly 2 paths | Find nearest endpoint pair → merge into one `PathShape` |

### `src/toolpath/pathUtils.ts`

Add two pure functions:

- `reversePath(data: string): string` — reverses command order, flips all handle coordinates, preserves closure
- `insertNodeAt(data: string, segmentIdx: number, t: number): string` — de Casteljau split at parameter `t` on the given segment, inserts the new node without changing curve shape

---

## Entering Node-Edit Mode

Double-clicking a `PathShape` (or `LineShape`) on the canvas sets `nodeEditShapeId` in `useUIStore`, activating `NodeEditLayer` for that shape. This is the existing mechanism — no changes needed. The Transformer is hidden while a shape is in node-edit mode (also existing behaviour). Pressing `Escape` or switching tools clears `nodeEditShapeId`.

---

## Keyboard Shortcut Summary

| Key | Context | Action |
|---|---|---|
| `P` | Global | Switch to pen tool |
| `Escape` | Pen tool active | Discard in-progress path |
| `Escape` | Node-edit mode | Exit node-edit |
| `Delete` | Node-edit, node selected | Delete node (shape-preserving) |
| `B` | Node-edit, node selected | Break path at node |
| `O` | Node-edit | Open / close path toggle |
| `R` | Node-edit | Reverse path direction |
| `C` | Node-edit, segment hovered | Convert segment line ↔ curve |
| `W` | Global, 2 paths selected | Weld nearest endpoint pair (handled by a `useEffect` keydown listener in `ShapePanel`) |
| Double-click anchor | Node-edit | Toggle smooth ↔ corner |
| Click on segment | Node-edit | Insert node |

---

## Component Interaction Diagram

```
CanvasStage
  ├── useDrawingTool     (line / rect / circle / text)
  ├── usePenTool         (pen — new)
  ├── DrawingLayer       (renders shapes + preview)
  ├── NodeEditLayer      (handles, anchors, weld snap — expanded)
  └── NodeEditControls   (keyboard + context menu — new)

ShapePanel
  └── Path section       (open/close, reverse, join, weld — new)

pathUtils.ts
  ├── reversePath()      (new)
  └── insertNodeAt()     (new)
```

---

## Undo Behaviour

All node-edit mutations go through `updateShape` / `replaceShapesWithOne`, each of which pushes a snapshot onto the undo stack. Handle drag-end, node insert, node delete, weld, join — each is one undo step. Mid-drag state is not pushed (same pattern as today's anchor dragging).

---

## Testing Approach

- `pathUtils.ts` — unit tests for `reversePath` (round-trip: reverse twice = original) and `insertNodeAt` (verify split point lies on original curve within tolerance)
- `usePenTool` — unit tests for state transitions: click sequence produces correct SVG command array; close-path produces `Z`
- Manual golden paths: draw a closed bezier shape, edit a handle, weld two open paths, break a path, join two paths, verify toolpath generation is unaffected
