import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser
globalThis.document = dom.window.document

import { buildPerformancePath, parseMusicXml } from '../src/score/parser'
import { buildDiagnosticEntries, diagnosticKey, xmlSignature } from '../src/score/diagnostics'
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

// --- 诊断核对清单：稳定键、定位与原诊断不变 ---
const badEntries = buildDiagnosticEntries(badPath, bad.measures)
const missingSegno = badEntries.find((entry) => entry.warning.code === 'missing-segno')
if (!missingSegno) throw new Error('核对清单应包含缺少 Segno 诊断')
if (missingSegno.measureIndex !== 2) throw new Error('缺 Segno 诊断应定位到发起 D.S. 的第 3 小节')
// 路径确实演奏到了 D.S. 记号所在小节，之后才无法闭合；该小节仍在实际路径中
if (!missingSegno.isPlayed) throw new Error('第 3 小节在跳转失败前已被到达，应标记为在实际路径中')

// 重新解析同一 XML，诊断键必须完全一致，核对记录才能恢复
const badReload = buildPerformancePath(parseMusicXml(unclosedJumpXml()))
const reloadedKeys = badReload.warnings.map((warning, index) => diagnosticKey(warning, index))
const originalKeys = badPath.warnings.map((warning, index) => diagnosticKey(warning, index))
if (JSON.stringify(reloadedKeys) !== JSON.stringify(originalKeys)) {
  throw new Error('同一 XML 重新载入后诊断键不一致，核对记录无法恢复')
}

// 确认状态不得改变原错误级别与路径闭合结论
if (missingSegno.warning.level !== 'error') throw new Error('原诊断级别必须始终是错误')
if (badPath.closed) throw new Error('确认备注不能让路径变成已闭合')

// XML 指纹：同内容一致，换一份内容不同
if (xmlSignature(unclosedJumpXml()) !== xmlSignature(unclosedJumpXml())) throw new Error('同一 XML 指纹应一致')
if (xmlSignature(unclosedJumpXml()) === xmlSignature(fullSampleXml())) throw new Error('不同工程的 XML 指纹不应相同')

console.log(JSON.stringify({
  expected,
  dsExpected,
  totalSeconds: path.totalSeconds,
  warnings: path.warnings.map((warning) => warning.code),
  badWarnings: badPath.warnings.map((warning) => warning.code),
}, null, 2))
