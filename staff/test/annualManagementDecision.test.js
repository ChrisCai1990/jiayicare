import test from 'node:test'
import assert from 'node:assert/strict'
import { annualManagementSourceKey, findAnnualManagementDecision } from '../src/utils/annualManagementDecision.mjs'

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
