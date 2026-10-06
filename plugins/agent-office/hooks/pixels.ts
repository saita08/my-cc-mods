import type { Pose } from '../types'

// Pixel art for the rooms. A terminal cell holds two pixels, one above the
// other: the upper half block takes the top pixel as its foreground and the
// bottom pixel as its background.

export type Canvas = { width: number; height: number; px: number[] }
export type Seat = Pose | 'empty' | 'guest' | 'elder'
export type Cells = { columns: number; rows: number; cells: string }

const C = {
  clawd: 0xd77757,
  guest: 0x7d8fa8,
  elder: 0xd6d3e6,
  cane: 0x9a6b3f,
  sofa: 0x5e4548,
  cabinet: 0x6a5a4c,
  tray: 0x8b9099,
  eye: 0x1a1a1a,
  wallEdge: 0x2b2f38,
  wall: 0x3b404b,
  frame: 0x5c6370,
  glass: 0x4f7391,
  floorA: 0x4a3f36,
  floorB: 0x443a32,
  door: 0x6b4f3a,
  desk: 0x8a6a4a,
  deskLeg: 0x5c4633,
  chair: 0x555a63,
  monitor: 0x23262b,
  screenOff: 0x1b232b,
  page: 0xe8e6df,
  ink: 0x7d8590,
  glow: 0x6fd3c1,
  amber: 0xe0b45c,
  sky: 0x7aa7e0,
  cursor: 0xf2fffc,
  bubble: 0xf0f0f0,
  zz: 0xb9c4ff,
  cup: 0xeeeeee,
  coffee: 0x6b4226,
  steam: 0x9a9a9a,
  leaf: 0x4f7a4a,
  pot: 0x8b5a3c,
  mail: 0xf2f2f2,
  mailLit: 0xffd84a,
  clockFace: 0xd9d9d9,
  phone: 0xc0392b,
} as const

// Clawd: a wide body, two dark eyes, arms out to the sides, four short legs.
// Its proportions follow the startup banner's: a flat body about twice as wide
// as tall, eyes a third of the way down near the quarter points, short arms.
const CLAWD = [
  ' OOOOOOOOOO ',
  'OOOeOOOOeOOO',
  'OOOOOOOOOOOO',
  ' OOOOOOOOOO ',
  ' OOOOOOOOOO ',
  ' O O    O O ',
]
// Typing: the arms drop to the keyboard.
const CLAWD_TAP = [CLAWD[0]!, ' OOeOOOOeOO ', 'OOOOOOOOOOOO', 'OOOOOOOOOOOO', CLAWD[4]!, CLAWD[5]!]

const QUESTION = ['##.', '..#', '.#.', '...', '.#.']
const ZED = ['###', '.#.', '###']
const ZED_SMALL = ['##', '##']

export const STATION = 18
export const PITCH = 12

const WORKING: Pose[] = ['type', 'read', 'search', 'write', 'out', 'delegate']

function canvas(width: number, height: number, fill: number): Canvas {
  return { width, height, px: new Array<number>(width * height).fill(fill) }
}

function dot(c: Canvas, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return
  c.px[y * c.width + x] = color
}

function rect(c: Canvas, x: number, y: number, w: number, h: number, color: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(c, x + i, y + j, color)
}

function sprite(c: Canvas, x: number, y: number, rows: string[], color: number, eye = color): void {
  rows.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === 'O' || ch === '#') dot(c, x + i, y + j, color)
      if (ch === 'e') dot(c, x + i, y + j, eye)
    }),
  )
}

function screenOf(pose: Seat, tick: number): number[] | undefined {
  const blink = tick % 2 === 0
  switch (pose) {
    case 'type':
      return [C.glow, C.glow, C.glow, C.glow, blink ? C.cursor : C.glow, C.glow]
    case 'read':
    case 'write':
      return [C.page, C.ink, C.page, C.page, blink ? C.ink : C.page, C.page]
    case 'search':
      return [C.glow, C.cursor, C.glow, blink ? C.glow : C.cursor, C.glow, C.glow]
    case 'out':
      return [C.sky, C.sky, C.leaf, C.leaf, C.sky, blink ? C.leaf : C.sky]
    case 'delegate':
      return [C.amber, C.amber, C.amber, blink ? C.cursor : C.amber, C.amber, C.amber]
    default:
      return undefined
  }
}

// A visitor on the sofa, a cup of tea on the low table beside them.
function guest(c: Canvas, x: number, y: number, tick: number): void {
  rect(c, x, y + 1, 12, 4, C.sofa)
  sprite(c, x, y, CLAWD, C.guest, tick % 4 === 3 ? C.guest : C.eye)
  rect(c, x + 13, y + 3, 5, 1, C.desk)
  rect(c, x + 13, y + 4, 1, 2, C.deskLeg)
  rect(c, x + 17, y + 4, 1, 2, C.deskLeg)
  dot(c, x + 15, y + 2, C.cup)
  if (tick % 2 === 0) dot(c, x + 15, y + 1, C.steam)
}

// The 相談役: Clawd in silver, leaning on a cane.
function elder(c: Canvas, x: number, y: number, tick: number): void {
  sprite(c, x, y, CLAWD, C.elder, tick % 4 === 3 ? C.elder : C.eye)
  rect(c, x + 13, y + 1, 1, 5, C.cane)
  dot(c, x + 12, y + 1, C.cane)
}

// One seat: Clawd at x..x+11, the desk and monitor at x+12..x+17; `y` is the head row.
function station(c: Canvas, x: number, y: number, pose: Seat, tick: number): void {
  if (pose === 'guest') return guest(c, x, y, tick)
  if (pose === 'elder') return elder(c, x, y, tick)
  const screen = screenOf(pose, tick)
  rect(c, x + 13, y - 1, 5, 3, C.monitor)
  ;(screen ?? new Array<number>(6).fill(C.screenOff)).forEach((color, i) => dot(c, x + 14 + (i % 3), y + Math.floor(i / 3), color))
  rect(c, x + 12, y + 2, 6, 1, C.desk)
  rect(c, x + 12, y + 3, 1, 3, C.deskLeg)
  rect(c, x + 17, y + 3, 1, 3, C.deskLeg)

  if (pose === 'empty' || pose === 'gone') {
    rect(c, x + 2, y + 1, 1, 3, C.chair)
    rect(c, x + 2, y + 3, 8, 1, C.chair)
    rect(c, x + 2, y + 4, 1, 2, C.chair)
    rect(c, x + 9, y + 4, 1, 2, C.chair)
    return
  }

  const isTyping = WORKING.includes(pose) && tick % 2 === 1
  const isBlinking = pose === 'wait' ? tick % 2 === 1 : tick % 4 === 3
  sprite(c, x, y, isTyping ? CLAWD_TAP : CLAWD, C.clawd, isBlinking ? C.clawd : C.eye)

  switch (pose) {
    case 'think':
      sprite(c, x + 8 + (tick % 2), y - 5, QUESTION, C.bubble)
      break
    case 'wait':
      sprite(c, x + 9, y - 4, tick % 2 === 0 ? ZED : ZED_SMALL, C.zz)
      break
    case 'coffee':
      rect(c, x + 15, y, 2, 2, C.cup)
      dot(c, x + 15, y, C.coffee)
      dot(c, x + 16, y, C.coffee)
      dot(c, x + 17, y + 1, C.cup)
      dot(c, x + 15 + (tick % 2), y - 1, C.steam)
      break
    case 'phone':
      // The desk phone rings: the handset on the desk, sound arcs over the head.
      rect(c, x + 12, y + 1, 2, 1, C.phone)
      sprite(c, x + 8, y - 4, ['#.', '.#', '#.'], C.mailLit)
      if (tick % 2 === 1) sprite(c, x + 10, y - 5, ['#..', '.#.', '..#', '.#.', '#..'], C.mailLit)
      break
  }
}

function window(c: Canvas, x: number, w: number): void {
  rect(c, x, 1, w, 4, C.frame)
  rect(c, x + 1, 2, w - 2, 2, C.glass)
  rect(c, x + Math.floor(w / 2), 2, 1, 2, C.frame)
}

export type RoomArt = {
  seats: Seat[]
  // Seats side by side before the room grows another row.
  perRow: number
  tick: number
  // The wider room view adds a clock and a plant.
  isLarge?: boolean
  // The 社長室's cabinet: the mail light on the wall above, papers in its tray.
  cabinet?: { hasUnread: boolean; papers: number }
}

export const CABINET = 6

export function roomWidth(perRow: number): number {
  return (STATION + 1) * perRow + 1
}

export function roomHeight(seatCount: number, perRow: number): number {
  return PITCH * Math.max(1, Math.ceil(seatCount / perRow))
}

export function paintRoom(art: RoomArt): Canvas {
  const perRow = Math.max(1, art.perRow)
  const width = roomWidth(perRow) + (art.cabinet ? CABINET : 0)
  const height = roomHeight(art.seats.length, perRow)
  const c = canvas(width, height, C.floorA)

  for (let y = 5; y < height - 1; y++) for (let x = (y % 2) + 1; x < width - 1; x += 2) dot(c, x, y, C.floorB)
  rect(c, 0, 0, width, 1, C.wallEdge)
  rect(c, 0, 1, width, 4, C.wall)
  rect(c, 0, 0, 1, height, C.wallEdge)
  rect(c, width - 1, 0, 1, height, C.wallEdge)
  rect(c, 0, height - 1, width, 1, C.wallEdge)
  rect(c, 2, height - 1, 4, 1, C.door)

  for (let k = 0; k < perRow; k++) window(c, 1 + k * (STATION + 1) + 3, 6)
  if (art.cabinet) {
    const x = width - 6
    const color = art.cabinet.hasUnread ? (art.tick % 2 === 0 ? C.mailLit : C.mail) : C.frame
    rect(c, x, 1, 4, 3, color)
    dot(c, x + 1, 2, C.wallEdge)
    dot(c, x + 2, 2, C.wallEdge)
    rect(c, x, 7, 4, 1, C.desk)
    rect(c, x, 8, 4, 3, C.cabinet)
    dot(c, x + 1, 9, C.deskLeg)
    dot(c, x + 2, 9, C.deskLeg)
    rect(c, x, 6, 4, 1, C.tray)
    for (let k = 0; k < Math.min(2, art.cabinet.papers); k++) rect(c, x + 1, 5 - k, 2, 1, C.page)
  }
  if (art.isLarge && width >= 34) {
    const x = art.cabinet ? width - 11 : width - 6
    rect(c, x, 1, 3, 3, C.clockFace)
    dot(c, x + 1, 2, C.eye)
    dot(c, x + 1 + (art.tick % 2), 1 + (art.tick % 2), C.eye)
  }

  art.seats.forEach((pose, i) => {
    const x = 1 + (i % perRow) * (STATION + 1)
    const y = 5 + Math.floor(i / perRow) * PITCH
    station(c, x, y, pose, art.tick)
  })

  if (art.isLarge && art.seats.length % perRow !== 0) {
    const x = 1 + (art.seats.length % perRow) * (STATION + 1) + 4
    const y = height - 8
    sprite(c, x, y, ['.#.#.', '#.#.#', '.###.', '..#..'], C.leaf)
    rect(c, x + 1, y + 4, 3, 3, C.pot)
  }

  return c
}

// Packs a canvas into Raster cells: `▀` with the top pixel as foreground and
// the bottom one as background, each cell three little-endian u32 words.
export function toCells(c: Canvas): Cells {
  const rows = Math.ceil(c.height / 2)
  const words = new Uint32Array(c.width * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < c.width; x++) {
      const at = (r * c.width + x) * 3
      words[at] = 0x2580
      words[at + 1] = c.px[2 * r * c.width + x] ?? 0
      words[at + 2] = c.px[(2 * r + 1) * c.width + x] ?? c.px[2 * r * c.width + x] ?? 0
    }
  }
  return { columns: c.width, rows, cells: encode(words) }
}

// Vector art, for the surfaces that draw an Svg instead of a Raster (the
// desktop app, the editor, the mobile app). One canvas pixel is a square of
// SVG_PX CSS pixels, so a room spans as many columns as it does in half mode and
// the same layout serves both: SVG_PX stays under a character cell's width so a
// tile never outgrows the columns the pane reserved for it.

export const SVG_PX = 6
// About the height of a line of text, to count the rows a picture takes.
export const SVG_ROW_PX = 20
// The most characters the engine takes as one Svg source.
export const SVG_LIMIT = 131072

export type Svg = { source: string; width: number; height: number }

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
const isOpaque = (color: number) => color >= 0 && color <= 0xffffff

// The canvas as one rect of its commonest color and one path per other color,
// each a horizontal run of equal pixels drawn as a row-high box. A pixel outside
// 0..0xffffff is transparent and left out.
export function toSvg(c: Canvas, scale = SVG_PX): Svg {
  const counts = new Map<number, number>()
  for (const color of c.px) counts.set(color, (counts.get(color) ?? 0) + 1)
  const base = [...counts].filter(([color]) => isOpaque(color)).sort((a, b) => b[1] - a[1])[0]?.[0]
  const paths = new Map<number, string>()
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; ) {
      const color = c.px[y * c.width + x] ?? -1
      let end = x + 1
      while (end < c.width && c.px[y * c.width + end] === color) end++
      if (isOpaque(color) && color !== base) paths.set(color, `${paths.get(color) ?? ''}M${x} ${y}h${end - x}v1h-${end - x}z`)
      x = end
    }
  }
  const body = [...paths].map(([color, d]) => `<path fill="${hex(color)}" d="${d}"/>`).join('')
  const ground = base === undefined ? '' : `<rect width="${c.width}" height="${c.height}" fill="${hex(base)}"/>`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}" shape-rendering="crispEdges">${ground}${body}</svg>`
  return { source, width: c.width * scale, height: c.height * scale }
}

// Text rows a picture of this many canvas pixels tall takes beside the lines.
export function svgRows(pixels: number): number {
  return Math.ceil((pixels * SVG_PX) / SVG_ROW_PX)
}

// Background-only art, for terminals whose font does not draw the half block
// edge to edge (Apple Terminal): every cell is a space with a background, one
// pixel twice as tall as wide, and a cue may be a real character over it.

export type Mode = 'half' | 'flat'

// Terminals that draw block characters themselves get the finer half blocks.
export function modeFor(program: string | undefined, term: string | undefined): Mode {
  const drawsBlocks = ['ghostty', 'iTerm.app', 'WezTerm', 'kitty'].includes(program ?? '') || (term ?? '').includes('kitty')
  return drawsBlocks ? 'half' : 'flat'
}

type Flat = Canvas & { glyph: (string | undefined)[]; ink: number[] }

const DEFAULT_INK = 0x01000000

export const FLAT_STATION = 17
export const FLAT_PITCH = 5
export const FLAT_CABINET = 5

// Clawd on the tall grid, where a cell is about 1:2.15: a body ten wide and
// three tall, eyes and short arms on its middle row, and under it four
// one-cell legs, two at each edge.
const FLAT_CLAWD = [' OOOOOOOOOO ', 'OOOeOOOOeOOO', ' OOOOOOOOOO ']
const FLAT_TAP = [FLAT_CLAWD[0]!, ' OOeOOOOeOO ', 'OOOOOOOOOOOO']
const FLAT_LEGS = ' O O    O O '

function flat(width: number, height: number, fill: number): Flat {
  const n = width * height
  return { ...canvas(width, height, fill), glyph: new Array<string | undefined>(n).fill(undefined), ink: new Array<number>(n).fill(DEFAULT_INK) }
}

function mark(c: Flat, x: number, y: number, text: string, ink: number): void {
  ;[...text].forEach((ch, i) => {
    const at = x + i
    if (at < 0 || y < 0 || at >= c.width || y >= c.height || ch === ' ') return
    c.glyph[y * c.width + at] = ch
    c.ink[y * c.width + at] = ink
  })
}

function flatScreen(pose: Seat, tick: number): [number, string] | undefined {
  const blink = tick % 2 === 0
  switch (pose) {
    case 'type':
      return [C.glow, blink ? '>_' : '> ']
    case 'read':
      return [C.page, blink ? '==' : '= ']
    case 'write':
      return [C.page, blink ? '~ ' : '~~']
    case 'search':
      return [C.glow, blink ? 'o ' : ' o']
    case 'out':
      return [C.sky, blink ? '@ ' : ' @']
    case 'delegate':
      return [C.amber, blink ? '->' : '> ']
    default:
      return undefined
  }
}

// One seat: Clawd at x..x+11, a cue at x+12..x+13, the desk at x+14..x+16.
function flatStation(c: Flat, x: number, y: number, pose: Seat, tick: number): void {
  const body = (color: number, rows: string[], isBlinking: boolean) => {
    sprite(c, x, y, rows, color, isBlinking ? color : C.eye)
    sprite(c, x, y + 3, [FLAT_LEGS], color)
  }
  if (pose === 'guest') {
    rect(c, x, y + 1, 12, 2, C.sofa)
    body(C.guest, FLAT_CLAWD, tick % 4 === 3)
    rect(c, x + 14, y + 2, 3, 1, C.desk)
    dot(c, x + 14, y + 3, C.deskLeg)
    dot(c, x + 16, y + 3, C.deskLeg)
    dot(c, x + 15, y + 1, C.cup)
    mark(c, x + 15 - (tick % 2), y, '~', C.steam)
    return
  }
  if (pose === 'elder') {
    body(C.elder, FLAT_CLAWD, tick % 4 === 3)
    rect(c, x + 12, y + 1, 1, 3, C.cane)
    dot(c, x + 13, y + 1, C.cane)
    return
  }

  const screen = flatScreen(pose, tick)
  rect(c, x + 14, y, 3, 2, C.monitor)
  rect(c, x + 15, y, 2, 1, screen?.[0] ?? C.screenOff)
  if (screen) mark(c, x + 15, y, screen[1], C.monitor)
  rect(c, x + 14, y + 2, 3, 1, C.desk)
  dot(c, x + 14, y + 3, C.deskLeg)
  dot(c, x + 16, y + 3, C.deskLeg)

  if (pose === 'empty' || pose === 'gone') {
    rect(c, x + 3, y + 1, 1, 2, C.chair)
    rect(c, x + 3, y + 2, 6, 1, C.chair)
    dot(c, x + 3, y + 3, C.chair)
    dot(c, x + 8, y + 3, C.chair)
    return
  }

  const isTyping = WORKING.includes(pose) && tick % 2 === 1
  const isBlinking = pose === 'wait' ? tick % 2 === 1 : tick % 4 === 3
  body(C.clawd, isTyping ? FLAT_TAP : FLAT_CLAWD, isBlinking)

  switch (pose) {
    case 'think':
      mark(c, x + 12 + (tick % 2), y, '?', C.bubble)
      mark(c, x + 13 - (tick % 2), y + 1, '?', C.bubble)
      break
    case 'wait':
      mark(c, x + 12, y + 1, 'z', C.zz)
      if (tick % 2 === 1) mark(c, x + 13, y, 'Z', C.zz)
      break
    case 'coffee':
      dot(c, x + 14, y + 1, C.cup)
      mark(c, x + 15, y + 1, ')', C.cup)
      mark(c, x + 14 + (tick % 2), y, '~', C.steam)
      break
    case 'phone':
      // The desk phone rings: the handset on the desk, the sound all around it.
      rect(c, x + 14, y + 1, 2, 1, C.phone)
      mark(c, x + 12, y, tick % 2 === 0 ? '))' : ')))', C.mailLit)
      mark(c, x + 12, y + 1, tick % 2 === 0 ? ')' : '))', C.mailLit)
      mark(c, x + 14 + (tick % 2), y - 1, '!!', C.mailLit)
      break
  }
}

export type FlatArt = RoomArt & { clock?: string }

export function flatWidth(perRow: number): number {
  return (FLAT_STATION + 1) * perRow + 1
}

// A wall row, four rows a seat with a floor row between, a bottom wall; the
// larger room view adds a floor row before the bottom.
export function flatHeight(seatCount: number, perRow: number, isLarge = false): number {
  return FLAT_PITCH * Math.max(1, Math.ceil(seatCount / perRow)) + 1 + (isLarge ? 1 : 0)
}

export function paintFlat(art: FlatArt): Flat {
  const perRow = Math.max(1, art.perRow)
  const width = flatWidth(perRow) + (art.cabinet ? FLAT_CABINET : 0)
  const height = flatHeight(art.seats.length, perRow, art.isLarge)
  const c = flat(width, height, C.floorA)

  for (let y = 1; y < height - 1; y++) for (let x = 3; x < width - 1; x += 6) dot(c, x, y, C.floorB)
  rect(c, 0, 0, width, 1, C.wall)
  rect(c, 0, 0, 1, height, C.wallEdge)
  rect(c, width - 1, 0, 1, height, C.wallEdge)
  rect(c, 0, height - 1, width, 1, C.wallEdge)
  rect(c, 2, height - 1, 4, 1, C.door)

  for (let k = 0; k < perRow; k++) {
    const x = 1 + k * (FLAT_STATION + 1) + 2
    rect(c, x, 0, 7, 1, C.glass)
    for (const at of [x, x + 3, x + 6]) dot(c, at, 0, C.frame)
  }
  if (art.cabinet) {
    const x = width - FLAT_CABINET
    const lit = art.cabinet.hasUnread && art.tick % 2 === 0
    rect(c, x + 1, 0, 3, 1, art.cabinet.hasUnread ? (lit ? C.mailLit : C.mail) : C.frame)
    mark(c, x + 2, 0, 'v', C.wallEdge)
    rect(c, x, 2, 4, 1, C.tray)
    for (let k = 0; k < Math.min(3, art.cabinet.papers); k++) mark(c, x + k, 2, '=', C.page)
    if (art.cabinet.papers > 0) dot(c, x + 1, 1, C.page)
    rect(c, x, 3, 4, 1, C.desk)
    rect(c, x, 4, 4, 1, C.cabinet)
    mark(c, x + 1, 4, '--', C.deskLeg)
  }
  if (art.isLarge && art.clock !== undefined && width >= 40) {
    const x = art.cabinet ? width - FLAT_CABINET - 7 : width - 8
    rect(c, x, 0, art.clock.length, 1, C.clockFace)
    mark(c, x, 0, art.clock, C.eye)
  }

  art.seats.forEach((pose, i) => {
    const x = 1 + (i % perRow) * (FLAT_STATION + 1)
    const y = 1 + Math.floor(i / perRow) * FLAT_PITCH
    flatStation(c, x, y, pose, art.tick)
  })

  if (art.isLarge && art.seats.length % perRow !== 0) {
    const x = 1 + (art.seats.length % perRow) * (FLAT_STATION + 1) + 5
    const y = 1 + Math.floor(art.seats.length / perRow) * FLAT_PITCH
    for (const at of [x, x + 2, x + 4]) dot(c, at, y + 1, C.leaf)
    rect(c, x + 1, y + 2, 3, 1, C.leaf)
    rect(c, x + 1, y + 3, 3, 1, C.pot)
  }

  return c
}

// Packs background-only art: a space (or the cue's character) per cell.
export function toFlatCells(c: Flat): Cells {
  const words = new Uint32Array(c.width * c.height * 3)
  for (let i = 0; i < c.width * c.height; i++) {
    words[i * 3] = c.glyph[i]?.charCodeAt(0) ?? 0x20
    words[i * 3 + 1] = c.ink[i] ?? DEFAULT_INK
    words[i * 3 + 2] = c.px[i] ?? 0
  }
  return { columns: c.width, rows: c.height, cells: encode(words) }
}

function encode(words: Uint32Array): string {
  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// What the office lays out by, in terminal cells, for either kind of art.
export type Layout = {
  station: number
  cabinet: number
  width: (perRow: number) => number
  rows: (seats: number, perRow: number, isLarge?: boolean) => number
}

export const LAYOUT: Record<Mode, Layout> = {
  half: { station: STATION, cabinet: CABINET, width: roomWidth, rows: (seats, perRow) => Math.ceil(roomHeight(seats, perRow) / 2) },
  flat: { station: FLAT_STATION, cabinet: FLAT_CABINET, width: flatWidth, rows: flatHeight },
}

export function drawRoom(mode: Mode, art: FlatArt): Cells {
  return mode === 'half' ? toCells(paintRoom(art)) : toFlatCells(paintFlat(art))
}
