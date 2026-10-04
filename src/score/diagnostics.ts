import type { BuiltPath, ParseWarning, WrittenMeasure } from './types'

/**
 * 诊断的稳定标识：只来自解析器输出本身（级别、代码、原文、位置）。
 * 同一份 XML 的解析输出顺序固定，因此重新载入后同一诊断仍映射到同一条核对记录。
 * 核对记录不参与键的构成，确认/备注永远无法改变解析诊断的身份。
 */
export function diagnosticKey(warning: ParseWarning, occurrenceIndex: number): string {
  const location = warning.measureNumber === undefined ? 'score' : `m${warning.measureNumber}`
  const path = warning.xmlPath ? `@${warning.xmlPath}` : ''
  return `${warning.level}|${warning.code}|${location}|${warning.message}${path}#${occurrenceIndex}`
}

/**
 * 原 XML 的内容指纹。核对记录只在指纹一致时恢复，
 * 另一个工程（另一份 XML）不会串用。
 */
export function xmlSignature(xml: string): string {
  let hash1 = 0x811c9dc5
  let hash2 = 0x01000193
  let checksum = 0
  for (let i = 0; i < xml.length; i += 1) {
    const code = xml.charCodeAt(i)
    checksum = (checksum + code) >>> 0
    hash1 = Math.imul(hash1 ^ code, 0x01000193) >>> 0
    hash2 = Math.imul(hash2 + code, 0x85ebca6b) >>> 0
  }
  return `len${xml.length}:sum${checksum.toString(36)}:${(hash1 ^ hash2).toString(36)}`
}

const measureScopedCodes: ReadonlySet<ParseWarning['code']> = new Set([
  'unsupported-jump-word',
  'missing-back-repeat',
  'missing-forward-repeat',
  'orphan-ending',
  'overlapping-ending',
  'time-signature-change',
  'unresolved-nav-target',
  'unrecognized-direction',
])

/**
 * 把诊断关联到相关书面小节，用于“定位小节”联动。
 * - 带小节号的诊断直接定位该小节；
 * - 缺少跳转目标的诊断（缺 Segno/Coda/Fine、To Coda 不配套）
 *   定位到发起跳转的 D.S./D.C./To Coda 所在小节；
 * - 全局诊断（各声部小节数不一致、没有小节等）返回 null。
 */
export function resolveDiagnosticMeasureIndex(
  warning: ParseWarning,
  measures: WrittenMeasure[],
): number | null {
  if (!measures.length) return null

  if (warning.measureNumber !== undefined && measureScopedCodes.has(warning.code)) {
    const index = warning.measureNumber - 1
    if (index >= 0 && index < measures.length) return index
  }

  const findMeasureWithNav = (types: Array<WrittenMeasure['navMarkers'][number]['type']>): number | null => {
    const found = measures.find((measure) => measure.navMarkers.some((marker) => types.includes(marker.type)))
    return found ? found.index : null
  }

  switch (warning.code) {
    case 'missing-segno':
      return findMeasureWithNav(['dalsegno'])
    case 'missing-coda':
      return findMeasureWithNav(['tocoda'])
    case 'missing-fine':
      return findMeasureWithNav(['dacapo', 'dalsegno'])
    case 'unclosed-jump': {
      // “al Coda 找不到 To Coda 跳转点”对应返始记号；“To Coda 不配套”也落到跳转点上
      const tocoda = findMeasureWithNav(['tocoda'])
      if (tocoda !== null) return tocoda
      return findMeasureWithNav(['dacapo', 'dalsegno'])
    }
    case 'duplicate-segno':
      return findMeasureWithNav(['segno'])
    case 'duplicate-coda':
      return findMeasureWithNav(['coda'])
    case 'multiple-fine':
      return findMeasureWithNav(['fine'])
    default:
      return null
  }
}

export interface DiagnosticEntry {
  key: string
  warning: ParseWarning
  /** 关联书面小节索引；全局诊断为 null */
  measureIndex: number | null
  /** 该小节是否出现在实际演奏路径中 */
  isPlayed: boolean
}

/** 解析诊断与乐谱小节的联动列表，顺序与解析器输出完全一致。 */
export function buildDiagnosticEntries(path: BuiltPath, measures: WrittenMeasure[]): DiagnosticEntry[] {
  const playedMeasures = new Set(path.steps.map((step) => step.measureIndex))
  return path.warnings.map((warning, index) => {
    const measureIndex = resolveDiagnosticMeasureIndex(warning, measures)
    return {
      key: diagnosticKey(warning, index),
      warning,
      measureIndex,
      isPlayed: measureIndex === null ? false : playedMeasures.has(measureIndex),
    }
  })
}
