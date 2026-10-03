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
  assert.equal(result.sections[0].rows.length, 2)
  assert.equal(result.sections[0].rows[0].label, '心血管风险')
  assert.match(result.sections[0].rows[0].detail, /结合2026血压记录/)
  assert.match(result.intro, /已审核资料/)
  assert.equal(parseAnnualReviewMessage('简单补充回复'), null)
})
