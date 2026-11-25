import test from 'node:test'
import assert from 'node:assert/strict'
import { autoGroupAnnualVisits, nearDateCandidates, groupVisitRows, matchingVisitLeaders, assignSharedVisit, changeSharedVisitProvider } from './annualVisitScheduling.mjs'

test('合并就诊选择仅提醒时各事项保持提醒且统一日期', () => {
  const data = { abnormal_followup: { records: [{ items: '肺结节', time: '2026-12-03', serviceMode: 'single', serviceType: 'proxy_booking' },
    { items: '甲状腺超声', time: '2026-12-04', serviceMode: 'reminder' }] } }
  const grouped = groupVisitRows(data, ['abnormal_followup:0', 'abnormal_followup:1'], {
    date: '2026-12-03', leaderKey: 'abnormal_followup:0', serviceMode: 'reminder',
  }).abnormal_followup.records
  assert.deepEqual(grouped.map(row => row.serviceMode), ['reminder', 'reminder'])
  assert.deepEqual(grouped.map(row => row.serviceType), ['', ''])
  assert.equal(grouped[0].visitGroupId, grouped[1].visitGroupId)
  assert.deepEqual(grouped.map(row => row.time), ['2026-12-03', '2026-12-03'])
})

test('同院同日保存后归并，异日只提示，保留手动分开的安排', () => {
  const row = { hospital: '浙二医院', serviceMode: 'reminder', time: '2027-01-04' }
  const input = { abnormal_followup: { records: [row, { ...row, hospital: '浙大二院' }, { ...row, time: '2027-01-10' },
    { ...row, hospital: '另一家医院' }, { ...row, scheduleSeparationReason: '需单独安排' }] } }
  const result = autoGroupAnnualVisits(input)
  const rows = result.abnormal_followup.records
  assert.ok(rows[0].visitGroupId)
  assert.equal(rows[1].visitGroupId, rows[0].visitGroupId)
  assert.equal(rows[2].time, '2027-01-10')
  assert.deepEqual(rows.slice(2).map(r => r.visitGroupId), [undefined, undefined, undefined])
  assert.equal(autoGroupAnnualVisits(result), result)
  assert.deepEqual(nearDateCandidates(result).map(e => e.index).sort(), [0, 1, 2])
})

test('同日同院的多个单项服务分别保留，推送时不能自动变成随同办理', () => {
  const records = [
    { items: '胃镜评估', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'proxy_booking' },
    { items: '进一步检查', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'escort_exam' },
  ]
  const data = { abnormal_followup: { records } }
  assert.equal(autoGroupAnnualVisits(data), data)
  assert.deepEqual(records.map(row => row.serviceMode), ['single', 'single'])
  assert.deepEqual(records.map(row => row.visitGroupId), [undefined, undefined])
})

test('已保存的同次分组若全部改为单项服务，保存时解除冲突分组', () => {
  const records = [
    { items: '胃镜评估', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'proxy_booking', visitGroupId: '2026-11-28 邵逸夫医院同次就诊' },
    { items: '进一步检查', hospital: '邵逸夫医院', time: '2026-11-28', serviceMode: 'single', serviceType: 'escort_exam', visitGroupId: '2026-11-28 邵逸夫医院同次就诊' },
  ]
  const data = { abnormal_followup: { records } }
  const result = autoGroupAnnualVisits(data)
  assert.deepEqual(result.abnormal_followup.records.map(row => row.visitGroupId), ['', ''])
  assert.deepEqual(result.abnormal_followup.records.map(row => row.serviceType), ['proxy_booking', 'escort_exam'])
  assert.equal(autoGroupAnnualVisits(result), result)
})

test('同院同日的安排就医与完善检查出现在待核对列表，确认后只保留一次主服务', () => {
  const data = {
    medical_treatment: { records: [{ items: '心内科就医', visit_time: '2026-11-27', hospital: '邵逸夫医院', department: '心内科', serviceMode: 'single', serviceType: 'proxy_booking' }] },
    checkup_completion: { records: [{ items: '脂蛋白磷脂酶A2', time: '2026-11-27', hospital: '邵逸夫医院', serviceMode: 'single', serviceType: 'escort_exam' }] },
  }
  assert.equal(nearDateCandidates(data).length, 2)
  assert.equal(autoGroupAnnualVisits(data), data)
  const grouped = groupVisitRows(data, ['medical_treatment:0', 'checkup_completion:0'], {
    date: '2026-11-27', leaderKey: 'medical_treatment:0', serviceMode: 'single', serviceType: 'proxy_booking',
  })
  assert.deepEqual([grouped.medical_treatment.records[0].serviceMode, grouped.checkup_completion.records[0].serviceMode], ['single', 'shared'])
  assert.equal(grouped.medical_treatment.records[0].visitGroupId, grouped.checkup_completion.records[0].visitGroupId)
  assert.equal(nearDateCandidates(grouped).length, 0)
})

test('完善检查可沿用主就医医院及开单科室专家，检查科室仍独立', () => {
  const data = {
    medical_treatment: { records: [{ items: '心内科就医', visit_time: '2026-11-27', hospital: '邵逸夫医院', department: '心内科', expert: '专家甲', expertIds: ['expert-id'], serviceMode: 'single', serviceType: 'proxy_booking' }] },
    checkup_completion: { records: [{ items: '脂蛋白磷脂酶A2', time: '2026-11-27', department: '检验科', serviceMode: 'shared' }] },
  }
  assert.equal(matchingVisitLeaders(data, 'checkup_completion', 0).length, 1)
  let grouped = assignSharedVisit(data, 'checkup_completion', 0, 'medical_treatment:0')
  grouped = changeSharedVisitProvider(grouped, 'checkup_completion', 0, 'followVisitOrdering', true)
  const exam = grouped.checkup_completion.records[0]
  assert.equal(exam.hospital, '邵逸夫医院')
  assert.equal(exam.order_dept, '心内科')
  assert.equal(exam.order_expert, '专家甲')
  assert.deepEqual(exam.orderExpertIds, ['expert-id'])
  assert.equal(exam.department, '检验科')
  const changed = { ...grouped, medical_treatment: { records: [{ ...grouped.medical_treatment.records[0], expert: '专家乙' }] } }
  assert.equal(autoGroupAnnualVisits(changed).checkup_completion.records[0].order_expert, '专家乙')
})
