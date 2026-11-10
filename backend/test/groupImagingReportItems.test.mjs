import test from 'node:test'
import assert from 'node:assert/strict'
import { groupImagingReportItems } from '../../staff/src/utils/groupImagingReportItems.mjs'

const base = { itemId: 'carotid', name: '颈动脉超声', examDate: '2024-04-15', institution: '邵逸夫医院' }

test('one report with repeated full text displays once without removing sources', () => {
  const names = ['双侧颈动脉彩超', '双侧颈动脉内径', '双侧颈动脉内膜', '双侧颈动脉内壁', '双侧颈动脉管腔', '双侧颈动脉血流']
  const rows = names.map(name => ({ ...base, name, sourcePage: 7, findings: '双侧颈动脉内径正常，内膜稍毛糙，管腔未见狭窄，血流通畅。', diagnosis: '双侧颈动脉内膜稍毛糙' }))
  const groups = groupImagingReportItems(rows)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].items.length, 6)
  assert.equal(rows.length, 6)
})

test('summary and detailed page with contained findings display as one examination', () => {
  const summary = { ...base, sourcePage: 2, findings: '双侧颈动脉内膜稍毛糙' }
  const detail = { ...base, sourcePage: 7, findings: '双侧颈动脉内径正常，双侧颈动脉内膜稍毛糙，管腔未见明显狭窄，血流通畅。', diagnosis: '双侧颈动脉内膜稍毛糙' }
  const [group] = groupImagingReportItems([summary, detail])
  assert.equal(group.items.length, 2)
  assert.equal(group.primary, detail)
  assert.deepEqual(group.sourcePages, [2, 7])
})

test('different examination, date or conflicting detail stays separate', () => {
  const summary = { ...base, sourcePage: 2, findings: '双侧颈动脉内膜稍毛糙' }
  const conflicting = { ...base, sourcePage: 7, findings: '双侧颈动脉内膜光滑，未见明显异常。' }
  assert.equal(groupImagingReportItems([summary, conflicting]).length, 2)
  assert.equal(groupImagingReportItems([summary, { ...summary, sourcePage: 7, itemId: 'thyroid' }]).length, 2)
  assert.equal(groupImagingReportItems([summary, { ...summary, sourcePage: 7, examDate: '2025-04-15' }]).length, 2)
})

test('same finding in summary report and individual report merges with institution alias', () => {
  const finding = '双侧颈动脉内径正常，内膜稍毛糙，管腔未见明显狭窄，血流通畅。'
  const individual = { ...base, reportId: 'single', sourcePage: 1, name: '双侧颈动脉彩超', findings: finding, diagnosis: '双侧颈动脉内膜稍毛糙' }
  const comprehensive = { ...base, reportId: 'checkup', sourcePage: 7, name: '双侧颈动脉', institution: '浙江大学医学院附属邵逸夫医院', findings: finding, diagnosis: '双侧颈动脉内膜稍毛糙' }
  const [group] = groupImagingReportItems([individual, comprehensive])
  assert.equal(group.items.length, 2)
  assert.deepEqual(new Set(group.items.map(item => item.reportId)), new Set(['single', 'checkup']))
})
