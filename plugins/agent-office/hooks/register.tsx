import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { Boss, Consult, Employee, LogLine, Ring, Visitor } from '../types'
import {
  ADVISOR,
  BOSS_NAME,
  BOSS_ROOM,
  LOUNGE,
  VISIT_MS,
  activityFor,
  askedOf,
  clock,
  companyOf,
  consultLine,
  contactFor,
  cols,
  deptFor,
  elapsed,
  farewell,
  fit,
  gist,
  incomingLine,
  internalLine,
  isAddress,
  isAdvisor,
  isEnded,
  nameOf,
  outgoingLine,
  roomsOf,
  senderOf,
  surnameFor,
} from './office'
import type { Person, Room } from './office'
import { LAYOUT, SVG_LIMIT, SVG_PX, drawRoom, modeFor, paintRoom, roomHeight, svgRows, toSvg } from './pixels'
import type { Mode } from './pixels'

const PANE = 'agent-office'
const TITLE = 'エージェント商事'
// Roughly a character cell's width in CSS px on the surfaces that draw Svg.
const SVG_CELL_PX = 8
const PULSE_MS = 700
// How long the 社長's phone rings: a few pulses.
const RING_MS = 4 * PULSE_MS
// How long the 相談役 stays in the room after a consultation.
const VISIT_PULSES_MS = 3 * PULSE_MS

const staff = atom({ plugin: 'agent-office', key: 'staff' } as const, [] as Employee[])
const boss = atom({ plugin: 'agent-office', key: 'boss' } as const, { isWorking: false, since: 0 } as Boss)
const log = atom({ plugin: 'agent-office', key: 'log' } as const, [] as LogLine[])
const tick = atom({ plugin: 'agent-office', key: 'tick' } as const, 0)
const isAutoOpened = atom({ plugin: 'agent-office', key: 'isAutoOpened' } as const, false)
// The room the pane shows; empty for the whole floor.
const view = atom({ plugin: 'agent-office', key: 'view' } as const, '')
const unread = atom({ plugin: 'agent-office', key: 'unread' } as const, 0)
const papers = atom({ plugin: 'agent-office', key: 'papers' } as const, 0)
const ring = atom({ plugin: 'agent-office', key: 'ring' } as const, { company: '', until: 0 } as Ring)
const visitors = atom({ plugin: 'agent-office', key: 'visitors' } as const, [] as Visitor[])
const consults = atom({ plugin: 'agent-office', key: 'consults' } as const, [] as Consult[])

// Texts our own agents just sent each other, so their delivery is not taken for a client's.
const internal: string[] = []

type $ = EngineInterface

async function note($: $, text: string): Promise<void> {
  const at = await $.clock.now()
  await update($, log, lines => [...lines, { at, text }].slice(-40))
}

function hire(info: AgentInfo, index: number, now: number): Employee {
  return {
    id: info.id,
    name: surnameFor(index),
    alias: info.name,
    dept: isAdvisor(info.type, info.name, info.description) ? ADVISOR : deptFor(info.type),
    type: info.type,
    description: info.description,
    status: info.status,
    parentId: info.parentId,
    tools: 0,
    startedAt: now,
    endedAt: isEnded(info.status) ? now : undefined,
  }
}

// Bring the roster in line with the engine's list of agents, and tell what changed.
async function sync($: $): Promise<void> {
  const infos = await $.agent.list()
  const before = await read($, staff)
  const now = await $.clock.now()
  const after: Employee[] = []
  const hired: Employee[] = []
  const left: Employee[] = []

  for (const one of before) {
    const info = infos.find(i => i.id === one.id)
    const status = info?.status ?? (isEnded(one.status) ? one.status : 'completed')
    if (!isEnded(one.status) && isEnded(status)) {
      const gone = { ...one, status, endedAt: now, act: undefined, pose: undefined, detail: undefined }
      left.push(gone)
      after.push(gone)
    } else {
      after.push({ ...one, status, parentId: info?.parentId ?? one.parentId, alias: info?.name ?? one.alias })
    }
  }
  for (const info of infos) {
    if (after.some(one => one.id === info.id)) continue
    const one = hire(info, after.length, now)
    hired.push(one)
    after.push(one)
  }

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    await update($, staff, () => after)
  }
  for (const one of hired) {
    const parent = nameOf(after, one.parentId)
    await note($, `${parent}が${one.name}さん（${one.dept}）に「${one.description}」を依頼`)
  }
  for (const one of left) {
    const text = farewell(one, nameOf(after, one.parentId))
    if (text === undefined) continue
    await note($, text)
    $.ui.toast(text)
  }
  if (hired.length > 0 && !(await read($, isAutoOpened))) {
    await update($, isAutoOpened, () => true)
    void $.ui.open({ id: PANE, title: TITLE })
  }
}

async function pulse($: $): Promise<void> {
  await sync($)
  const now = await $.clock.now()
  const guests = await read($, visitors)
  const leaving = guests.filter(v => now - v.since > VISIT_MS)
  if (leaving.length > 0) {
    await update($, visitors, list => list.filter(v => now - v.since <= VISIT_MS))
    for (const v of leaving) await note($, `${v.company}の方がお帰りになりました`)
  }
  const [list, chief, mail, phone] = [await read($, staff), await read($, boss), await read($, unread), await read($, ring)]
  const counsel = (await read($, consults)).some(c => now - c.at < VISIT_PULSES_MS)
  const isAlive = chief.isWorking || list.some(one => !isEnded(one.status)) || guests.length > 0 || mail > 0 || phone.until > now || counsel
  if (isAlive) {
    await update($, tick, n => (n + 1) % 1000)
  }
}

async function enter($: $, room: string): Promise<void> {
  await update($, view, () => room)
  if (room === BOSS_ROOM) {
    await update($, unread, () => 0)
    await update($, papers, () => 0)
  }
  await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true })
}

async function leave($: $): Promise<void> {
  await update($, view, () => '')
  await $.ui.open({ id: PANE, title: TITLE })
}

// A message from another session reaches the office as a call, a visit, a paper or mail.
async function receive($: $, from: string | undefined, text: string): Promise<void> {
  const company = companyOf(from)
  const contact = contactFor(text)
  const line = incomingLine(contact, company, text)
  await note($, line)
  $.ui.toast(line)
  const now = await $.clock.now()
  switch (contact.kind) {
    case 'phone':
      await update($, ring, () => ({ company, until: now + RING_MS }))
      break
    case 'visit':
      await update($, visitors, list => [...list.filter(v => v.company !== company), { company, reason: contact.reason ?? '', since: now }])
      break
    case 'request':
      await update($, papers, n => n + 1)
      break
    case 'mail':
      await update($, unread, n => n + 1)
      break
  }
}

async function setActivity($: $, agentId: string | undefined, patch: Partial<Employee & Boss>, onlyIf?: string) {
  if (agentId === undefined) {
    await update($, boss, b => (onlyIf !== undefined && b.toolUseId !== onlyIf ? b : { ...b, ...patch }))
    return
  }
  await update($, staff, list =>
    list.map(one =>
      one.id !== agentId || (onlyIf !== undefined && one.toolUseId !== onlyIf) ? one : { ...one, ...patch },
    ),
  )
}

// Half blocks where the terminal draws them itself; background-only cells elsewhere.
async function artMode($: $): Promise<Mode> {
  try {
    return modeFor(await $.env.get('TERM_PROGRAM'), await $.env.get('TERM'))
  } catch {
    return 'flat'
  }
}

async function safely(work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    // The office is a view: losing a frame must never touch the work it watches.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'エージェントたちが働くオフィスを pane で開く',
    })
    $.clock.every(PULSE_MS, () => void safely(() => pulse($)))

    return next(e)
  })

  on('command.run', { command: 'office' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'オフィスを開きました。' }
  })

  on('turn.start', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (agentId === undefined) {
      await safely(async () => {
        const since = await $.clock.now()
        await update($, boss, b => ({ ...b, isWorking: true, since }))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (agentId === undefined) {
      await safely(async () => {
        const since = await $.clock.now()
        await update($, boss, b => ({ ...b, isWorking: false, since, act: undefined, pose: undefined, detail: undefined, toolUseId: undefined }))
      })
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const { act, pose, detail } = activityFor(tool, e)
    const id = e.tool_use_id
    await safely(async () => {
      await setActivity($, e.agentId, { act, pose, detail, toolUseId: id })
      if (e.agentId !== undefined) {
        await update($, staff, list => list.map(one => (one.id === e.agentId ? { ...one, tools: one.tools + 1 } : one)))
      }
    })
    try {
      return await next(e)
    } finally {
      await safely(() =>
        setActivity($, e.agentId, { act: undefined, pose: undefined, detail: undefined, toolUseId: undefined }, id),
      )
    }
  })

  on('session.send', async ($, e, next) => {
    await safely(async () => {
      const list = await read($, staff)
      const isOurs = list.some(one => one.id === e.to || one.alias === e.to)
      if (isOurs || !isAddress(e.to)) {
        internal.push(gist(e.text, 30))
        internal.splice(0, internal.length - 20)
        const to = list.find(one => one.id === e.to || one.alias === e.to)
        const isOrder = to !== undefined && to.parentId === e.agentId
        await note($, internalLine(nameOf(list, e.agentId), nameOf(list, e.to), isOrder))
        return
      }
      const company = companyOf(e.to)
      await note($, outgoingLine(contactFor(e.text), nameOf(list, e.agentId), company, e.text))
      await update($, visitors, guests => guests.filter(v => v.company !== company && v.company !== companyOf(undefined)))
    })

    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    await safely(async () => {
      const origin = e.origin as { kind: string; teammate?: string }
      const isPeer = origin.kind === 'peer-send-message' || (origin.kind === 'peer' && origin.teammate === undefined)
      const body = gist(e.text, 30)
      if (!isPeer || e.agentId !== undefined || internal.some(sent => body.includes(sent.replace(/\.\.\.$/, '')))) return
      await receive($, senderOf(e.text), e.text)
    })

    return next(e)
  })

  // The advisor runs inside the API request: it shows only in the step's result.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    await safely(async () => {
      const uses = (result?.serverToolUses ?? []).filter(use => use.name === 'advisor')
      if (uses.length === 0) return
      const list = await read($, staff)
      const one = list.find(o => o.id === e.agentId)
      const who = nameOf(list, e.agentId)
      const at = await $.clock.now()
      for (const use of uses) {
        const seconds = Math.max(0, Math.round(((use.endedAt ?? use.startedAt) - use.startedAt) / 1000))
        const asked = askedOf(use.input)
        await update($, consults, all =>
          [...all, { who, room: one?.dept ?? BOSS_ROOM, seconds, asked, at }].slice(-20),
        )
        await note($, consultLine(who, seconds, asked))
      }
    })

    return result
  })

  // Escape in a room steps back to the floor instead of closing the pane.
  on('ui.close', async ($, e, next) => {
    let isBack = false
    await safely(async () => {
      if (e.id === PANE && e.origin.kind === 'person' && (await read($, view)) !== '') {
        await leave($)
        isBack = true
      }
    })

    return isBack ? { value: undefined } : next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const [list, chief, lines, n, shown, mail, paper, phone, guests, talks] = [
      await read($, staff),
      await read($, boss),
      await read($, log),
      await read($, tick),
      await read($, view),
      await read($, unread),
      await read($, papers),
      await read($, ring),
      await read($, visitors),
      await read($, consults),
    ]
    const now = await $.clock.now()
    // Off the terminal the room is an Svg drawn from the half-mode canvas, so it
    // lays out by the half-mode columns.
    const isTerminal = e.surface === 'terminal'
    const mode: Mode = isTerminal ? await artMode($) : 'half'
    const layout = LAYOUT[mode]
    const width = Math.max(20, e.props.bodyColumns)
    // Pictures where the surface draws them and one room fits; text alone elsewhere.
    const Raster = isTerminal && 'Raster' in table && layout.width(1) <= width ? table.Raster : undefined
    const Svg = !isTerminal && 'Svg' in table && layout.width(1) * SVG_PX <= width * SVG_CELL_PX ? table.Svg : undefined
    const hasPicture = Raster !== undefined || Svg !== undefined
    // Rows a room's picture takes among the text lines.
    const rowsOf = (seats: number, perRow: number, isLarge = false) =>
      Raster !== undefined ? layout.rows(seats, perRow, isLarge) : Svg !== undefined ? svgRows(roomHeight(seats, perRow)) : 0
    const rows = e.viewport?.rows ?? 30
    const active = list.filter(one => !isEnded(one.status))
    const isRinging = phone.until > now
    const chiefPerson: Person = {
      name: `${BOSS_NAME}（メインセッション）`,
      short: BOSS_NAME,
      sub: 'あなた直属',
      since: chief.since || now,
      ...(isRinging
        ? { act: `${phone.company}から電話`, pose: 'phone' as const }
        : chief.act !== undefined && chief.pose !== undefined
          ? { act: chief.act, pose: chief.pose }
          : chief.isWorking
            ? { act: '考え中', pose: 'think' as const }
            : { act: 'あなたの指示待ち', pose: 'coffee' as const }),
      detail: chief.detail,
    }
    const rooms = roomsOf(list, chiefPerson, guests, talks.filter(c => now - c.at < VISIT_PULSES_MS))
    const colorOf = (p: Person) =>
      p.pose === 'coffee' ? 'yellow' : p.pose === 'wait' ? 'magenta' : p.pose === 'think' ? 'cyan' : p.pose === 'guest' ? 'blue' : p.pose === 'elder' ? 'white' : 'green'
    const cabinetOf = (room: Room, room_width: number) =>
      room.name === BOSS_ROOM && room_width >= layout.width(1) + layout.cabinet ? { hasUnread: mail > 0, papers: paper } : undefined
    // Everyone not yet gone counts, whatever they are doing; n/m only once someone left.
    const headcount = (room: Room) => {
      if (room.name === LOUNGE) return `来客 ${room.people.length}名`
      const here = room.people.filter(p => !p.isVisitor).length
      const all = here + room.left.length
      const isCalled = room.people.some(p => p.isVisitor && p.pose === 'elder')
      return `${room.left.length > 0 ? `${here}/${all}` : here}名${isCalled ? `・${ADVISOR} 来訪中` : ''}`
    }
    // Staff first, then whoever is visiting, each in the color of what they do.
    const byRole = (room: Room) => [...room.people.filter(p => !p.isVisitor), ...room.people.filter(p => p.isVisitor)]

    const picture = (room: Room, key: string, seats: Person['pose'][], perRow: number, isLarge: boolean) => {
      const cabinet = cabinetOf(room, width)
      if (Raster !== undefined) {
        const art = drawRoom(mode, { seats, perRow, tick: n, isLarge, cabinet, clock: clock(now) })
        return <Raster key={key} columns={art.columns} rows={art.rows} cells={art.cells} />
      }
      if (Svg === undefined) return undefined
      const art = toSvg(paintRoom({ seats, perRow, tick: n, isLarge, cabinet }))
      if (art.source.length > SVG_LIMIT) return undefined
      return <Svg key={key} source={art.source} alt={`${room.name}の様子（${headcount(room)}）`} width={art.width} height={art.height} />
    }

    const person = (p: Person, room: number) => {
      const title = fit(p.name, room)
      const rest = room - cols(title) - 1
      return (
        <Box flexDirection="column">
          <Text>
            <Text bold>{title}</Text>
            {rest >= 2 && <Text dimColor> {fit(`${p.sub}・${elapsed(p.since, now)}`, rest)}</Text>}
          </Text>
          <Text color={colorOf(p)}>{fit(`  ${p.act}`, room)}</Text>
          {p.detail !== undefined && p.detail !== '' && <Text dimColor>{fit(`  ${p.detail}`, room)}</Text>}
        </Box>
      )
    }

    const logLines = (picked: LogLine[], room: number) =>
      picked.slice(-Math.max(3, room)).map(line => <Text dimColor>{fit(`  ${clock(line.at)} ${line.text}`, width)}</Text>)

    const room = rooms.find(r => r.name === shown)
    if (shown !== '' && room !== undefined) {
      const seats: Person['pose'][] = [...room.people.map(p => p.pose), ...room.left.map(() => 'empty' as const)]
      const cap = Math.max(1, Math.floor((width - 1 - (room.name === BOSS_ROOM ? layout.cabinet : 0)) / (layout.station + 1)))
      // One slot more than the seats, for the plant and some air.
      const perRow = Math.min(seats.length + 1, cap)
      const height = rowsOf(seats.length, perRow, true)
      const mine = lines.filter(line => room.tokens.some(token => line.text.includes(token)))
      const asks = talks.filter(c => c.room === room.name).slice(-3)
      const used = 2 + height + (asks.length > 0 ? asks.length + 1 : 0) + room.people.reduce((sum, p) => sum + (p.detail ? 3 : 2), 0) + room.left.length + 1
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Button key="back" label="戻る" hotkey="b" plain onPress={() => leave($)} />
            <Text dimColor>{fit(`  ${room.name}・${headcount(room)}`, width - 8)}</Text>
          </Box>
          {picture(room, 'room', seats, perRow, true)}
          {byRole(room).map(p => person(p, width))}
          {room.left.map(one => (
            <Text dimColor>{fit(`${one.name}さん ${farewellWord(one.status)}・${elapsed(one.startedAt, one.endedAt ?? now)}`, width)}</Text>
          ))}
          {asks.length > 0 && <Text bold>{fit(`${ADVISOR}への相談`, width)}</Text>}
          {asks.map(c => (
            <Text dimColor>{fit(`  ${clock(c.at)} ${c.who}・${c.seconds}秒${c.asked === '' ? '' : `：${c.asked}`}`, width)}</Text>
          ))}
          <Text bold>{fit(`社内ログ（${room.name}）`, width)}</Text>
          {mine.length === 0 && <Text dimColor>{fit('  まだ何も起きていません', width)}</Text>}
          {logLines(mine, rows - used - 2)}
        </Box>
      )
    }

    // The floor: each room a block of its picture, its label and one line per
    // person, wrapped into rows that fit the pane with blank space between.
    const GAP = 2
    const floor = rooms.filter(r => r.people.length > 0)
    const cap = Math.max(1, Math.floor((width - 1) / (layout.station + 1)))
    const tiles = floor.map((r, i) => {
      const perRow = Math.min(r.people.length, cap, 3)
      const extra = cabinetOf(r, width) ? layout.cabinet : 0
      const tileWidth = hasPicture ? Math.min(width, layout.width(perRow) + extra) : width
      const height = rowsOf(r.people.length, perRow)
      const label = fit(r.name === BOSS_ROOM && (mail > 0 || paper > 0) ? `${r.name} *` : r.name, tileWidth - 3)
      const rest = tileWidth - 3 - cols(label) - 2
      return {
        width: tileWidth,
        height: height + 1 + r.people.length,
        node: (gap: number) => (
          <Box flexDirection="column" width={tileWidth} marginLeft={gap}>
            {picture(r, `floor-${i}`, r.people.map(p => p.pose), perRow, false)}
            <Box flexDirection="row">
              <Button key={`room-${i}`} label={label} hotkey={i < 9 ? String(i + 1) : undefined} plain onPress={() => enter($, r.name)} />
              {rest >= 4 && <Text dimColor>{`  ${fit(headcount(r), rest)}`}</Text>}
            </Box>
            {byRole(r).map(p => (
              <Text color={colorOf(p)}>{fit(`${p.short ?? p.name}：${p.act}`, tileWidth)}</Text>
            ))}
          </Box>
        ),
      }
    })
    const grid: (typeof tiles)[] = []
    for (const tile of tiles) {
      const last = grid[grid.length - 1]
      const used = last?.reduce((sum, t) => sum + t.width + GAP, 0) ?? 0
      if (last !== undefined && used + tile.width <= width) last.push(tile)
      else grid.push([tile])
    }
    const blocks = grid.reduce((sum, row) => sum + Math.max(...row.map(t => t.height)), 0) + grid.length - 1
    const used = 2 + blocks + 2

    return (
      <Box flexDirection="column">
        <Text dimColor>{fit(`本日の出勤 ${list.length + 1}名・勤務中 ${active.length + 1}名`, width)}</Text>
        <Text> </Text>
        {grid.map((row, k) => (
          <Box flexDirection="row" marginTop={k === 0 ? 0 : 1}>
            {row.map((t, j) => t.node(j === 0 ? 0 : GAP))}
          </Box>
        ))}
        <Text> </Text>
        <Text bold>社内ログ</Text>
        {lines.length === 0 && <Text dimColor>{fit('  まだ何も起きていません', width)}</Text>}
        {logLines(lines, rows - used - 2)}
      </Box>
    )
  })
}

function farewellWord(status: string): string {
  return status === 'completed' ? '退勤' : status === 'failed' ? '早退' : '異動'
}
