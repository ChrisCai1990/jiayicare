import test from 'node:test'
import assert from 'node:assert/strict'
import { filterReferralReports, referralDateTime } from '../src/utils/decisionReferralForm.mjs'

test('continuous date entry combines with the explicitly chosen time', () => {
  assert.equal(referralDateTime('20261019', '14:30'), '2026-10-19T14:30')
  assert.equal(referralDateTime('2026-10-19', '09:05'), '2026-10-19T09:05')
  assert.equal(referralDateTime('20261019', ''), '')
  assert.equal(referralDateTime('2026-02-30', '09:00'), '')
})

test('report search matches title and date while excluding records without files', () => {
  const reports = [
    { _id: 'a', title: 'IBD 粪便钙卫蛋白检验报告', checkDate: '2026-10-09', fileUrl: '/a.pdf' },
    { _id: 'b', title: '阴道超声', checkDate: '2022-12-09', fileUrls: ['/b.pdf'] },
    { _id: 'c', title: '阴道超声', checkDate: '2022-05-19', fileUrl: '/c.pdf' },
    { _id: 'd', title: '阴道超声', checkDate: '2022-05-19' },
  ]
  assert.deepEqual(filterReferralReports(reports, '阴道 2022-05').map(item => item._id), ['c'])
  assert.deepEqual(filterReferralReports(reports, 'IBD 2026').map(item => item._id), ['a'])
  assert.deepEqual(filterReferralReports(reports, '').map(item => item._id), ['a', 'b', 'c'])
})
