# Carver

A browser-based CNC carving CAM tool. Import or draw shapes, configure toolpaths, and export G-code ready for FluidNC / GRBL-compatible machines.

## Features

- **Drawing tools** — line/polyline, pen/bezier, rectangle, circle/ellipse, text
- **SVG import** — drag-and-drop or file picker
- **Node editing** — double-click any path to edit individual nodes and bezier handles
- **Toolpath generation** — contour, pocket, V-carve, engrave with multi-pass support
- **Boolean operations** — union, subtract, intersect on selected shapes
- **Path operations** — open/close, reverse, join, weld endpoints
- **Holding tabs** — configurable count, width, and height on contour operations
- **Dogbone corners** — automatic relief cuts for inside corners
- **G-code export** — targets FluidNC (GRBL-compatible) firmware
- **Machine serial** — connect directly via WebSerial (Chrome / Edge)
- **3D toolpath preview** — heightmap simulation of the cut result
- **Project files** — save and load `.carver` JSON project files

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 18 + TypeScript + Vite |
| Canvas | Konva.js / react-konva |
| Geometry | paper.js |
| Styling | Tailwind CSS |
| State | Zustand |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge (WebSerial requires a Chromium browser).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `S` | Select tool |
| `L` | Line / Polyline |
| `P` | Pen / Bezier |
| `R` | Rectangle |
| `C` | Circle / Ellipse |
| `T` | Text |
| `F` | Fit canvas to view |
| `Space + drag` | Pan canvas |
| `Scroll` | Zoom |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Del` | Delete selected |
| `W` | Weld path endpoints (2 paths selected) |
| `?` | Toggle keyboard shortcut reference |

**Node editing** (double-click a path to enter):

| Key | Action |
|---|---|
| `Del` | Delete node |
| `B` | Break path at node |
| `O` | Open / close path |
| `R` | Reverse direction |
| `C` | Convert segment (hover over it first) |
| `Esc` | Exit node editing |

## License

[MIT](LICENSE)
