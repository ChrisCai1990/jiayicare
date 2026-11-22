import test from 'node:test'
import assert from 'node:assert/strict'
import { splitMonitoringPeriods, toggleMonitoringPeriod } from './monitoringPeriodSelection.mjs'

test('血压和血糖时段可逐项勾选、取消并保存为已有字符串格式', () => {
  assert.equal(toggleMonitoringPeriod('晨起', '中午'), '晨起、中午')
  assert.equal(toggleMonitoringPeriod('晨起、中午', '下午'), '晨起、中午、下午')
  assert.equal(toggleMonitoringPeriod('空腹、早餐后', '空腹'), '早餐后')
  assert.deepEqual(splitMonitoringPeriods('晨起，睡前、晨起'), ['晨起', '睡前'])
  assert.deepEqual(splitMonitoringPeriods('早餐后2小时'), ['早餐后2小时'])
})
