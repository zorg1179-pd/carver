# Carver v2.0 — Feature Outline

## 1. True V-Carve

The current implementation is just a contour at a fixed depth. Real V-carve drives the bit to a *varying* depth along the medial axis of each region, so the V-bit fills exactly to the boundary at every point.

**Algorithm (Straight Skeleton / iterative offset)**
- Compute the straight skeleton of the closed region using successive inward offsets at `Δr` steps
- At each skeleton point, depth = `offset_radius / tan(half_angle)` — so a wide region cuts deep, a thin region stays shallow
- Clip depth to `max_depth`; when the skeleton is deeper than `max_depth`, switch to flat-bottom relief (a hybrid V-flat operation)
- Output: a 3D point cloud of `(x, y, z)` moves sorted along the skeleton branches

**Library candidate:** `straight-skeleton-2d` (WASM, ~12 KB) or a pure-TS port of CGAL's SSKEL. Paper.js offset loops work for the iterative approach but are slower.

**New UI fields on the V-carve config:**
- Flat depth (max depth before switching to relief)
- Skeleton preview toggle (draw the medial axis on canvas)

---

## 2. 3D Cut Preview

A simulation of what the stock will look like after machining — the most-requested feature in any CAM tool.

**Approach: heightmap GPU simulation**
- Represent stock as a 2D heightmap texture (e.g. 1024×1024 pixels = one pixel per ~0.3 mm on a 300 mm bed)
- For each toolpath move, rasterize the swept tool geometry onto the heightmap (lower the Z value wherever the tool removes material)
- Render the heightmap as a displaced mesh in Three.js with a `PlaneGeometry` + vertex shader

**Why heightmap instead of full mesh boolean:**
- Mesh booleans (CSG) are O(n²) and slow for dense toolpaths
- Heightmap simulation is O(moves × pixels_per_move) and runs in < 1 s for typical jobs on a WebGL2 GPU
- Works natively for all 2.5D operations; V-carve produces tapered grooves naturally

**Three.js integration**
- Separate `PreviewPane` route/tab, lazy-loaded so the main editor doesn't pay the ~600 KB Three.js bundle cost
- Controls: orbit, zoom, pan; toggle between shaded, wireframe, X-ray (transparent stock shows cut depth)
- Material options: wood grain shader, aluminium, MDF

---

## 3. Canvas & Editing

**Node editor**
- Click a selected path or line to enter node-edit mode
- Drag individual vertices; for Bezier paths, show handles and allow converting between corner/smooth/symmetric
- Add node (click on segment) / delete node (click vertex + Delete)
- This is the biggest editing gap in v1 — imported SVGs often need tweaking

**Transform panel**
- Numeric X/Y position, W/H size, rotation angle fields in the right panel for selected shapes
- Lock aspect ratio toggle
- Flip horizontal / flip vertical buttons

**Snap system**
- Grid snap (configurable spacing, shown as dots not lines to avoid clutter)
- Snap to shape edges, centers, and corners
- Snap to canvas origin
- Visual snap indicator (blue crosshair)

**Alignment & distribution**
- Align left/right/top/bottom/center-H/center-V for multi-select
- Distribute evenly (horizontal and vertical spacing) for 3+ shapes

**Boolean canvas operations**
- Union, subtract, intersect — outputs a new path shape, removes source shapes
- Needed for designing pockets with islands without the current nested-pocket workaround

**Layers panel**
- Named layers with visibility and lock toggles
- Drag shapes between layers
- Per-layer color override for canvas display

---

## 4. CAM Improvements

**Dogbone / T-bone corner relief**
- Inside corners of pockets can't be square with a round bit
- Automatically add circular overcuts (dogbone) or slot overcuts (T-bone) at concave corners
- Toggle per-shape, with size based on tool diameter

**Tabs / bridges**
- Add holding tabs to contour operations so parts stay attached until hand-separated
- UI: drag to place tab positions on the contour preview, or auto-distribute N tabs evenly
- Tab dimensions (width, height) as fields

**Lead-in / lead-out**
- Spiral plunge (helix) instead of straight plunge — much better for climb milling
- Tangential entry arc for contour operations

**Ramping**
- For contour operations, ramp into the cut at a configurable angle instead of plunging vertically
- Especially important for single-flute bits and aluminium

**Feed rate zones**
- Automatic feed reduction for first pass, corners, and narrow regions
- Or manual override: draw a region, assign a feed multiplier

**Operation ordering**
- Drag to reorder operations in the toolpath panel
- Auto-order option: inside-out (pockets before contours) to prevent parts from moving mid-job

---

## 5. Machine & Output

**Post-processor selection**
- FluidNC (current), GRBL, LinuxCNC (RS274/NGC), Mach3/Mach4, Marlin (for laser)
- Each post handles its own preamble, modal handling, arc format, etc.
- User-definable post via a small JSON/template format for unusual controllers

**Tool library**
- Save multiple tool profiles (not just one at a time)
- Quick-switch between tools in the toolbar
- Each profile: name, bit type, diameter, flutes, material-specific feeds & speeds

**Material library**
- Pre-defined material presets (pine, MDF, plywood, HDPE, aluminium 6061…)
- Stores: recommended feeds/speeds per tool, typical depth per pass, stepover

**Machine profiles**
- Multiple saved machine configurations
- Each stores: bed dimensions, origin, axis limits, max spindle RPM, homing direction

**Simulation to machine (send file)**
- WebSerial API integration to send G-code directly to a connected FluidNC/GRBL controller
- Real-time position feedback drawn on the canvas as a crosshair
- Job progress bar with estimated time remaining

---

## 6. UX & Infrastructure

**Undo history panel**
- Visual list of the last N operations with names ("Add rect", "Move shapes ×3", "Set contour")
- Click to jump to any history state (not just step-by-step)
- Currently history tracks shapes only — v2 should extend to cut configs and machine settings

**Keyboard shortcut map**
- `?` opens a floating cheat-sheet overlay listing all shortcuts

**Dark / light theme**
- The canvas is always dark (high-contrast for machining), but the UI panels could follow system preference

**Performance: large SVG imports**
- Current parser is single-threaded; move `parseSvg` + `pathUtils` into a Web Worker
- Add an import progress indicator for SVGs with hundreds of paths

**Project format v2**
- Add `layers`, `toolLibrary`, `materialLibrary`, `postProcessor` to the `.carver` file schema
- Versioned migration so v1 files still open cleanly

**Collaborative editing (stretch)**
- Y.js CRDT over a WebSocket relay
- Real-time cursor presence; operational transforms handle concurrent shape moves
- Read-only share link for review without editing

---

## Priority order for implementation

| Phase | Scope | Rationale |
|---|---|---|
| 2.0-alpha | True V-carve + dogbone + tabs | Unblocks production use for most hobby CNC jobs |
| 2.0-beta | Node editor + transform panel + snap | The editing gap is the most-reported friction in v1 |
| 2.0-rc | 3D cut preview (heightmap) | High wow-factor, validates toolpaths visually |
| 2.0 | Post-processors + tool/material library | Broadens machine compatibility |
| 2.1 | Layers + alignment + boolean ops | Canvas power-user features |
| 2.2 | WebSerial send-to-machine + position feedback | Closes the design→cut loop in the browser |
