import type { ParseWarning, WrittenMeasure } from './types'

/**
 * 诊断条目的“身份”只来自解析器输出（级别/代码/小节/原文）。
 * 同一份 XML 重新解析得到的诊断顺序与内容一致，因此指纹稳定；
 * 不同工程（不同 XML）的指纹不会串用。
 */
export interface DiagnosticEntry {
  key: string
  warning: ParseWarning
  /** 联动到的书面小节下标；无明确位置（如全局小节数不一致）时为 null。 */
  measureIndex: number | null
}

function signature(warning: ParseWarning): string {
  return [warning.level, warning.code, warning.measureNumber ?? '', warning.xmlPath ?? '', warning.message].join('')
}

/** FNV-1a：把签名压成短字符串，避免整条消息充当键。 */
function hashSignature(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function diagnosticKey(warning: ParseWarning, duplicateOrdinal: number): string {
  return `diag-${hashSignature(signature(warning))}-${duplicateOrdinal}`
}

/**
 * 有些诊断（如“D.S. 缺 Segno”）本身不带小节号，
 * 这里根据记号位置推断“相关小节”，用于清单与乐谱的联动定位。
 */
export function resolveMeasureIndex(warning: ParseWarning, measures: WrittenMeasure[]): number | null {
  if (typeof warning.measureNumber === 'number') {
    const direct = warning.measureNumber - 1
    if (direct >= 0 && direct < measures.length) return direct
  }
  if (!measures.length) return null

  const firstIndexOf = (predicate: (measure: WrittenMeasure) => boolean): number | null => {
    const index = measures.findIndex(predicate)
    return index >= 0 ? index : null
  }

  switch (warning.code) {
    case 'missing-segno':
      // 没有 Segno 时，相关位置是提出 D.S. 的那一小节。
      return firstIndexOf((measure) => measure.navMarkers.some((marker) => marker.type === 'dalsegno'))
    case 'missing-fine':
      // al Fine 缺 Fine：相关位置是提出 al Fine 的跳转记号所在小节。
      return firstIndexOf((measure) =>
        measure.navMarkers.some(
          (marker) => (marker.type === 'dacapo' || marker.type === 'dalsegno') && marker.alFine,
        ),
      )
    case 'missing-coda':
      // To Coda 缺 Coda：相关位置是 To Coda 跳转点。
      return firstIndexOf((measure) => measure.navMarkers.some((marker) => marker.type === 'tocoda'))
    case 'missing-back-repeat':
      return firstIndexOf((measure) =>
        measure.repeats.some((repeat) => repeat.direction === 'forward' && repeat.location === 'left'),
      )
    case 'missing-forward-repeat':
      return firstIndexOf((measure) =>
        measure.repeats.some((repeat) => repeat.direction === 'backward' && repeat.location === 'right'),
      )
    case 'unclosed-jump':
      return (
        firstIndexOf((measure) => measure.navMarkers.some((marker) => marker.type === 'tocoda')) ??
        firstIndexOf((measure) => measure.navMarkers.some((marker) => marker.type === 'dalsegno')) ??
        firstIndexOf((measure) => measure.navMarkers.some((marker) => marker.type === 'dacapo'))
      )
    case 'different-measure-count':
    case 'no-measures':
      return null
    default:
      return null
  }
}

export function buildDiagnosticEntries(warnings: ParseWarning[], measures: WrittenMeasure[]): DiagnosticEntry[] {
  const seen = new Map<string, number>()
  return warnings.map((warning) => {
    const sig = signature(warning)
    const ordinal = seen.get(sig) ?? 0
    seen.set(sig, ordinal + 1)
    return {
      key: diagnosticKey(warning, ordinal),
      warning,
      measureIndex: resolveMeasureIndex(warning, measures),
    }
  })
}
