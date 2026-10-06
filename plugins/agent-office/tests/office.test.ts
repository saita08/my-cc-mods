import type { AgentInfo, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import type { Employee } from '../types'
import {
  activityFor,
  askedOf,
  cols,
  companyOf,
  consultLine,
  contactFor,
  deptFor,
  farewell,
  fit,
  internalLine,
  plain,
  isAdvisor,
  orgOrder,
  roomsOf,
  surnameFor,
} from '../hooks/office'
import type { Person } from '../hooks/office'
import { LAYOUT, modeFor, paintFlat, paintRoom, roomWidth, toCells, toFlatCells } from '../hooks/pixels'

const PANE = {
  component: 'Pane',
  requestId: 'agent-office',
  props: {
    title: 'エージェント商事',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const CLAWD = 0xd77757
const EYE = 0x1a1a1a
const SOCK = 'uds:/tmp/cc-socks/42557.sock'

function employee(id: string, parentId?: string): Employee {
  return { id, name: id, dept: '総務部', type: 'general-purpose', description: '', status: 'running', parentId, tools: 0, startedAt: 0 }
}

// The world beneath the office: a clock that moves only when told, and a
// surface that places panes and shows toasts.
function world(on: On, agents: AgentInfo[] = []) {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: agents }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  mock.env(on, { TERM_PROGRAM: 'Apple_Terminal' })
  return mock.clock(on, { now: 1_000_000 })
}

const chief: Person = { name: '社長', sub: '', since: 0, act: '考え中', pose: 'think' }

describe('仕事の見せ方', () => {
  test('道具ごとに仕事の名前とポーズが決まる', async () => {
    expect(activityFor('Read', { file_path: '/a/b/plan.md' })).toEqual({ act: '資料を読んでいる', pose: 'read', detail: 'plan.md' })
    expect(activityFor('Agent', { description: '調査して' }).pose).toBe('delegate')
    expect(activityFor('mcp__slack__send', {}).act).toBe('取引先とやりとり')
    expect(activityFor('Unknown', {}).act).toBe('Unknown を使っている')
  })

  test('部署と名前と退勤の知らせ', async () => {
    expect(deptFor('Explore')).toBe('調査部')
    expect(deptFor('pr-review-toolkit:code-reviewer')).toBe('品質管理部')
    expect(surnameFor(0)).toBe('佐藤')
    expect(surnameFor(20)).toBe('佐藤2')
    expect(farewell({ ...employee('佐藤'), status: 'completed' }, '社長')).toContain('報告書を提出')
  })

  test('部下は上司のすぐ後ろに一段下げて並ぶ', async () => {
    const order = orgOrder([employee('a'), employee('b'), employee('c', 'a')])
    expect(order.map(o => [o.one.id, o.depth])).toEqual([['a', 1], ['c', 2], ['b', 1]])
  })

  test('幅は全角を二桁と数える', async () => {
    expect(cols('社長（メイン）')).toBe(14)
    expect(fit('社長（メインセッション）', 10)).toBe('社長（...')
  })

  test('幅の曖昧な文字は二桁と数え、よく出るものは ASCII に直す', async () => {
    expect(cols('\u2026')).toBe(2)
    expect(cols('\u2192\u00d7\u03b1')).toBe(6)
    expect(cols('「・」')).toBe(6)
    expect(plain('a\u2026 \u2192 \u201cb\u201d \u2014')).toBe('a... -> "b" -')
    for (const room of [5, 12, 30]) {
      const line = fit('社長 \u2192 佐藤さん：「New direction from the user\u2026」（総務部）', room)
      expect(cols(line)).toBeLessThanOrEqual(room)
      expect(line).not.toMatch(/[\u2026\u2192]/)
    }
  })
})

describe('取引先からの連絡', () => {
  const cases: [string, string, string, string?][] = [
    ['至急', '至急、デプロイを止めてください', 'phone'],
    ['短い質問', 'テストは通りましたか？', 'phone'],
    ['英語の stop', 'Can you stop the deploy now', 'phone'],
    ['急ぎは来客より先', '相談です。急ぎでお願いします', 'phone'],
    ['引き継ぎ', '引き継ぎの資料をお渡しします。', 'visit', '引き継ぎ'],
    ['handover', 'handover notes for the release', 'visit', '引き継ぎ'],
    ['来客は依頼より先', '打ち合わせをお願いします。', 'visit', '打ち合わせ'],
    ['長い話', 'あ'.repeat(401), 'visit', 'ご説明'],
    ['長い問いは電話でない', `${'い'.repeat(90)}ですか`, 'mail'],
    ['依頼', 'レビューをお願いします。', 'request'],
    ['please', 'please review the diff', 'request'],
    ['ただの報告', '進捗です。テストは全部通りました。', 'mail'],
    ['nonstop は stop でない', 'nonstop build finished', 'mail'],
  ]

  test('中身で電話・来客・依頼書・メールに分かれ、この順に優先する', async () => {
    for (const [name, text, kind, reason] of cases) {
      const got = contactFor(text)
      expect([name, got.kind]).toEqual([name, kind])
      if (reason !== undefined) expect(got.reason).toBe(reason)
    }
  })

  test('取引先の名前はアドレスの末尾から', async () => {
    expect(companyOf(SOCK)).toBe('42557 社')
    expect(companyOf(undefined)).toBe('取引先')
  })

  test('こちらからの連絡は取引先へのメールとして残る', async ($, on) => {
    world(on)
    on('session.send', () => ({ isDelivered: true }))
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await $.session.send({ to: SOCK, text: '本日の作業が終わりました。', origin: { kind: 'model' } })
    expect(await ui.find({ type: 'Text', text: /社長が42557 社にメール送信/ })).toBeDefined()
    await ui.unmount()
  })

  test('取引先からの引き継ぎで応接室に来客があり、2分で帰る', async ($, on) => {
    const clock = world(on)
    on('session.receive', (_$, e) => ({ text: e.text }))
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await $.session.receive({ origin: { kind: 'peer-send-message' }, text: `<cross-session-message from="${SOCK}">引き継ぎをお願いします</cross-session-message>` })
    expect(await ui.find({ type: 'Text', text: /42557 社の方が来社（引き継ぎ）/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /応接室/ })).toBeDefined()
    await clock.advance(121_000)
    expect(await ui.find({ type: 'Button', text: /応接室/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /お帰りになりました/ })).toBeDefined()
    await ui.unmount()
  })

  test('取引先からのメールは社長室のランプを灯し、社長室を開くと消える', async ($, on) => {
    world(on)
    on('session.receive', (_$, e) => ({ text: e.text }))
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await $.session.receive({ origin: { kind: 'peer-send-message' }, text: '本日の進捗です。' })
    expect(await ui.find({ type: 'Text', text: /取引先からメール/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /社長室 \*/ })).toBeDefined()
    await ui.press({ key: 'room-0' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Button', text: /社長室 \*/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('社内の連絡', () => {
  test('部下への連絡は本文を残さず、追加の指示として記す', async () => {
    expect(internalLine('社長', '佐藤さん', true)).toBe('社長が佐藤さんに追加の指示')
    expect(internalLine('佐藤さん', '社長', false)).toBe('佐藤さんから社長に連絡')
  })

  test('社長から部下への SendMessage は本文なしで記録される', async ($, on) => {
    const clock = world(on, [{ id: 'a', name: 'scout', description: '', type: 'general-purpose', status: 'running' } as AgentInfo])
    on('session.send', () => ({ isDelivered: true }))
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(700)
    await $.session.send({ to: 'a', text: 'New direction from the user: redesign the pane', origin: { kind: 'model' } })
    expect(await ui.find({ type: 'Text', text: /社長が佐藤さんに追加の指示$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /New direction/ })).toBeUndefined()
    await ui.unmount()
  })
})

describe('相談役', () => {
  test('相談の中身と、相談役として雇われたエージェント', async () => {
    expect(askedOf({ question: 'この設計で良いか' })).toBe('この設計で良いか')
    expect(askedOf(42)).toBe('')
    expect(consultLine('社長', 12, '設計')).toBe('社長が相談役に相談（12秒）：「設計」')
    expect(isAdvisor('general-purpose', undefined, 'consult on the plan')).toBe(true)
    expect(isAdvisor('Explore', 'scout', '調べる')).toBe(false)
    const rooms = roomsOf([{ ...employee('林'), dept: '相談役' }], chief, [])
    expect(rooms.find(r => r.name === '相談役')?.people[0]?.pose).toBe('elder')
  })

  test('advisor を使った step のあと、相談役が社長室に来る', async ($, on) => {
    world(on)
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        serverToolUses: [{ id: 's1', name: 'advisor', input: { question: '設計を見てほしい' }, startedAt: 1000, endedAt: 13_000 }],
        stopReason: 'end_turn',
        usage: null,
      }
    })
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'm', messageCount: 1 })
    for await (const _ of stream) void _
    expect(await ui.find({ type: 'Text', text: /社長が相談役に相談（12秒）：「設計を見てほしい」/ })).toBeDefined()
    await ui.press({ key: 'room-0' })
    expect(await ui.find({ type: 'Text', text: /相談に乗っている/ })).toBeDefined()
    await ui.unmount()
  })
})

describe('部屋の絵', () => {
  const count = (px: number[], color: number) => px.filter(p => p === color).length

  test('Clawd はオレンジの体に黒い目が二つ、ポーズごとに絵が変わる', async () => {
    const one = paintRoom({ seats: ['type'], perRow: 1, tick: 0 })
    expect(count(one.px, CLAWD)).toBeGreaterThan(30)
    expect(count(one.px, EYE)).toBe(2)
    const poses = ['type', 'read', 'think', 'coffee', 'wait', 'phone', 'out', 'delegate'] as const
    const pictures = poses.map(pose => paintRoom({ seats: [pose], perRow: 1, tick: 0 }).px.join(','))
    expect(new Set(pictures).size).toBe(poses.length)
    expect(paintRoom({ seats: ['type'], perRow: 1, tick: 0 }).px).not.toEqual(paintRoom({ seats: ['type'], perRow: 1, tick: 1 }).px)
  })

  test('来客と相談役は社員のオレンジで描かない', async () => {
    expect(count(paintRoom({ seats: ['guest'], perRow: 1, tick: 0 }).px, CLAWD)).toBe(0)
    expect(count(paintRoom({ seats: ['elder'], perRow: 1, tick: 0 }).px, CLAWD)).toBe(0)
  })

  test('社長室の書類受けに依頼書が積まれる', async () => {
    const empty = paintRoom({ seats: ['think'], perRow: 1, tick: 0, cabinet: { hasUnread: false, papers: 0 } })
    const full = paintRoom({ seats: ['think'], perRow: 1, tick: 0, cabinet: { hasUnread: false, papers: 2 } })
    expect(full.px).not.toEqual(empty.px)
  })

  test('Raster のセルは列×行の三語ずつ', async () => {
    const art = toCells(paintRoom({ seats: ['type', 'wait', 'empty'], perRow: 2, tick: 0 }))
    expect(art.columns).toBe(roomWidth(2))
    expect(atob(art.cells).length).toBe(art.columns * art.rows * 12)
  })
})

describe('背景色だけの絵', () => {
  const count = (px: number[], color: number) => px.filter(p => p === color).length
  const marks = (glyph: (string | undefined)[]) => glyph.filter(g => g !== undefined).length

  test('ブロック文字を自分で描く端末だけ半ブロック、ほかは背景色だけ', async () => {
    expect(modeFor('Apple_Terminal', 'xterm-256color')).toBe('flat')
    expect(modeFor(undefined, undefined)).toBe('flat')
    expect(modeFor('tmux', 'screen')).toBe('flat')
    for (const program of ['ghostty', 'iTerm.app', 'WezTerm']) expect(modeFor(program, 'xterm-256color')).toBe('half')
    expect(modeFor(undefined, 'xterm-kitty')).toBe('half')
  })

  test('Clawd は幅広の体と目が二つ、フロアの部屋は 6 行、部屋の画面は 7 行', async () => {
    const one = paintFlat({ seats: ['type'], perRow: 1, tick: 0 })
    expect(count(one.px, CLAWD)).toBeGreaterThan(25)
    expect(count(one.px, EYE)).toBe(2)
    expect(one.height).toBe(6)
    expect(LAYOUT.flat.rows(1, 1)).toBe(one.height)
    expect(paintFlat({ seats: ['type'], perRow: 2, tick: 0, isLarge: true }).height).toBe(7)
  })

  test('60 桁なら社長室と一人の部署、または一人と二人の部署が横に並ぶ', async () => {
    expect(LAYOUT.flat.width(1) + LAYOUT.flat.cabinet + 2 + LAYOUT.flat.width(1)).toBeLessThanOrEqual(60)
    expect(LAYOUT.flat.width(1) + 2 + LAYOUT.flat.width(2)).toBeLessThanOrEqual(60)
  })

  test('セルは空白か合図の文字で、電話の合図は考え中より大きい', async () => {
    const think = paintFlat({ seats: ['think'], perRow: 1, tick: 0 })
    const phone = paintFlat({ seats: ['phone'], perRow: 1, tick: 0 })
    expect(think.glyph).toContain('?')
    expect(marks(phone.glyph)).toBeGreaterThan(marks(think.glyph) + 2)
    const art = toFlatCells(phone)
    const words = new Uint32Array(Uint8Array.from(atob(art.cells), ch => ch.charCodeAt(0)).buffer)
    for (let i = 0; i < words.length; i += 3) expect(words[i] === 0x20 || (words[i]! >= 0x21 && words[i]! <= 0x7e)).toBe(true)
  })
})

describe('オフィスの pane', () => {
  test('勤務中は退勤していない全員、社長も数え、退勤者がいる部屋だけ n/m', async ($, on) => {
    const agent = (id: string, status: string) => ({ id, name: id, description: '', type: 'general-purpose', status }) as AgentInfo
    const clock = world(on, [agent('a', 'running'), agent('b', 'idle'), agent('c', 'completed')])
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
    await clock.advance(700)
    expect(await ui.find({ type: 'Text', text: /本日の出勤 4名・勤務中 3名/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\s*1名$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^\s*2\/3名$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^社長：あなたの指示待ち$/ })).toBeDefined()
    await ui.unmount()
  })

  test('社長はどの画面にも座っている', async ($, on) => {
    world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'agent-office', surface, ...PANE })
      expect(await ui.find({ type: 'Button', text: /社長室/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /社内ログ/ })).toBeDefined()
      await ui.press({ key: 'room-0' })
      expect(await ui.find({ type: 'Text', text: /社長（メインセッション）/ })).toBeDefined()
      await ui.press({ key: 'back' })
      expect(await ui.find({ type: 'Button', text: /戻る/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('20 桁の pane でも一行も幅をはみ出さない', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 20 } })
    for (const one of await ui.findAll({ type: 'Text' })) expect(cols(one.text ?? '')).toBeLessThanOrEqual(20)
    for (const one of await ui.findAll({ type: 'Raster' })) expect(one.props.columns).toBeLessThanOrEqual(20)
    await ui.unmount()
  })

  test('メインセッションが Read している間、社長は資料を読んでいる', async ($, on) => {
    world(on)
    let seen: unknown
    let look: () => Promise<unknown> = async () => undefined
    on('tool.call', { tool: 'Read' }, async () => {
      seen = await look()
      return { result: 'ok' }
    })
    const ui = await $.ui.mount({ plugin: 'agent-office', surface: 'terminal', ...PANE })
    await ui.press({ key: 'room-0' })
    look = () => ui.find({ type: 'Text', text: /資料を読んでいる/ })
    await $.tool.call({ tool: 'Read', file_path: '/repo/README.md' })
    expect(seen).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /資料を読んでいる/ })).toBeUndefined()
    await ui.unmount()
  })
})
