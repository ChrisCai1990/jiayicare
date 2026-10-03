import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAnnualReviewMessage } from './annualReviewMessage.mjs'

test('annual review sections become readable rows without losing wrapped evidence', () => {
  const content = `【2026年度综合研判】依据已审核资料
1. 问题来源
• 心血管风险：颈动脉改变（2023影像）；
结合2026血压记录继续核实。
• 慢性病风险：血压趋势升高。
2. 问题筛选
• 已确认事实：报告记录存在。
• 待核实风险：尚缺专科意见。`
  const result = parseAnnualReviewMessage(content)
  assert.equal(result.sections.length, 2)
  assert.equal(result.mode, 'agenda')
  assert.equal(result.sections[0].rows.length, 2)
  assert.equal(result.sections[0].rows[0].label, '心血管风险')
  assert.match(result.sections[0].rows[0].detail, /结合2026血压记录/)
  assert.match(result.intro, /已审核资料/)
  assert.equal(parseAnnualReviewMessage('简单补充回复'), null)
})

test('issue based annual review keeps each issue together and the synthesis last', () => {
  const content = `【问题：血压与心血管风险】
依据与趋势：2025年正常，2026年升高；来源为已审核记录。
当前判断：需要复核。
与其他问题的关联：与肾功能变化可能相关，待核实。
专业去向：专科评估。
管理目标：复核血压；干预重点：按评估意见随访。
沟通与待补：请客户提供家庭监测。
【问题：肾功能】
依据与趋势：一度异常，后续恢复。
当前判断：待复评。
【综合关联与优先级】
共同关联：血压和肾功能需合并核对。
优先级：先复核血压。`
  const result = parseAnnualReviewMessage(content)
  assert.equal(result.mode, 'issues')
  assert.deepEqual(result.sections.map(row => row.title), ['血压与心血管风险', '肾功能'])
  assert.equal(result.sections[0].rows[0].label, '依据与趋势')
  assert.equal(result.sections[0].rows[4].label, '管理目标')
  assert.equal(result.synthesis.rows[0].label, '共同关联')
})
