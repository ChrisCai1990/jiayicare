import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')
const definitions = source.slice(source.indexOf('const DOCUMENT_CATEGORIES ='), source.indexOf('\nfunction ServiceJourneyPanel'))
const { categories, infer } = vm.runInNewContext(`${definitions}\n({ categories: DOCUMENT_CATEGORIES, infer: inferDocumentCategory })`)

test('all upload categories retain their saved value even with conflicting titles', () => {
  for (const { key } of categories) {
    assert.equal(infer({ documentCategory: key, title: '慢性食物过敏 住院检查检验报告', type: 'annual' }), key)
  }
})

test('legacy reports without a category still use existing fallback rules', () => {
  assert.equal(infer({ title: '住院检查检验报告', type: 'other' }), 'inpatient_record')
  assert.equal(infer({ title: '门诊记录', type: 'other' }), 'outpatient_record')
  assert.equal(infer({ title: '血常规', type: 'blood' }), 'lab_report')
  assert.equal(infer({ title: '超声', type: 'ultrasound' }), 'exam_report')
})

test('edit form reads and saves documentCategory instead of screening type', () => {
  assert.match(source, /documentCategory: inferDocumentCategory\(r\)/)
  const modal = source.slice(source.indexOf('<h3 className="modal-title">编辑报告信息'), source.indexOf('{riskEvidenceModal &&'))
  assert.match(modal, /value=\{editingReportForm.documentCategory/)
  assert.match(modal, /DOCUMENT_CATEGORIES.map/)
  assert.doesNotMatch(modal, /editingReportForm.type|REPORT_L1_TYPES.map/)
  assert.match(modal, /updateReport\(editingReport._id, editingReportForm\)/)
})
