import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewConflictField, changedReviewConflictSection } from './aiReviewConflictField.mjs'

test('edits exactly the conflicting nested text in a doctor section', () => {
  const sections = {
    tumor_risk: {
      cancers: [{ latest: 'CA72-4持续升高', trend: '2018年曾高于上限' }],
      summary: '其他结论',
    },
    medical_priority: { items: [{ current: '保留原文' }] },
  }
  const path = 'tumor_risk.cancers[0].latest'
  assert.equal(reviewConflictField(sections, path), 'CA72-4持续升高')
  const changed = changedReviewConflictSection(sections, path, '2026年CA72-4未高于报告参考上限')
  assert.equal(changed.sectionKey, 'tumor_risk')
  assert.equal(changed.section.cancers[0].latest, '2026年CA72-4未高于报告参考上限')
  assert.equal(changed.section.cancers[0].trend, '2018年曾高于上限')
  assert.equal(sections.tumor_risk.cancers[0].latest, 'CA72-4持续升高')
  assert.equal(sections.medical_priority.items[0].current, '保留原文')
})

test('rejects stale, non-text, and non-doctor conflict paths', () => {
  const sections = { tumor_risk: { abnormal: ['CA72-4持续升高'], count: 1 } }
  assert.equal(reviewConflictField(sections, 'tumor_risk.abnormal[0]'), 'CA72-4持续升高')
  assert.equal(changedReviewConflictSection(sections, 'tumor_risk.abnormal[0]', 'CA72-4曾升高').section.abnormal[0], 'CA72-4曾升高')
  for (const path of ['tumor_risk.abnormal[2]', 'tumor_risk.count', 'lifestyle_assessment.summary', 'tumor_risk.__proto__.polluted']) {
    assert.equal(reviewConflictField(sections, path), null)
    assert.equal(changedReviewConflictSection(sections, path, 'x'), null)
  }
})
