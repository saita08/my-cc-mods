export type Pose =
  | 'type'
  | 'read'
  | 'search'
  | 'write'
  | 'think'
  | 'out'
  | 'phone'
  | 'delegate'
  | 'coffee'
  | 'wait'
  | 'gone'

export type Employee = {
  id: string
  name: string
  alias?: string
  dept: string
  type: string
  description: string
  status: string
  parentId?: string
  act?: string
  pose?: Pose
  detail?: string
  toolUseId?: string
  tools: number
  startedAt: number
  endedAt?: number
}

export type Boss = {
  isWorking: boolean
  act?: string
  pose?: Pose
  detail?: string
  toolUseId?: string
  since: number
}

export type LogLine = { at: number; text: string }

// A client's person waiting in the 応接室, keyed by the company they came from.
export type Visitor = { company: string; reason: string; since: number }

// The 社長's desk phone, ringing until `until`.
export type Ring = { company: string; until: number }

// One consultation with the 相談役, known once the step that made it has answered.
export type Consult = { who: string; room: string; seconds: number; asked: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'agent-office': {
      staff: Employee[]
      boss: Boss
      log: LogLine[]
      tick: number
      isAutoOpened: boolean
      view: string
      unread: number
      papers: number
      ring: Ring
      visitors: Visitor[]
      consults: Consult[]
    }
  }
}
