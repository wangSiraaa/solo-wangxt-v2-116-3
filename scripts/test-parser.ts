import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.document = dom.window.document

import { buildPerformancePath, parseMusicXml } from '../src/score/parser'
import { buildDiagnosticEntries } from '../src/score/diagnostics'
import { fullSampleXml, unclosedJumpXml } from '../src/score/samples'

const xml = fullSampleXml()
const score = parseMusicXml(xml)
const path = buildPerformancePath(score)

const numbers = path.steps.map((step) => step.measureNumber)
const expected = ['0', '1', '2', '3', '4', '5', '2', '3', '4', '6', '7', '8']
if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
  throw new Error(`演奏路径错误：${numbers.join(', ')}`)
}
if (!path.closed) throw new Error('样例路径应可闭合')
if (!score.measures[0].isPickup) throw new Error('第 0 小节应识别为弱起')
if (!score.measures[4].hasMultipleVoices) throw new Error('第 5 小节应识别为多声部')
if (!score.tempos.some((tempo) => tempo.measureIndex === 2 && Math.round(tempo.bpm) === 120)) {
  throw new Error('应识别第 3 小节速度改变')
}

const bad = parseMusicXml(unclosedJumpXml())
const badPath = buildPerformancePath(bad)
if (badPath.closed) throw new Error('缺少 Segno/Fine 的路径不应闭合')
if (!badPath.warnings.some((warning) => warning.code === 'missing-segno')) throw new Error('应报告缺少 Segno')

// 诊断核对清单：缺 Segno 诊断应联动到 D.S. 所在小节（样例第 3 小节，下标 2）。
const badEntries = buildDiagnosticEntries(badPath.warnings, bad.measures)
const missingSegno = badEntries.find((entry) => entry.warning.code === 'missing-segno')
if (!missingSegno) throw new Error('核对清单缺少 missing-segno 条目')
if (missingSegno.measureIndex !== 2) {
  throw new Error(`缺 Segno 诊断应定位到第 3 小节，实际下标 ${missingSegno.measureIndex}`)
}

// 同一份 XML 重新解析，诊断指纹必须保持一致，核对记录才能恢复。
const reloaded = parseMusicXml(unclosedJumpXml())
const reloadedPath = buildPerformancePath(reloaded)
const reloadedEntries = buildDiagnosticEntries(reloadedPath.warnings, reloaded.measures)
if (JSON.stringify(reloadedEntries.map((entry) => entry.key)) !== JSON.stringify(badEntries.map((entry) => entry.key))) {
  throw new Error('重新解析同一 XML 后诊断指纹发生变化，核对记录无法恢复')
}
if (reloadedPath.closed) throw new Error('确认备注不参与解析：缺 Segno 的路径仍应不闭合')

const dsAlCodaXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><direction-type><words>Segno</words></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="2"><direction><direction-type><words>To Coda</words></direction-type></direction><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="3"><direction><direction-type><words>D.S. al Coda</words></direction-type></direction><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
    <measure number="4"><direction><direction-type><words>Coda</words></direction-type></direction><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note></measure>
  </part>
</score-partwise>`
const dsScore = parseMusicXml(dsAlCodaXml)
const dsPath = buildPerformancePath(dsScore)
const dsExpected = ['1', '2', '3', '1', '2', '4']
if (JSON.stringify(dsPath.steps.map((step) => step.measureNumber)) !== JSON.stringify(dsExpected)) {
  throw new Error(`D.S. al Coda 路径错误：${dsPath.steps.map((step) => step.measureNumber).join(', ')}`)
}
if (!dsPath.closed) throw new Error('D.S. al Coda 样例路径应可闭合')

console.log(JSON.stringify({
  expected,
  dsExpected,
  totalSeconds: path.totalSeconds,
  warnings: path.warnings.map((warning) => warning.code),
  badWarnings: badPath.warnings.map((warning) => warning.code),
}, null, 2))
