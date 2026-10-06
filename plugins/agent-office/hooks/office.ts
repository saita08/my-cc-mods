import type { Consult, Employee, Pose, Visitor } from '../types'
import type { Seat } from './pixels'

export const BOSS_NAME = '社長'
export const BOSS_ROOM = '社長室'
export const LOUNGE = '応接室'
export const ADVISOR = '相談役'
// A visitor leaves after this long, or once someone writes back to their company.
export const VISIT_MS = 120_000

const SURNAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '斎藤',
]

export const ENDED = ['completed', 'failed', 'killed']

export function isEnded(status: string): boolean {
  return ENDED.includes(status)
}

// The n-th hire gets the n-th surname; past the list, a number keeps names apart.
export function surnameFor(index: number): string {
  const base = SURNAMES[index % SURNAMES.length] ?? '社員'
  const round = Math.floor(index / SURNAMES.length)
  return round === 0 ? base : `${base}${round + 1}`
}

export function deptFor(type: string): string {
  const lower = type.toLowerCase()
  if (lower === 'explore') return '調査部'
  if (lower === 'plan') return '企画部'
  if (lower === 'general-purpose') return '総務部'
  if (lower === 'teammate') return 'プロジェクト室'
  if (lower.includes('review')) return '品質管理部'
  if (lower.includes('guide')) return '受付'
  return `${type.split(':').pop() ?? type}課`
}

// An agent hired to give counsel works in the 相談役 seat, whatever its type.
export function isAdvisor(...texts: (string | undefined)[]): boolean {
  return texts.some(text => text !== undefined && /相談役|advisor|consult/i.test(text))
}

// What the advisor was asked: the input itself, or its question-like field.
export function askedOf(input: unknown): string {
  if (typeof input === 'string') return gist(input)
  for (const key of ['question', 'prompt', 'query', 'message', 'text', 'content']) {
    const value = pick(input, key)
    if (value !== undefined) return gist(value)
  }
  return ''
}

export function consultLine(who: string, seconds: number, asked: string): string {
  return `${who}が${ADVISOR}に相談（${seconds}秒）${asked === '' ? '' : `：「${asked}」`}`
}

export type Activity = { act: string; pose: Pose; detail?: string }

function pick(input: unknown, key: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

function short(text: string | undefined, max = 60): string | undefined {
  if (text === undefined) return undefined
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 3)}${ELLIPSIS}` : line
}

function base(path: string | undefined): string | undefined {
  return path?.split('/').filter(Boolean).pop()
}

export function activityFor(tool: string, input: unknown): Activity {
  switch (tool) {
    case 'Read':
      return { act: '資料を読んでいる', pose: 'read', detail: base(pick(input, 'file_path')) }
    case 'Grep':
    case 'Glob':
      return { act: '書庫で探し物', pose: 'search', detail: short(pick(input, 'pattern')) }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return {
        act: '書類を作成中',
        pose: 'write',
        detail: base(pick(input, 'file_path') ?? pick(input, 'notebook_path')),
      }
    case 'Bash':
      return {
        act: '端末をカタカタ',
        pose: 'type',
        detail: short(pick(input, 'description') ?? pick(input, 'command')),
      }
    case 'WebFetch':
    case 'WebSearch':
      return { act: '外回り中', pose: 'out', detail: short(pick(input, 'query') ?? pick(input, 'url')) }
    case 'Agent':
      return { act: '部下に仕事を振っている', pose: 'delegate', detail: short(pick(input, 'description')) }
    case 'SendMessage':
      return { act: '社内チャットで連絡中', pose: 'phone', detail: short(pick(input, 'to')) }
    case 'AskUserQuestion':
      return { act: 'お客様に確認中', pose: 'phone' }
    case 'Skill':
      return { act: 'マニュアルを開いている', pose: 'read', detail: short(pick(input, 'skill')) }
    default:
      if (tool.startsWith('mcp__')) {
        return { act: '取引先とやりとり', pose: 'phone', detail: tool.split('__').slice(1).join(' / ') }
      }
      return { act: `${tool} を使っている`, pose: 'type' }
  }
}

export function idleActivity(status: string): Activity {
  switch (status) {
    case 'pending':
      return { act: '出社準備中', pose: 'wait' }
    case 'running':
      return { act: '考え中', pose: 'think' }
    case 'waiting':
      return { act: '承認待ち', pose: 'wait' }
    case 'idle':
      return { act: '休憩中（コーヒー）', pose: 'coffee' }
    case 'completed':
      return { act: '退勤', pose: 'gone' }
    case 'failed':
      return { act: '早退', pose: 'gone' }
    case 'killed':
      return { act: '異動', pose: 'gone' }
    default:
      return { act: status, pose: 'think' }
  }
}

// Characters whose width the Unicode tables leave to the terminal. Apple
// Terminal draws them two columns wide while the renderer counts one, so the
// office spells the common ones in ASCII and counts the rest as two.
const PLAIN: [RegExp, string][] = [
  [/[\u2026\u22ef]/g, '...'],
  [/\u2025/g, '..'],
  [/[\u2018\u2019\u2032]/g, "'"],
  [/[\u201c\u201d\u2033]/g, '"'],
  [/[\u2010-\u2015]/g, '-'],
  [/\u2192/g, '->'],
  [/\u2190/g, '<-'],
  [/\u00d7/g, 'x'],
]

export const ELLIPSIS = '...'

export function plain(text: string): string {
  return PLAIN.reduce((out, [from, to]) => out.replace(from, to), text)
}

function isAmbiguous(c: number): boolean {
  return (
    (c >= 0xa1 && c <= 0xbf) ||
    c === 0xd7 ||
    c === 0xf7 ||
    (c >= 0x391 && c <= 0x3c9) ||
    (c >= 0x401 && c <= 0x451) ||
    (c >= 0x2010 && c <= 0x203e) ||
    (c >= 0x2070 && c <= 0x20ac) ||
    (c >= 0x2100 && c <= 0x23ff) ||
    (c >= 0x2460 && c <= 0x27bf) ||
    (c >= 0x2b00 && c <= 0x2bff) ||
    (c >= 0xe000 && c <= 0xf8ff) ||
    c === 0xfffd
  )
}

// Terminal columns: CJK, fullwidth forms and ambiguous characters take two.
export function cols(text: string): number {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      c >= 0x1f000 ||
      isAmbiguous(c)
    n += wide ? 2 : 1
  }
  return n
}

// Cut to `room` columns in plain characters, an ASCII ellipsis marking the cut.
export function fit(text: string, room: number): string {
  const line = plain(text)
  if (cols(line) <= room) return line
  if (room < ELLIPSIS.length) return ''
  let out = ''
  for (const ch of line) {
    if (cols(out + ch) + ELLIPSIS.length > room) break
    out += ch
  }
  return `${out}${ELLIPSIS}`
}

export type Contact = { kind: 'phone' | 'visit' | 'request' | 'mail'; reason?: string }

const URGENT = /至急|急ぎ|今すぐ|止めて|中止|\burgent\b|\basap\b|\bstop\b/i
const MEETING: [string, string][] = [
  ['引き継ぎ', '引き継ぎ'],
  ['handover', '引き継ぎ'],
  ['相談', '相談'],
  ['打ち合わせ', '打ち合わせ'],
]
const ASKING = /してください|お願いします|\bplease\b|\bcan you\b/i

// How a message from another session arrives at the office, by what it says:
// urgent or a short question rings, a long talk or a meeting visits, a request
// comes as a paper, the rest as mail.
export function contactFor(text: string): Contact {
  const body = text.replace(/<[^>]+>/g, ' ').trim()
  const lower = body.toLowerCase()
  const isQuestion = body.length <= 80 && /(\?|？|ですか|ますか)$/.test(body)
  if (URGENT.test(body) || isQuestion) return { kind: 'phone' }
  const meeting = MEETING.find(([word]) => lower.includes(word))
  if (meeting) return { kind: 'visit', reason: meeting[1] }
  if (body.length > 400) return { kind: 'visit', reason: 'ご説明' }
  if (ASKING.test(body)) return { kind: 'request' }
  return { kind: 'mail' }
}

// An address names another session when it carries a scheme (`uds:`, `bridge:`).
export function isAddress(to: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(to)
}

// A client company named after the session's address: its last path part, short.
export function companyOf(address: string | undefined): string {
  if (address === undefined || address === '') return '取引先'
  const last = address.replace(/^[a-z][a-z0-9+.-]*:/i, '').split('/').filter(Boolean).pop() ?? address
  return `${last.replace(/\.sock$/, '').slice(0, 16)} 社`
}

// The sender's address, when the delivery's envelope carries one.
export function senderOf(text: string): string | undefined {
  return /from="([^"]+)"/.exec(text)?.[1]
}

export function gist(text: string, max = 40): string {
  const line = plain(text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  return line.length > max ? `${line.slice(0, max - 3)}${ELLIPSIS}` : line
}

// Between our own people the body stays out of the log: who told whom is enough.
export function internalLine(from: string, to: string, isOrder: boolean): string {
  return isOrder ? `${from}が${to}に追加の指示` : `${from}から${to}に連絡`
}

export function incomingLine(contact: Contact, company: string, text: string): string {
  switch (contact.kind) {
    case 'phone':
      return `${company}から電話：「${gist(text)}」`
    case 'visit':
      return `${company}の方が来社（${contact.reason}）`
    case 'request':
      return `${company}から依頼書：「${gist(text)}」`
    case 'mail':
      return `${company}からメール：「${gist(text)}」`
  }
}

export function outgoingLine(contact: Contact, sender: string, company: string, text: string): string {
  switch (contact.kind) {
    case 'phone':
      return `${sender}が${company}に電話：「${gist(text)}」`
    case 'visit':
      return `${sender}が${company}を訪問（${contact.reason}）`
    case 'request':
      return `${sender}が${company}に依頼書を送付：「${gist(text)}」`
    case 'mail':
      return `${sender}が${company}にメール送信：「${gist(text)}」`
  }
}

export function nameOf(staff: Employee[], id: string | undefined): string {
  if (id === undefined) return BOSS_NAME
  const one = staff.find(e => e.id === id || e.alias === id)
  return one ? `${one.name}さん` : id
}

export function farewell(one: Employee, boss: string): string | undefined {
  switch (one.status) {
    case 'completed':
      return `${one.name}さん（${one.dept}）が${boss}に報告書を提出して退勤しました`
    case 'failed':
      return `${one.name}さん（${one.dept}）が体調不良で早退しました`
    case 'killed':
      return `${one.name}さん（${one.dept}）が異動になりました`
    default:
      return undefined
  }
}

export function elapsed(from: number, to: number): string {
  const s = Math.max(0, Math.floor((to - from) / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}分${String(s % 60).padStart(2, '0')}秒` : `${s}秒`
}

export function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Bosses before subordinates: each employee follows the one who hired them.
export function orgOrder(staff: Employee[]): { one: Employee; depth: number }[] {
  const ids = new Set(staff.map(e => e.id))
  const out: { one: Employee; depth: number }[] = []
  const walk = (parent: string | undefined, depth: number) => {
    for (const one of staff) {
      const p = one.parentId !== undefined && ids.has(one.parentId) ? one.parentId : undefined
      if (p === parent) {
        out.push({ one, depth })
        walk(one.id, depth + 1)
      }
    }
  }
  walk(undefined, 1)
  return out
}

// A visitor (a client, a calling 相談役) is shown apart from the staff and not counted as one;
// `short` is the name the floor uses where the full one does not fit.
export type Person = { name: string; sub: string; since: number; act: string; pose: Seat; detail?: string; isVisitor?: boolean; short?: string }

export type Room = {
  name: string
  people: Person[]
  // Those who already left: empty desks in the room view.
  left: Employee[]
  // What the room's log lines mention.
  tokens: string[]
}

function personOf(one: Employee): Person {
  const a = one.act !== undefined && one.pose !== undefined ? { act: one.act, pose: one.pose } : idleActivity(one.status)
  const pose = one.dept === ADVISOR ? 'elder' : a.pose
  return { name: `${one.name}さん`, sub: one.dept, since: one.startedAt, act: a.act, pose, detail: one.detail ?? one.description }
}

// The floor: the 社長室, the 応接室 while a visitor waits, then one room per
// department in the order people were hired; a room nobody works in is kept for its empty desks.
// `visits` are the consultations whose 相談役 still sits in the consulter's room.
export function roomsOf(staff: Employee[], chief: Person, visitors: Visitor[], visits: Consult[] = []): Room[] {
  const rooms: Room[] = [{ name: BOSS_ROOM, people: [chief], left: [], tokens: [BOSS_NAME, ' 社'] }]
  if (visitors.length > 0) {
    rooms.push({
      name: LOUNGE,
      people: visitors.map(v => ({ name: `${v.company}の方`, sub: '来客', since: v.since, act: `${v.reason}で来社`, pose: 'guest', isVisitor: true })),
      left: [],
      tokens: visitors.map(v => v.company),
    })
  }
  for (const { one } of orgOrder(staff)) {
    let room = rooms.find(r => r.name === one.dept)
    if (room === undefined) {
      room = { name: one.dept, people: [], left: [], tokens: [] }
      rooms.push(room)
    }
    room.tokens.push(`${one.name}さん`)
    if (isEnded(one.status)) room.left.push(one)
    else room.people.push(personOf(one))
  }
  for (const visit of visits) {
    const room = rooms.find(r => r.name === visit.room)
    if (room === undefined || room.people.some(p => p.name === ADVISOR)) continue
    room.people.push({ name: ADVISOR, sub: `${visit.who}の相談`, since: visit.at, act: '相談に乗っている', pose: 'elder', detail: visit.asked, isVisitor: true })
    room.tokens.push(ADVISOR)
  }
  return rooms
}
