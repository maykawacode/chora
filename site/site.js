// Chora landing page: the walk-through animation and the card stills.
// Loaded with defer from index.html, so the page's markup is ready.

// ── The walk-through ─────────────────────────────────────────────────────────
// One function of time draws every frame, so the live animation, the stills
// on the cards and the reduced-motion frame all come from the same code.
const NS = 'http://www.w3.org/2000/svg'
const C = {
  page: '#f5efe8', panel: '#e8e0d7', white: '#ffffff', text: '#39261e', text2: '#66544a', line: '#cbc1b7',
  control: '#90867e', glass: '#e1eae9', yellow: '#f2c230', yellowSoft: '#f5e7b5', neutral: '#9a9a9a', frame: '#264343', frameDeep: '#173030', cyan: '#466464'
}
const TOTAL = 36.1
const SCENES = [
  { t: 0, key: 4.0, text: 'Start with a list: here, vegetables.' },
  { t: 4.5, key: 8.0, text: 'Add qualities: pairs of opposites to judge each one by.' },
  { t: 8.5, key: 12.9, text: 'Score each vegetable on each quality with the slider.' },
  { t: 17.3, key: 20.0, text: 'Sort them into collections.' },
  { t: 20.6, key: 24.1, text: 'Open a map on two qualities. Each vegetable sits at its scores.' },
  { t: 24.6, key: 28.0, text: 'Color the map by collection, and draw two as shapes.' },
  { t: 29.2, key: 33.2, text: 'Drag a vegetable on the map. Its scores change, and the shape follows.' }
]

// Vegetables and collection colors from the bundled example. x and y are
// the Raw texture and Cooked texture scores; they are illustrative, chosen
// so no label overlaps another on the map. In the walk-through beet starts
// beside carrot, so its drag visibly stretches the root vegetables' shape.
const ELS = [
  { n: 'Carrot', col: '#9C755F', x: 0.86, y: 0.64 },
  { n: 'Celery', col: null, x: 0.95, y: 0.03 },
  { n: 'Spinach', col: '#76B7B2', x: 0.07, y: 0.07 },
  { n: 'Tomato', col: '#E15759', x: 0.2, y: 0.16 },
  { n: 'Cucumber', col: '#4E79A7', x: 0.79, y: 0.1 },
  { n: 'Broccoli', col: '#59A14F', x: 0.58, y: 0.57 },
  { n: 'Butternut squash', col: '#4E79A7', x: 0.68, y: 0.3 },
  { n: 'Beet', col: '#9C755F', x: 0.84, y: 0.78, side: 'left' },
  { n: 'Potato', col: '#9C755F', x: 0.92, y: 0.21, side: 'right' }
]
const COLLECTIONS = [['Root vegetables', '#9C755F'], ['Nightshades', '#E15759'], ['Leafy greens', '#76B7B2'],
['Cucurbits', '#4E79A7'], ['Brassicas', '#59A14F'], ['No collection', '#9a9a9a']]
const DIMS = [['Raw texture', 'Soft raw', 'Crisp raw'], ['Cooked texture', 'Soft when cooked', 'Firm when cooked']]
// The collection drawn as a shape, the vegetable dragged, and where it goes.
const SHAPE = 'Root vegetables', SHAPE2 = 'Cucurbits', DRAGGED = 7, DRAG_TO = [0.66, 0.70]

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const prog = (t, a, b) => ease((t - a) / (b - a))
const lin = (t, a, b) => clamp((t - a) / (b - a))
const mix = (a, b, p) => a + (b - a) * p
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mixHex = (a, b, p) => '#' + hexRgb(a).map((v, i) => Math.round(mix(v, hexRgb(b)[i], p)).toString(16).padStart(2, '0')).join('')
// Fade in over [a, a+d], out over [b, b+d].
const window_ = (t, a, b, d = 0.4) => Math.min(lin(t, a, a + d), 1 - lin(t, b, b + d))

function node(tag, attrs, parent, text) {
  const n = document.createElementNS(NS, tag)
  for (const k in attrs) n.setAttribute(k, attrs[k])
  if (text != null) n.textContent = text
  if (parent) parent.appendChild(n)
  return n
}
const set = (n, attrs) => { for (const k in attrs) n.setAttribute(k, attrs[k]) }

// Geometry for the card stills (viewBox 452 × 400): the map card fills the
// whole still, with no white margin around it, and the plot fills the card.
const MX = 0, MY = 0, MW = 452, MH = 400, BAR = 26
const L = MX + 36, R = MX + MW - 36, TOP = MY + BAR + 30, BOT = MY + MH - 28
const CX = (L + R) / 2, CY = (TOP + BOT) / 2
const px = x => mix(L, R, x), py = y => mix(BOT, TOP, y)

// Tab and command icons from App/src/renderer/web/ScoreDock.tsx and StripCommands.tsx (16-unit box).
const GLYPHS = {
  notes: '<rect x="3" y="1.5" width="10" height="13" rx="1.5"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/>',
  elements: '<g fill="currentColor" stroke="none"><circle cx="4.5" cy="5" r="1.8"/><circle cx="11.5" cy="4" r="1.8"/><circle cx="7.5" cy="11.5" r="1.8"/></g>',
  dims: '<path d="M3 1.5v11.5h11.5M1.5 3 3 1.5 4.5 3M13 11.5l1.5 1.5-1.5 1.5"/>',
  collections: '<rect x="1.5" y="1.5" width="8" height="8" rx="1.5"/><rect x="6.5" y="6.5" width="8" height="8" rx="1.5"/>',
  assess: '<path d="M1.5 8h13"/><circle cx="10" cy="8" r="2.5" fill="currentColor"/>',
  conversions: '<g fill="currentColor" stroke="none"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></g>',
  maps: '<path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5zM5.5 2v10.5M10.5 3.5V14"/>'
}

// The walk-through (viewBox 640 × 400), laid out like the browser app and
// run in the app's order: list, dimensions, scores, collections, then a map.
// The title banner runs across the top, the icon strip down the left edge,
// the open Score view beside it, and the map area fills the rest.
function makeScene(svg) {
  const W = 640, H = 400, TB = 24, SW = 30
  const PX = SW, PY = TB, PW = 230, PH = H - TB
  const MX = PX + PW + 1, MY = TB, MW = W - MX, BAR = 26
  const L = MX + 40, R = W - 40, TOP = MY + BAR + 34, BOT = H - 34
  const CX = (L + R) / 2, CY = (TOP + BOT) / 2
  const px = x => mix(L, R, x), py = y => mix(BOT, TOP, y)
  const font = { 'font-family': 'IBM Plex Sans, sans-serif' }
  const txt = (parent, x, y, s, o = {}) => node('text', { x, y, 'font-size': 11, fill: C.text, ...font, ...o }, parent, s)
  const elY = i => PY + 46 + i * 22                  // Elements and Collections rows
  const asY = i => PY + 128 + i * 20                 // Assess rows
  const trackY = PY + 64, tX = a => PX + 14 + a * (PW - 28)
  const SBW = 150, SB = W - SBW                      // map sidebar, open

  // Banner and icon strip, in the signature cyan.
  node('rect', { x: 0, y: 0, width: W, height: H, fill: C.white }, svg)
  node('rect', { x: 0, y: 0, width: W, height: TB, fill: C.frame }, svg)
  txt(svg, 12, 16, 'Vegetables', { 'font-weight': 500, fill: '#e3d4c2' })
  txt(svg, W - 12, 16, 'Chora', { 'text-anchor': 'end', 'font-weight': 600, fill: C.white })
  node('rect', { x: 0, y: TB, width: SW, height: H - TB, fill: C.frame }, svg)
  const strip = {}
  let sy = TB + 8
    ;['notes', 'elements', 'dims', 'collections', '|', 'assess', 'conversions', 'maps'].forEach(k => {
      if (k === '|') { node('line', { x1: 8, y1: sy + 2, x2: SW - 8, y2: sy + 2, stroke: '#466464' }, svg); sy += 8; return }
      const on = node('rect', { x: 4, y: sy, width: 22, height: 22, rx: 3, fill: k === 'maps' ? '#466464' : C.frameDeep, opacity: 0 }, svg)
      const g = node('g', { transform: `translate(7 ${sy + 3})`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', color: '#b9c6c5' }, svg)
      g.innerHTML = GLYPHS[k]
      strip[k] = { on, g, y: sy + 11 }
      sy += 26
    })

  // Score column, and the map area's "No maps" placeholder.
  node('rect', { x: PX, y: PY, width: PW, height: PH, fill: C.page }, svg)
  node('line', { x1: MX - 0.5, y1: PY, x2: MX - 0.5, y2: H, stroke: C.line }, svg)
  node('rect', { x: MX, y: MY, width: MW, height: H - MY, fill: C.panel }, svg)
  txt(svg, (MX + W) / 2, (MY + H) / 2 + 4, 'No maps', { 'text-anchor': 'middle', fill: C.text2 })

  const views = {}
  const view = (key, heading) => { const g = node('g', {}, svg); txt(g, PX + 14, PY + 22, heading, { 'font-weight': 600, fill: C.text2 }); views[key] = g; return g }

  // Elements: names typed in one by one.
  const gEl = view('elements', 'Elements')
  const elRows = ELS.map((e, i) => {
    const g = node('g', {}, gEl)
    node('circle', { cx: PX + 18, cy: elY(i) - 4, r: 4, fill: C.neutral }, g)
    return { g, label: txt(g, PX + 30, elY(i), '', { 'font-size': 11.5 }) }
  })

  // Dimensions: two pairs of opposites.
  const gDim = view('dims', 'Dimensions')
  const dimRows = DIMS.map(([name, a, b], j) => {
    const y = PY + 40 + j * 50
    const g = node('g', {}, gDim)
    node('rect', { x: PX + 6, y, width: PW - 12, height: 42, rx: 4, fill: C.glass }, g)
    return { g, name: txt(g, PX + 14, y + 17, '', { 'font-size': 11.5 }), poles: txt(g, PX + 14, y + 33, '', { 'font-size': 10, fill: C.text2 }), full: [name, `${a} – ${b}`] }
  })

  // Assess: one slider for the chosen vegetable and dimension, above the
  // vegetables (each marked – no score, ◇ some, ● all) and the dimensions.
  const gAs = view('assess', 'Assess')
  const slName = txt(gAs, PX + PW / 2, PY + 46, '', { 'font-size': 11.5, 'font-weight': 600, 'text-anchor': 'middle' })
  node('line', { x1: tX(0), y1: trackY, x2: tX(1), y2: trackY, stroke: C.control, 'stroke-width': 1.5 }, gAs)
  const knob = node('circle', { cy: trackY, r: 5.5, fill: C.yellow, stroke: C.text2, 'stroke-width': 1.3 }, gAs)
  const poleA = txt(gAs, tX(0), PY + 80, '', { 'font-size': 10, fill: C.text2 })
  const poleB = txt(gAs, tX(1), PY + 80, '', { 'font-size': 10, fill: C.text2, 'text-anchor': 'end' })
  node('line', { x1: PX + 6, y1: PY + 92, x2: PX + PW - 6, y2: PY + 92, stroke: C.line }, gAs)
  txt(gAs, PX + 14, PY + 110, 'Elements', { 'font-size': 10, 'font-weight': 600, fill: C.text2 })
  txt(gAs, PX + 148, PY + 110, 'Dimensions', { 'font-size': 10, 'font-weight': 600, fill: C.text2 })
  const asSel = node('rect', { x: PX + 6, y: 0, width: 130, height: 19, rx: 3, fill: C.yellow, opacity: 0 }, gAs)
  const dimSel = node('rect', { x: PX + 142, y: 0, width: PW - 148, height: 19, rx: 3, fill: C.glass }, gAs)
  const asRows = ELS.map((e, i) => ({
    mark: txt(gAs, PX + 17, asY(i), '–', { 'font-size': 10.5, fill: C.text2, 'text-anchor': 'middle' }),
    label: txt(gAs, PX + 28, asY(i), e.n, { 'font-size': 10.5 })
  }))
  DIMS.forEach(([name], j) => txt(gAs, PX + 148, asY(j), name, { 'font-size': 10.5 }))

  // Collections.
  const gCol = view('collections', 'Collections')
  const counts = COLLECTIONS.map(([, col]) => ELS.filter(e => e.col === col).length)
  const colRows = COLLECTIONS.slice(0, 5).map(([name, col], i) => {
    const g = node('g', {}, gCol)
    node('rect', { x: PX + 14, y: elY(i) - 10, width: 12, height: 12, rx: 2, fill: col }, g)
    txt(g, PX + 32, elY(i), name, { 'font-size': 11.5 })
    txt(g, PX + PW - 14, elY(i), String(counts[i]), { 'text-anchor': 'end', fill: C.text2 })
    return g
  })

  // The Maps menu, and the dimension picker a new map starts from.
  const menu = node('g', {}, svg)
  node('rect', { x: SW + 4, y: strip.maps.y - 12, width: 150, height: 50, rx: 6, fill: C.white, stroke: C.line }, menu)
  const menuHi = node('rect', { x: SW + 8, y: strip.maps.y - 8, width: 142, height: 20, rx: 4, fill: C.glass, opacity: 0 }, menu)
  txt(menu, SW + 16, strip.maps.y + 6, 'New Cartesian Map…', { 'font-size': 11 })
  txt(menu, SW + 16, strip.maps.y + 28, 'New Semantic Map…', { 'font-size': 11 })
  const pk = { x: (MX + W) / 2 - 100, y: 120, w: 200, h: 134 }
  const picker = node('g', {}, svg)
  node('rect', { x: pk.x, y: pk.y, width: pk.w, height: pk.h, rx: 8, fill: C.white, stroke: C.line }, picker)
  txt(picker, pk.x + 14, pk.y + 24, 'Choose two dimensions', { 'font-weight': 600, fill: C.text2 })
  const pickBoxes = DIMS.map(([name], j) => {
    const y = pk.y + 48 + j * 24
    node('rect', { x: pk.x + 14, y: y - 9, width: 11, height: 11, rx: 2, fill: C.white, stroke: C.control }, picker)
    const tick = node('path', { d: `M${pk.x + 16} ${y - 4}l2.5 2.5 4.5-5`, fill: 'none', stroke: C.frame, 'stroke-width': 1.6, opacity: 0 }, picker)
    txt(picker, pk.x + 32, y, name, { 'font-size': 11 })
    return tick
  })
  const pkBtn = { x: pk.x + pk.w - 84, y: pk.y + pk.h - 38, w: 70, h: 26 }
  node('rect', { x: pkBtn.x, y: pkBtn.y, width: pkBtn.w, height: pkBtn.h, rx: 6, fill: C.frame }, picker)
  txt(picker, pkBtn.x + pkBtn.w / 2, pkBtn.y + 17, 'Create', { 'text-anchor': 'middle', fill: C.white, 'font-weight': 500 })

  // The map tile.
  const map = node('g', {}, svg)
  node('rect', { x: MX, y: MY, width: MW, height: H - MY, fill: C.white }, map)
  node('rect', { x: MX, y: MY, width: MW, height: BAR, fill: C.panel }, map)
  node('line', { x1: MX, y1: MY + BAR, x2: W, y2: MY + BAR, stroke: C.line }, map)
  const tog = node('rect', { x: W - 27, y: MY + 7, width: 16, height: 13, rx: 2.5, fill: C.glass, opacity: 0 }, map)
  node('rect', { x: W - 25, y: MY + 8, width: 12, height: 11, rx: 2, fill: 'none', stroke: C.text2, 'stroke-width': 1.1 }, map)
  node('line', { x1: W - 17.5, y1: MY + 8, x2: W - 17.5, y2: MY + 19, stroke: C.text2, 'stroke-width': 1.1 }, map)
  txt(map, MX + 12, MY + 17.5, 'Raw texture × Cooked texture', { 'font-size': 11.5, 'font-weight': 500, fill: C.text2 })
  node('line', { x1: L - 16, y1: CY, x2: R + 16, y2: CY, stroke: C.text2 }, map)
  node('line', { x1: CX, y1: TOP - 16, x2: CX, y2: BOT + 16, stroke: C.text2 }, map)
  const lab = (x, y, anchor, s) => txt(map, x, y, s, { 'text-anchor': anchor, 'font-size': 10.5 })
  lab(L - 16, CY - 8, 'start', DIMS[0][1]); lab(R + 16, CY - 8, 'end', DIMS[0][2])
  lab(CX + 6, TOP - 6, 'start', DIMS[1][2]); lab(CX + 6, BOT + 16, 'start', DIMS[1][1])
  // The collection's shape sits under the dots, its name over them.
  const shapeCol = COLLECTIONS.find(c => c[0] === SHAPE)[1]
  const shape = node('path', { fill: shapeCol + '22', stroke: shapeCol + '99', 'stroke-width': 1.5, opacity: 0 }, map)
  const shape2Col = COLLECTIONS.find(c => c[0] === SHAPE2)[1]
  const shape2 = node('path', { fill: shape2Col + '22', stroke: shape2Col + '99', 'stroke-width': 1.5, opacity: 0 }, map)
  const dots = ELS.map(e => {
    const halo = node('circle', { r: 11, fill: C.yellow, opacity: 0 }, map)
    const dot = node('circle', { r: 6, fill: C.neutral, stroke: C.white, 'stroke-width': 1.5 }, map)
    const label = txt(map, 0, 0, e.n)
    return { halo, dot, label }
  })
  const shapeName = txt(map, 0, 0, SHAPE, { 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: shapeCol, opacity: 0 })
  const shape2Name = txt(map, 0, 0, SHAPE2, { 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: shape2Col, opacity: 0 })

  // The map's sidebar, sliding in from its right edge.
  const clip = node('clipPath', { id: 'tileClip' }, node('defs', {}, svg))
  node('rect', { x: MX, y: MY + BAR, width: MW, height: H - MY - BAR }, clip)
  const side = node('g', { 'clip-path': 'url(#tileClip)' }, map)
  const sb = node('g', {}, side)
  node('rect', { x: SB, y: MY + BAR, width: SBW, height: H - MY - BAR, fill: C.page }, sb)
  node('line', { x1: SB, y1: MY + BAR, x2: SB, y2: H, stroke: C.line }, sb)
  txt(sb, SB + 12, MY + BAR + 22, 'Color', { 'font-size': 10.5, 'font-weight': 600, fill: C.text2 })
  node('rect', { x: SB + 12, y: MY + BAR + 30, width: SBW - 24, height: 22, rx: 4, fill: C.white, stroke: C.line }, sb)
  const byEl = txt(sb, SB + 20, MY + BAR + 45, 'by element', { 'font-size': 10.5 })
  const byCol = txt(sb, SB + 20, MY + BAR + 45, 'by collection', { 'font-size': 10.5, opacity: 0 })
  txt(sb, SB + 12, MY + BAR + 78, 'Collections', { 'font-size': 10.5, 'font-weight': 600, fill: C.text2 })
  const sbRow = i => MY + BAR + 98 + i * 20
  let shapeTick = null, shape2Tick = null
  COLLECTIONS.slice(0, 5).forEach(([name, col], i) => {
    node('rect', { x: SB + 12, y: sbRow(i) - 9, width: 11, height: 11, rx: 2, fill: C.white, stroke: C.control }, sb)
    const tick = node('path', { d: `M${SB + 14} ${sbRow(i) - 4}l2.5 2.5 4.5-5`, fill: 'none', stroke: C.frame, 'stroke-width': 1.6, opacity: 0 }, sb)
    if (name === SHAPE) shapeTick = tick
    if (name === SHAPE2) shape2Tick = tick
    node('rect', { x: SB + 30, y: sbRow(i) - 8, width: 9, height: 9, rx: 2, fill: col }, sb)
    txt(sb, SB + 44, sbRow(i), name, { 'font-size': 10.5 })
  })

  // Clicks show as a brief ring under the pointer.
  const ripple = node('circle', { r: 0, fill: 'none', stroke: C.frame, 'stroke-width': 1.5, opacity: 0 }, svg)
  const cursor = node('path', { d: 'M0 0L0 16L4.5 12L7.5 19L10 18L7 11.5L12.5 11.5Z', fill: C.text, stroke: C.white, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, svg)

  // Scoring schedule: carrot, celery and spinach at reading pace, the rest
  // quickly; then Cooked texture for all of them, quicker still.
  const selRaw = ELS.map((e, k) => k < 3 ? 9.2 + k * 1.4 : 13.0 + (k - 3) * 0.3)
  const setRaw = selRaw.map((s, k) => s + (k < 3 ? 0.7 : 0.15))
  const selCook = ELS.map((e, k) => 15.2 + k * 0.22)
  const setCook = selCook.map(s => s + 0.11)
  const DIM2 = 14.95

  // The pointer's path: [time, x, y, opacity]; it eases between stops.
  const row = k => [PX + 70, asY(k) - 4], knobAt = k => [tX(ELS[k].x), trackY]
  const from = [px(ELS[DRAGGED].x) + 1, py(ELS[DRAGGED].y) + 1], to = [px(DRAG_TO[0]) + 1, py(DRAG_TO[1]) + 1]
  const STOPS = [[8.6, PX + 150, H - 30, 0], [8.9, PX + 120, H - 60, 1]]
  for (let k = 0; k < 3; k++) {
    const s = selRaw[k]
    STOPS.push([s, ...row(k), 1], [s + 0.25, ...row(k), 1], [s + 0.7, ...knobAt(k), 1], [s + 0.95, ...knobAt(k), 1])
  }
  STOPS.push([14.9, PX + 190, asY(1) - 4, 1], [15.3, PX + 190, asY(1) - 4, 1], [15.9, PX + 200, H - 40, 0],
    [20.5, MX + 60, H - 80, 0], [20.85, 15, strip.maps.y, 1], [21.0, 15, strip.maps.y, 1], [21.25, SW + 90, strip.maps.y + 2, 1],
    [21.85, pk.x + 19, pk.y + 44, 1], [22.25, pk.x + 19, pk.y + 68, 1], [22.75, pkBtn.x + 35, pkBtn.y + 14, 1], [23.0, pkBtn.x + 35, pkBtn.y + 14, 1],
    [23.8, MX + 90, H - 60, 1], [25.0, W - 19, MY + 13.5, 1], [25.2, W - 19, MY + 13.5, 1], [26.1, SB + 60, MY + BAR + 42, 1],
    [26.4, SB + 60, MY + BAR + 42, 1], [27.2, SB + 17, sbRow(0) - 4, 1], [27.4, SB + 17, sbRow(0) - 4, 1], [27.75, SB + 17, sbRow(3) - 4, 1], [27.95, SB + 17, sbRow(3) - 4, 1], [28.4, W - 19, MY + 13.5, 1],
    [28.7, W - 19, MY + 13.5, 1], [30.5, ...from, 1], [30.8, ...from, 1], [32.4, ...to, 1], [32.8, ...to, 1], [33.4, to[0] + 18, to[1] + 14, 0])
  const CLICKS = [[selRaw[0], ...row(0)], [setRaw[0], ...knobAt(0)], [selRaw[1], ...row(1)], [setRaw[1], ...knobAt(1)],
  [selRaw[2], ...row(2)], [setRaw[2], ...knobAt(2)], [DIM2, PX + 190, asY(1) - 4], [21.0, 15, strip.maps.y], [21.25, SW + 90, strip.maps.y + 2],
  [21.85, pk.x + 19, pk.y + 44], [22.25, pk.x + 19, pk.y + 68], [22.8, pkBtn.x + 35, pkBtn.y + 14], [25.05, W - 19, MY + 13.5],
  [26.15, SB + 60, MY + BAR + 42], [27.25, SB + 17, sbRow(0) - 4], [27.8, SB + 17, sbRow(3) - 4], [28.45, W - 19, MY + 13.5]]
  function pointer(t) {
    if (t <= STOPS[0][0] || t >= STOPS[STOPS.length - 1][0]) return [0, 0, 0]
    let i = 0
    while (STOPS[i + 1][0] <= t) i++
    const a = STOPS[i], b = STOPS[i + 1], p = prog(t, a[0], b[0])
    return [mix(a[1], b[1], p), mix(a[2], b[2], p), mix(a[3], b[3], p)]
  }

  function render(t) {
    const out = 1 - lin(t, 35.2, 36.0)

    // The open view, and its strip icon.
    const shown = {
      elements: 1 - lin(t, 4.4, 4.7),
      dims: window_(t, 4.4, 8.3, 0.3),
      assess: Math.max(window_(t, 8.4, 17.1, 0.3), lin(t, 29.1, 29.4) * out),
      collections: window_(t, 17.2, 29.1, 0.3)
    }
    for (const k in shown) {
      set(views[k], { opacity: shown[k] })
      set(strip[k].on, { opacity: shown[k] })
      set(strip[k].g, { color: mixHex('#b9c6c5', '#ffffff', shown[k]) })
    }
    const mapsHi = window_(t, 20.8, 21.3, 0.15)
    set(strip.maps.on, { opacity: mapsHi }); set(strip.maps.g, { color: mixHex('#b9c6c5', '#ffffff', mapsHi) })

    // Elements typed in.
    elRows.forEach((r, i) => {
      const a = 0.3 + i * 0.4, n = ELS[i].n
      r.label.textContent = n.slice(0, Math.ceil(n.length * lin(t, a, a + 0.3)))
      set(r.g, { opacity: t >= a ? 1 : 0 })
    })
    dimRows.forEach((r, j) => {
      const a = 4.8 + j * 1.5
      r.name.textContent = r.full[0].slice(0, Math.ceil(r.full[0].length * lin(t, a, a + 0.5)))
      r.poles.textContent = r.full[1].slice(0, Math.ceil(r.full[1].length * lin(t, a + 0.6, a + 1.2)))
      set(r.g, { opacity: t >= a ? 1 : 0 })
    })

    // Assess.
    const move = prog(t, 30.8, 32.4)
    const dragged = [mix(ELS[DRAGGED].x, DRAG_TO[0], move), mix(ELS[DRAGGED].y, DRAG_TO[1], move)]
    const late = t >= 29.0
    let sel = null, dim = t >= DIM2 && !late ? 1 : 0
    if (late) sel = DRAGGED
    else if (dim) { sel = ELS.length - 1; selCook.forEach((s, k) => { if (t >= s) sel = k }) }
    else selRaw.forEach((s, k) => { if (t >= s) sel = k })
    const score = k => k === DRAGGED && late ? dragged[dim] : dim ? ELS[k].y : ELS[k].x
    const isSet = k => late || t >= (dim ? setCook : setRaw)[k]
    slName.textContent = sel == null ? '' : ELS[sel].n
    poleA.textContent = DIMS[dim][1]; poleB.textContent = DIMS[dim][2]
    set(knob, { cx: sel != null ? tX(score(sel)) : 0, opacity: sel != null && isSet(sel) ? 1 : 0 })
    set(asSel, { y: sel != null ? asY(sel) - 13.5 : 0, opacity: sel != null ? 1 : 0 })
    set(dimSel, { y: asY(dim) - 13.5 })
    asRows.forEach((r, k) => {
      const n = (late || t >= setRaw[k] ? 1 : 0) + (late || t >= setCook[k] ? 1 : 0)
      r.mark.textContent = ['–', '◇', '●'][n]
      set(r.mark, { fill: n ? C.text : C.text2 })
    })
    colRows.forEach((g, i) => set(g, { opacity: lin(t, 17.6 + i * 0.25, 18.0 + i * 0.25) }))

    // Maps menu, picker, and the new map.
    set(menu, { opacity: window_(t, 21.0, 21.3, 0.12) })
    set(menuHi, { opacity: lin(t, 21.15, 21.25) })
    set(picker, { opacity: window_(t, 21.35, 22.85, 0.2) })
    pickBoxes.forEach((tick, j) => set(tick, { opacity: t >= 21.85 + j * 0.4 ? 1 : 0 }))
    set(map, { opacity: lin(t, 22.9, 23.5) * out })

    // Sidebar: opened, color by collection, show the shape, closed.
    const open = prog(t, 25.1, 25.6) * (1 - prog(t, 28.5, 29.0))
    set(sb, { transform: `translate(${(1 - open) * (SBW + 2)} 0)` })
    set(tog, { opacity: t >= 25.05 && t < 28.45 ? 1 : 0 })
    const color = prog(t, 26.2, 26.7)
    set(byEl, { opacity: 1 - lin(t, 26.15, 26.3) }); set(byCol, { opacity: lin(t, 26.15, 26.3) })
    set(shapeTick, { opacity: t >= 27.25 ? 1 : 0 })
    const shapeOn = lin(t, 27.3, 27.8)
    set(shape2Tick, { opacity: t >= 27.8 ? 1 : 0 })
    const shape2On = lin(t, 27.85, 28.3)

    // Dots.
    const members = [], members2 = []
    ELS.forEach((e, i) => {
      const d = dots[i]
      const [sx, sy] = i === DRAGGED ? dragged : [e.x, e.y]
      const x = px(sx), y = py(sy)
      set(d.dot, { cx: x, cy: y, fill: e.col ? mixHex(C.neutral, e.col, color) : C.neutral })
      set(d.halo, { cx: x, cy: y, opacity: i === DRAGGED ? lin(t, 30.6, 30.8) : 0 })
      const right = e.side ? e.side === 'left' : x > px(0.74)
      set(d.label, { x: right ? x - 10 : x + 10, y: y + 4, 'text-anchor': right ? 'end' : 'start' })
      if (e.col === shapeCol) members.push({ x, y })
      if (e.col === shape2Col) members2.push({ x, y })
    })
    set(shape, { opacity: shapeOn }); set(shapeName, { opacity: shapeOn })
    if (shapeOn > 0) {
      set(shape, { d: blobPath(members, 6 + 8) })
      const mx = members.reduce((s, p) => s + p.x, 0) / members.length, my = members.reduce((s, p) => s + p.y, 0) / members.length
      // At the members' center, as in the app, nudged off the axis line it would sit on.
      set(shapeName, { x: mx, y: (Math.abs(my - CY) < 14 ? CY + 14 : my) + 4 })
    }
    set(shape2, { opacity: shape2On }); set(shape2Name, { opacity: shape2On })
    if (shape2On > 0) {
      set(shape2, { d: blobPath(members2, 6 + 8) })
      const mx = members2.reduce((s, p) => s + p.x, 0) / members2.length, my = members2.reduce((s, p) => s + p.y, 0) / members2.length
      set(shape2Name, { x: mx, y: (Math.abs(my - CY) < 14 ? CY + 14 : my) + 4 })
    }

    // Pointer and clicks.
    const [cx, cy, co] = pointer(t)
    set(cursor, { transform: `translate(${cx} ${cy})`, opacity: co })
    const c = CLICKS.find(c => t >= c[0] && t < c[0] + 0.4)
    if (c) { const p = (t - c[0]) / 0.4; set(ripple, { cx: c[1], cy: c[2], r: 3 + p * 9, opacity: 0.6 * (1 - p) }) }
    else set(ripple, { opacity: 0 })
  }
  return { render }
}

// Card stills. All three use the same items, positions and colors as the
// walk-through's two-way map, so a dot keeps its color from card to card.
const font = { 'font-family': 'IBM Plex Sans, sans-serif' }
// The stills add Zucchini so each collection shown has three members.
// m, r, p: Mild–Pungent, Raw-friendly–Cooked-only, Perishable–Long-storing from
// the bundled example (resources/examples/sample-dataset.chora).
// Beet keeps its card position; the walk-through starts it closer to carrot so its drag stretches the shape.
const STILL_ELS = [...ELS.map(e => e.n === 'Beet' ? { ...e, x: 0.76, y: 0.36 } : e),
{ n: 'Zucchini', col: '#4E79A7', x: 0.56, y: 0.05, side: 'right' }]
const REAL = {
  Carrot: [0.18, 0.17, 0.8], Celery: [0.1, 0.22, 0.85], Spinach: [0.1, 0.15, 0.11], Tomato: [0.25, 0.1, 0.16],
  Cucumber: [0.07, 0.09, 0.2], Broccoli: [0.35, 0.45, 0.35], 'Butternut squash': [0.15, 0.86, 0.85], Potato: [0.07, 0.95, 0.9],
  Beet: [0.35, 0.5, 0.7], Zucchini: [0.15, 0.4, 0.25]
}
const SHOWN = ['Root vegetables', 'Cucurbits']                 // collections colored on card 2
const colorOf = (e, colored) => colored && e.col && SHOWN.includes(COLLECTIONS.find(c => c[1] === e.col)[0]) ? e.col : C.neutral
function frameStill(svg, title) {
  // Header band in the button cyan, with white text.
  node('rect', { x: MX, y: MY, width: MW, height: MH, rx: 8, fill: C.white }, svg)
  node('path', { d: `M${MX} ${MY + BAR}V${MY + 8}a8 8 0 0 1 8-8H${MX + MW - 8}a8 8 0 0 1 8 8V${MY + BAR}Z`, fill: C.cyan }, svg)
  node('text', { x: MX + 12, y: MY + 17.5, 'font-size': 11.5, 'font-weight': 500, fill: C.white, ...font }, svg, title)
}
function mapDot(svg, x, y, fill) { node('circle', { cx: x, cy: y, r: 6, fill, stroke: C.white, 'stroke-width': 1.5 }, svg) }

// Collection blob, after App/src/renderer/src/components/maps/blob.ts and
// drawCartesian.ts: each member padded by its dot radius plus an 8px gap;
// one member is a circle, two a capsule, three or more a smoothed convex hull.
// Fill is the collection color at ~13% (22), border at ~60% (99), 1.5px,
// and the name sits in bold at the members' centroid.
function blobPath(pts, pad) {
  if (pts.length === 1) { const [p] = pts; return `M${p.x - pad} ${p.y}a${pad} ${pad} 0 1 0 ${2 * pad} 0a${pad} ${pad} 0 1 0 ${-2 * pad} 0Z` }
  if (pts.length === 2) {
    const [a, b] = pts, len = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / len * pad, ny = (b.x - a.x) / len * pad
    return `M${a.x + nx} ${a.y + ny}L${b.x + nx} ${b.y + ny}A${pad} ${pad} 0 0 0 ${b.x - nx} ${b.y - ny}L${a.x - nx} ${a.y - ny}A${pad} ${pad} 0 0 0 ${a.x + nx} ${a.y + ny}Z`
  }
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  let s = 0; pts.forEach((p, i) => { if (p.x < pts[s].x) s = i })
  const hull = []; let cur = s
  do { hull.push(pts[cur]); let nx = (cur + 1) % pts.length; pts.forEach((p, i) => { if (cross(pts[cur], pts[nx], p) < 0) nx = i }); cur = nx } while (cur !== s && hull.length <= pts.length)
  const n = hull.length
  const padded = hull.map((v, i) => {
    const p = hull[(i - 1 + n) % n], q = hull[(i + 1) % n]
    const li = Math.hypot(v.x - p.x, v.y - p.y), lo = Math.hypot(q.x - v.x, q.y - v.y)
    let bx = (v.y - p.y) / li + (q.y - v.y) / lo, by = -(v.x - p.x) / li - (q.x - v.x) / lo
    const bl = Math.hypot(bx, by); return { x: v.x + bx / bl * pad, y: v.y + by / bl * pad }
  })
  let d = `M${padded[0].x} ${padded[0].y}`
  for (let i = 0; i < n; i++) {
    const p0 = padded[(i - 1 + n) % n], p1 = padded[i], p2 = padded[(i + 1) % n], p3 = padded[(i + 2) % n]
    d += `C${p1.x + (p2.x - p0.x) / 12} ${p1.y + (p2.y - p0.y) / 12} ${p2.x - (p3.x - p1.x) / 12} ${p2.y - (p3.y - p1.y) / 12} ${p2.x} ${p2.y}`
  }
  return d + 'Z'
}
function drawBlob(svg, name) {
  const col = COLLECTIONS.find(c => c[0] === name)[1]
  const pts = STILL_ELS.filter(e => e.col === col).map(e => ({ x: px(e.x), y: py(e.y) }))
  node('path', { d: blobPath(pts, 6 + 8), fill: col + '22', stroke: col + '99', 'stroke-width': 1.5 }, svg)
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  node('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: col, ...font }, svg, name)
}

// Cards 1 and 2: the two-way map with every item. Card 1 points at one item;
// card 2 colors two collections and names them in the title bar.
function drawMap(svg, { pointAt = null, colored = false } = {}) {
  frameStill(svg, 'Raw texture × Cooked texture')
  node('line', { x1: L - 16, y1: CY, x2: R + 16, y2: CY, stroke: C.text2 }, svg)
  node('line', { x1: CX, y1: TOP - 16, x2: CX, y2: BOT + 16, stroke: C.text2 }, svg)
  const lab = (x, y, anchor, s) => node('text', { x, y, 'text-anchor': anchor, 'font-size': 10.5, fill: C.text, ...font }, svg, s)
  lab(L - 16, CY - 8, 'start', 'Soft raw'); lab(R + 16, CY - 8, 'end', 'Crisp raw')
  lab(CX + 6, TOP - 6, 'start', 'Firm when cooked'); lab(CX + 6, BOT + 16, 'start', 'Soft when cooked')
  if (colored) {
    let x = MX + MW - 12
    SHOWN.slice().reverse().forEach(name => {
      const col = COLLECTIONS.find(c => c[0] === name)[1]
      const t = node('text', { x, y: MY + 17.5, 'text-anchor': 'end', 'font-size': 10.5, fill: C.white, ...font }, svg, name)
      x -= t.getComputedTextLength() + 6
      node('rect', { x: x - 10, y: MY + 8.5, width: 10, height: 10, rx: 2, fill: col }, svg)
      x -= 22
    })
  }
  let target = null
  STILL_ELS.forEach(e => {
    const x = px(e.x), y = py(e.y)
    if (e.n === pointAt) { node('circle', { cx: x, cy: y, r: 11, fill: C.yellow }, svg); target = [x, y] }
    mapDot(svg, x, y, colorOf(e, colored))
    // Label sides on the stills were checked so no name overlaps another
    // name, a dot or a collection's name; Potato's goes right.
    const right = e.side ? e.side === 'left' : x > px(0.74) && e.n !== 'Potato'
    node('text', { x: right ? x - 10 : x + 10, y: y + 4, 'text-anchor': right ? 'end' : 'start', 'font-size': 11, fill: C.text, ...font }, svg, e.n)
  })
  if (colored) SHOWN.forEach(name => drawBlob(svg, name))
  if (target) node('path', { d: 'M0 0L0 16L4.5 12L7.5 19L10 18L7 11.5L12.5 11.5Z', fill: C.text, stroke: C.white, 'stroke-width': 1.2, 'stroke-linejoin': 'round', transform: `translate(${target[0] + 2} ${target[1] + 2})` }, svg)
}

// Card 3: the semantic map with every item, one highlighted. Raw and cooked
// texture are the two-way map's scores; colors are card 2's.
function drawSemantic(svg, highlight) {
  frameStill(svg, 'Semantic map')
  const dims = [['Mild', 'Pungent'], ['Soft raw', 'Crisp raw'], ['Soft when cooked', 'Firm when cooked'], ['Raw-friendly', 'Cooked-only'], ['Perishable', 'Long-storing']]
  const items = STILL_ELS.map(e => { const [m, r, p] = REAL[e.n]; return { n: e.n, col: colorOf(e, true), s: [m, e.x, e.y, r, p] } })
  const x0 = MX + 28, x1 = MX + MW - 28, y = i => MY + BAR + 40 + i * (MH - BAR - 40 - 30) / 4
  const X = v => mix(x0, x1, v)
  dims.forEach(([a, b], i) => {
    node('line', { x1: x0, y1: y(i), x2: x1, y2: y(i), stroke: C.line }, svg)
    node('text', { x: x0, y: y(i) - 14, 'font-size': 10.5, fill: C.text2, ...font }, svg, a)
    node('text', { x: x1, y: y(i) - 14, 'text-anchor': 'end', 'font-size': 10.5, fill: C.text2, ...font }, svg, b)
  })
  const line = (it, w, op) => node('polyline', { points: it.s.map((v, i) => `${X(v)},${y(i)}`).join(' '), fill: 'none', stroke: it.col, 'stroke-width': w, 'stroke-linejoin': 'round', opacity: op }, svg)
  const rest = items.filter(it => it.n !== highlight), hi = items.find(it => it.n === highlight)
  rest.forEach(it => line(it, 1.5, 0.45))
  rest.forEach(it => it.s.forEach((v, i) => mapDot(svg, X(v), y(i), it.col)))
  line(hi, 3, 1)
  hi.s.forEach((v, i) => { node('circle', { cx: X(v), cy: y(i), r: 11, fill: C.yellow }, svg); mapDot(svg, X(v), y(i), hi.col) })
  hi.s.forEach((v, i) => mapDot(svg, X(v), y(i), hi.col))
  node('text', { x: X(hi.s[0]), y: y(0) - 16, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: C.text, ...font }, svg, hi.n)
  // Key, as on card 2.
  let kx = MX + MW - 12
  SHOWN.slice().reverse().forEach(name => {
    const col = COLLECTIONS.find(c => c[0] === name)[1]
    const t = node('text', { x: kx, y: MY + 17.5, 'text-anchor': 'end', 'font-size': 10.5, fill: C.white, ...font }, svg, name)
    kx -= t.getComputedTextLength() + 6
    node('rect', { x: kx - 10, y: MY + 8.5, width: 10, height: 10, rx: 2, fill: col }, svg)
    kx -= 22
  })
}

// ── Playback ─────────────────────────────────────────────────────────────────
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const stage = makeScene(document.getElementById('stage'))
drawMap(document.getElementById('still1'), { pointAt: 'Carrot' })
drawMap(document.getElementById('still2'), { colored: true })
drawSemantic(document.getElementById('still3'), 'Carrot')

const caption = document.getElementById('caption'), stepsEl = document.getElementById('steps')
let t = reduce ? SCENES[SCENES.length - 1].key : 0, playing = !reduce, visible = true, last = null

const stepBtns = SCENES.map((s, i) => {
  const b = document.createElement('button')
  b.type = 'button'
  b.setAttribute('aria-label', `Step ${i + 1}: ${s.text}`)
  b.addEventListener('click', () => { t = playing ? s.t : s.key; draw() })
  stepsEl.appendChild(b)
  return b
})
new IntersectionObserver(([e]) => { visible = e.isIntersecting }).observe(document.getElementById('stage'))

// Click the walk-through, or focus it and press Enter or Space, to pause or resume.
const stageEl = document.getElementById('stage'), pausedEl = document.getElementById('paused')
const toggle = () => { playing = !playing; if (playing && t >= TOTAL - 0.01) t = 0; draw() }
stageEl.addEventListener('click', toggle)
stageEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } })

function draw() {
  stage.render(t)
  let k = 0
  SCENES.forEach((s, i) => { if (t >= s.t) k = i })
  if (caption.textContent !== SCENES[k].text) caption.textContent = SCENES[k].text
  stepBtns.forEach((b, i) => b.classList.toggle('on', i === k))
  pausedEl.hidden = playing
  stageEl.setAttribute('aria-label', playing ? 'Pause the walk-through' : 'Play the walk-through')
}
function frame(ts) {
  if (last != null && playing && visible) { t += Math.min(0.1, (ts - last) / 1000); if (t >= TOTAL) t = 0 }
  last = ts
  draw()
  requestAnimationFrame(frame)
}
draw()
requestAnimationFrame(frame)
