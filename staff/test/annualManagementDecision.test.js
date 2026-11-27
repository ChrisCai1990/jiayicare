import test from 'node:test'
import assert from 'node:assert/strict'
import { annualManagementSourceKey, findAnnualManagementDecision, labManagementSource, labManagementSummary } from '../src/utils/annualManagementDecision.mjs'

test('同份报告中的不同筛查项目各自显示纳入状态', () => {
  const reportId = '507f1f77bcf86cd799439011'
  const liver = { kind: 'screening', reportId, itemId: 'tumor|肝胆胰脾彩超' }
  const kidney = { kind: 'screening', reportId, itemId: 'tumor|双肾输尿管膀胱彩超' }
  const saved = [{ sourceKey: annualManagementSourceKey(liver), title: '脂肪肝' }]
  assert.equal(findAnnualManagementDecision(saved, liver, '脂肪肝'), saved[0])
  assert.equal(findAnnualManagementDecision(saved, kidney, '双肾输尿管膀胱超声未见异常'), null)
})

test('旧报告级决定不会因报告总论重复而误标其他项目', () => {
  const reportId = '507f1f77bcf86cd799439011'
  const saved = [{ _id: 'legacy', sourceKey: `screening_report:${reportId}`, title: '脂肪肝' }]
  const liver = { kind: 'screening', reportId, itemId: 'liver' }
  const kidney = { kind: 'screening', reportId, itemId: 'kidney' }
  assert.equal(findAnnualManagementDecision(saved, liver), null)
  assert.equal(findAnnualManagementDecision(saved, kidney), null)
})

test('已处理主诉按记录编号独立纳入，不借用同名报告决定', () => {
  const symptom = { kind:'symptom', recordId:'507f1f77bcf86cd799439021' }
  const saved = [{ sourceKey:annualManagementSourceKey(symptom), title:'持续腹痛' }]
  assert.equal(findAnnualManagementDecision(saved, symptom), saved[0])
  assert.equal(findAnnualManagementDecision(saved, { kind:'symptom', recordId:'507f1f77bcf86cd799439022' }), null)
})

test('普通报告项目按报告和项目分别追踪', () => {
  const first = { kind:'report_item', reportId:'report-1', itemId:'item-1' }
  const second = { kind:'report_item', reportId:'report-1', itemId:'item-2' }
  const saved = [{ sourceKey:annualManagementSourceKey(first), title:'待复核' }]
  assert.equal(annualManagementSourceKey(first), 'report_item:report-1:item-1')
  assert.equal(findAnnualManagementDecision(saved, second), null)
})

test('检验组合收起显示纳入数量，展开只标记选中的单项', () => {
  const record = {
    _id: 'virtual', _sourceItems: [{ reportId: 'report', itemId: 'enzyme-group' }],
    reportItems: ['肌酸激酶', '肌酸激酶同工酶MB', 'α-羟丁酸脱氢酶', '血管紧张素转化酶']
      .map((name, index) => ({ name, itemId: String(index + 1), reportId: 'report' })),
  }
  const sources = record.reportItems.map(item => labManagementSource(record, item))
  const selected = { sourceKey: annualManagementSourceKey(sources[2]) }
  assert.deepEqual(sources.map(source => !!findAnnualManagementDecision([selected], source)), [false, false, true, false])
  assert.deepEqual(labManagementSummary(record, [selected]), { count: 1, legacy: [] })
  const legacySource = { kind: 'screening', reportId: 'report', itemId: 'enzyme-group' }
  const legacy = { sourceKey: annualManagementSourceKey(legacySource) }
  assert.deepEqual(labManagementSummary(record, [legacy]), { count: 0, legacy: [legacySource] })
  assert.deepEqual(labManagementSummary(record, [selected, legacy]), { count: 1, legacy: [legacySource] })
  assert.equal(labManagementSummary(record, [selected, { sourceKey: annualManagementSourceKey(sources[1]) }]).count, 2)
  assert.deepEqual(labManagementSummary(record, []), { count: 0, legacy: [] })
})
