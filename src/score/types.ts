export type WarningLevel = 'error' | 'warning' | 'info'

export interface ParseWarning {
  level: WarningLevel
  code:
    | 'no-measures'
    | 'different-measure-count'
    | 'unsupported-jump-word'
    | 'missing-back-repeat'
    | 'missing-forward-repeat'
    | 'orphan-ending'
    | 'overlapping-ending'
    | 'missing-segno'
    | 'duplicate-segno'
    | 'missing-coda'
    | 'duplicate-coda'
    | 'missing-fine'
    | 'multiple-fine'
    | 'unresolved-nav-target'
    | 'unclosed-jump'
    | 'unrecognized-direction'
    | 'time-signature-change'
    | 'unknown'
  message: string
  measureNumber?: number
  xmlPath?: string
}

export interface TimeSignature {
  numerator: number
  denominator: number
  beatUnitSeconds: number
}

export interface TempoEvent {
  measureIndex: number
  bpm: number
  label: string
  source: 'sound' | 'metronome' | 'default'
}

export type BarlineLocation = 'left' | 'right' | 'middle'

export interface RepeatInfo {
  location: BarlineLocation
  direction: 'forward' | 'backward'
  times: number
}

export interface EndingInfo {
  location: BarlineLocation
  type: 'start' | 'stop' | 'discontinue'
  numbers: number[]
}

export type NavType =
  | 'segno'
  | 'coda'
  | 'fine'
  | 'dacapo'
  | 'dalsegno'
  | 'tocoda'

export interface NavMarker {
  type: NavType
  measureIndex: number
  text: string
  alFine?: boolean
  alCoda?: boolean
  consumed: boolean
}

export interface WrittenMeasure {
  index: number
  number: string
  implicit: boolean
  durationQuarters: number
  declaredDurationQuarters: number | null
  isPickup: boolean
  hasMultipleVoices: boolean
  voiceCount: number
  partMeasureCounts: Record<string, number>
  timeSignature: TimeSignature | null
  repeats: RepeatInfo[]
  endings: EndingInfo[]
  navMarkers: NavMarker[]
  warnings: ParseWarning[]
}

export type JumpKind =
  | 'straight'
  | 'repeat-back'
  | 'volta-skip'
  | 'da-capo'
  | 'dal-segno'
  | 'to-coda'
  | 'fine-stop'
  | 'end'

export interface PathStep {
  occurrence: number
  measureIndex: number
  measureNumber: string
  iteration: number
  bpm: number
  durationSeconds: number
  startSeconds: number
  endSeconds: number
  activeEndingNumbers: number[]
  incomingJump: JumpKind
  event: string
  isPickup: boolean
}

export interface BuiltPath {
  steps: PathStep[]
  arrivals: Array<{ measureIndex: number; occurrences: number[] }>
  totalSeconds: number
  warnings: ParseWarning[]
  closed: boolean
}

export type ReviewStatus = 'pending' | 'confirmed'

export interface DiagnosticReview {
  /** 对解析诊断内容的稳定指纹（同一份 XML 重新解析结果一致），不是诊断本身。 */
  key: string
  note: string
  status: ReviewStatus
  updatedAt: string
  /** 建记录时的诊断快照，仅用于在当前 XML 找不到对应诊断时展示旧记录。 */
  code: ParseWarning['code']
  level: WarningLevel
  message: string
  measureNumber?: number
}

export interface RehearsalMark {
  id: string
  measureIndex: number
  occurrence?: number
  label: string
  comment: string
  color: string
  createdAt: string
}

export interface StoredProject {
  id: string
  name: string
  originalXml: string
  marks: RehearsalMark[]
  /** 诊断核对记录：只属于本工程，不写回 XML，也不改变解析器结论。 */
  reviews: DiagnosticReview[]
  updatedAt: string
  createdAt: string
}

export interface ProjectExport {
  format: 'local-rehearsal-project/v1'
  project: StoredProject
}
