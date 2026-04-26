# CNC Carver Web App — Project Outline

## Overview

A hosted React web application that allows users to import SVG files and draw
directly on a canvas, then configure material and tooling parameters to generate
FluidNC-compatible G-code for CNC carving operations.

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | React 18 + TypeScript | Type safety essential for geometry math |
| Build tool | Vite | Fast HMR, minimal config |
| State management | Zustand | Redux-lite, easy mental model for Angular devs |
| Canvas layer | Konva.js + react-konva | React-friendly scene graph, good SVG interop |
| UI components | shadcn/ui + Tailwind CSS | Composable, unstyled base + utility CSS |
| Routing | React Router v6 | Single-page app navigation |
| SVG parsing | Native `DOMParser` + `svg-pathdata` | Parse/normalize SVG path commands |
| Geometry | `paper.js` (offscreen) | Offset paths, boolean ops, pocket fill |
| Hosting | Vercel | Zero-config React/Vite deployment |

### Angular → React Mental Model Notes
- Angular services → Zustand stores
- Angular components with `@Input/@Output` → React components with props + callbacks
- `ngFor` / `ngIf` → `.map()` / conditional JSX
- RxJS observables → React state + `useEffect` hooks
- Angular DI → Context API or Zustand where shared state is needed

---

## Architecture Overview

```
src/
├── components/         # UI components (toolbar, panels, modals)
├── canvas/             # Konva stage, layers, drawing tools
├── stores/             # Zustand stores (machine, material, tool, document)
├── toolpath/           # Toolpath computation engine
├── gcode/              # G-code serializer (FluidNC dialect)
├── svg/                # SVG import + normalization
├── hooks/              # Shared React hooks
└── types/              # TypeScript interfaces
```

### Core Data Flow

```
User Draw / SVG Import
        │
        ▼
   Document Store          ← shapes: paths, primitives, text
        │
        ▼
  Toolpath Engine          ← reads machine/material/tool stores
        │
   contour | pocket | v-carve | multi-pass
        │
        ▼
  G-code Serializer        ← FluidNC/GRBL dialect
        │
        ▼
   Preview + Export
```

---

## Phase 1 — Project Bootstrap

**Goal:** Running app with correct toolchain and folder structure.

### Steps
1. Scaffold with `npm create vite@latest carver -- --template react-ts`
2. Install core dependencies:
   - `konva`, `react-konva`
   - `zustand`
   - `react-router-dom`
   - `tailwindcss`, `shadcn-ui`
   - `svg-pathdata`
   - `paper` (geometry)
3. Configure Tailwind and shadcn/ui
4. Set up React Router with a single `/editor` route
5. Create placeholder Zustand stores:
   - `useMachineStore` — bed size, units (mm/in)
   - `useMaterialStore` — thickness, stock surface Z
   - `useToolStore` — bit type, diameter, flutes, spindle RPM, feed rate, plunge rate
   - `useDocumentStore` — array of shapes/paths on the canvas
   - `useToolpathStore` — computed toolpaths + G-code output

**React concept learned:** Vite project structure, JSX, basic component composition.

---

## Phase 2 — Canvas Workspace

**Goal:** Pannable/zoomable canvas with a defined machine bed boundary.

### Steps
1. Render a `<Stage>` (Konva) filling the viewport
2. Draw the machine bed rectangle based on `useMachineStore` dimensions
3. Implement pan (middle-click drag or space+drag) and scroll-to-zoom
4. Coordinate system: canvas origin = machine origin (bottom-left or top-left, configurable)
5. Display a ruler/grid overlay (optional toggle)
6. Show cursor coordinates in machine units in status bar

**React concepts learned:** `useRef` for Konva stage, `useEffect` for event listeners,
controlled vs uncontrolled components.

---

## Phase 3 — Drawing Tools

**Goal:** Toolbar with tools to create geometry on the canvas.

### Tools to implement (in order of complexity)
| Tool | Shape Type | Notes |
|---|---|---|
| Select | — | Move, scale, rotate, delete selected shapes |
| Line | Polyline | Click to add points, double-click to finish |
| Rectangle | Rect | Click-drag |
| Circle / Ellipse | Ellipse | Click-drag from center or corner |
| Text | Text | Click to place, type in modal or inline |

### Steps
1. Create a `currentTool` entry in document store or a local UI store
2. Each tool is a state machine: `idle → drawing → committed`
3. Shapes stored as normalized objects in `useDocumentStore`:
   ```ts
   interface Shape {
     id: string
     type: 'line' | 'rect' | 'circle' | 'ellipse' | 'text' | 'path'
     points/params: ...
     style: { stroke, fill, strokeWidth }
     cutConfig?: CutConfig   // assigned toolpath settings
   }
   ```
4. Selection handles: show transform handles on selected shape
5. Properties panel (right sidebar): edit shape dimensions numerically

**React concepts learned:** `useState` for tool state machine, lifting state up,
controlled inputs, component composition patterns.

---

## Phase 4 — SVG Import

**Goal:** Import an SVG file and render its paths as editable shapes on the canvas.

### Steps
1. File input (drag-and-drop + click to browse) accepting `.svg`
2. Parse SVG using `DOMParser` — walk the DOM for `<path>`, `<rect>`, `<circle>`,
   `<ellipse>`, `<line>`, `<polyline>`, `<text>` elements
3. Normalize all geometry to absolute path commands using `svg-pathdata`
4. Convert parsed elements to the internal `Shape` format in `useDocumentStore`
5. Scale/position the imported content to fit within the machine bed (with user confirmation)
6. Unsupported elements (gradients, images, filters) are silently skipped with a warning list

### Limitations to communicate to user
- Fills are ignored for toolpath purposes (only outlines are carved)
- Text in SVG converted to outlines is preferred; live SVG `<text>` has limited font support

**React concepts learned:** `useCallback` for stable handlers, `useMemo` for derived data,
handling async file reads.

---

## Phase 5 — Machine, Material & Tool Configuration

**Goal:** Panels/modals to configure all parameters needed for G-code generation.

### Machine Settings Panel
- Bed width / height (with unit selector: mm / inches)
- Safe travel height (Z clearance for rapids)
- Machine origin position (front-left vs center)

### Material Settings Panel
- Material thickness (stock Z height)
- Stock surface Z offset (if using fixture offsets)

### Tool / Bit Configuration Panel
| Parameter | Input type |
|---|---|
| Bit type | Select: flat end mill, ball nose, V-bit, drag knife |
| Cutting diameter | Number |
| V-bit angle (if V-bit) | Number (degrees) |
| Spindle speed | Number (RPM) |
| Feed rate (XY) | Number (mm/min or in/min) |
| Plunge rate (Z) | Number |
| Max depth per pass | Number |

### Cut Config per Shape
Each shape can have individual cut settings overriding defaults:
- Operation: `contour` | `pocket` | `v-carve` | `engrave`
- Cut depth (total)
- Number of passes (auto-calculated from max depth/pass, or manual override)
- Contour side: inside / outside / on-line (for contour ops)
- Pocket stepover %

**React concepts learned:** Forms with controlled inputs, `useContext` for settings
propagation, modal patterns with shadcn Dialog.

---

## Phase 6 — Toolpath Engine

**Goal:** Compute XYZ toolpaths from shapes + cut configs.

This is the most algorithmically complex phase.

### 6a — Contour Toolpath
1. Offset the path inward or outward by `tool_diameter / 2` using paper.js `Path.offset()`
2. Sort passes: Z from safe height → stock surface → cut depth in steps of `max_depth_per_pass`
3. Output: array of `{x, y, z, feed}` moves

### 6b — Pocket Toolpath
1. Offset boundary inward by `tool_diameter / 2` to get the cutting boundary
2. Fill with parallel lines (raster) spaced by `diameter * stepover_pct`
3. Clip lines to filled region using paper.js boolean intersection
4. Sort lines for minimal air travel (boustrophedon / zigzag)
5. Apply multi-pass Z stepping same as contour

### 6c — V-Carve Toolpath
1. Compute the medial axis (skeleton) of the closed shape (Voronoi-based approximation)
2. At each skeleton point, derive cut depth from distance to nearest boundary and V-bit angle
3. Output: variable-Z path following the skeleton

> Note: Full V-carve medial axis is the hardest algorithm in the project.
> Consider a library like `opentype.js` for text-based V-carve, or simplify
> to a fixed-depth V-groove on contour for v1.

### 6d — Engrave
Simplified: contour at very shallow fixed depth, on-line (no offset).

### Multi-Pass
All operations wrap their single-pass path in a Z loop:
```
passes = ceil(total_depth / max_depth_per_pass)
z_steps = [-(total_depth / passes) * i for i in 1..passes]
```

### Output Format
```ts
interface Toolpath {
  shapeId: string
  operation: OperationType
  moves: Move[]    // {x, y, z, feed, rapid: boolean}
}
```

**React concepts learned:** Expensive computation in `useMemo` or web workers,
`useTransition` for non-blocking UI during heavy calculation.

---

## Phase 7 — G-code Generation (FluidNC / GRBL Dialect)

**Goal:** Serialize computed toolpaths to valid FluidNC G-code.

### FluidNC-Specific Notes
- FluidNC is GRBL-compatible; standard GRBL G-code is valid
- Units: `G21` (mm) or `G20` (inches) — set at top of program
- Modal state: track current feed, Z to avoid redundant lines

### G-code Program Structure
```gcode
; Generated by Carver — [date]
; Tool: [name], Dia: [d]mm
; Material: [thickness]mm, Cut depth: [depth]mm
G90          ; absolute positioning
G21          ; units (or G20)
G17          ; XY plane
M3 S[rpm]    ; spindle on
G0 Z[safe]   ; move to safe height

; --- shape 1: contour ---
G0 X[x] Y[y]
G1 Z[depth] F[plunge]
G1 X... Y... F[feed]
...
G0 Z[safe]

; --- shape 2: pocket ---
...

G0 Z[safe]   ; final safe height
M5           ; spindle off
M30          ; program end
```

### Serializer Features
- Arc detection (convert short line segments to `G2`/`G3` where applicable) — optional optimization
- Comment blocks per shape for readability
- Line number toggle (`N10`, `N20`, ...)
- Decimal precision configurable (default 3 places)

---

## Phase 8 — G-code Preview & Simulation

**Goal:** Visualize the toolpath so the user can verify before sending to machine.

### 2D Toolpath Overlay (Phase 8a — do first)
1. Render toolpath moves as colored lines on the Konva canvas (separate layer, toggleable)
2. Color coding: rapid moves (red dashed), cutting moves (blue), plunge (green)
3. Animate the "tool head" traversing the path at adjustable speed

### 3D Simulation (Phase 8b — stretch goal)
- Use Three.js to render a 3D stock block with material removal preview
- Significant scope — treat as v2 feature

---

## Phase 9 — Export & File Management

**Goal:** Get G-code off the browser and onto the machine.

### Export Options
1. Download `.gcode` file (primary)
2. Copy to clipboard
3. Optional: display raw G-code in a read-only code editor pane (use `codemirror` or `monaco-editor`)

### Project Save/Load (nice-to-have for v1)
- Serialize `useDocumentStore` + all config stores to JSON
- Save to browser `localStorage` (auto-save on change)
- Export/import `.carver` project file (JSON)

---

## Phase 10 — Hosting & CI/CD

**Goal:** Deployed, accessible app.

### Steps
1. Create GitHub repository
2. Connect to Vercel — auto-deploys on push to `main`
3. Environment variables: none required for v1 (fully client-side)
4. Optional: add `playwright` smoke tests for CI

---

## Development Sequence (Recommended Order)

```
Phase 1  →  Phase 2  →  Phase 3  →  Phase 5 (config panels)
                                          ↓
Phase 4 (SVG import) ←→  Phase 6 (toolpath engine)
                                          ↓
                               Phase 7 (G-code gen)
                                          ↓
                               Phase 8 (preview)
                                          ↓
                               Phase 9 (export)
                                          ↓
                               Phase 10 (deploy)
```

Phases 3, 4, and 5 can be developed in parallel once Phase 2 is stable.

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| V-carve medial axis complexity | Defer to v2; ship fixed-depth V-groove on contour first |
| paper.js path offset edge cases | Add unit tests for offset logic with known geometries |
| SVG import incompatibility | Test with Inkscape, Illustrator, and Figma SVG outputs |
| Performance on large SVGs | Run toolpath computation in a Web Worker |
| FluidNC config variations | Add a "machine profile" with configurable preamble/postamble |

---

## Glossary

| Term | Meaning |
|---|---|
| Contour | Cut along the outline of a shape, offset by tool radius |
| Pocket | Clear all material within a closed shape |
| V-carve | Variable-depth cut following shape skeleton using a V-bit |
| Stepover | Percentage of tool diameter overlap between pocket passes |
| Safe height | Z position for rapid (non-cutting) moves between shapes |
| Plunge rate | Z-axis feed rate when entering material |
| FluidNC | GRBL-compatible open-source CNC firmware |
