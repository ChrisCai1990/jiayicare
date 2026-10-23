import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewConflictField, changedReviewConflictSection, removedReviewConflictClaim } from './aiReviewConflictField.mjs'

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

test('deletes one of two conflicting conclusions without changing evidence or the other conclusion', () => {
  const sections = {
    tumor_risk: {
      summary: 'CA72-4持续升高',
      overview: { headline: 'CA72-4近年持续高于参考上限' },
      sourceEvidence: [{ value: '9.05', referenceRange: '<19.10' }],
    },
  }
  const changed = removedReviewConflictClaim(sections, 'tumor_risk.summary', 'CA72-4持续升高')
  assert.equal(changed.section.summary, '')
  assert.equal(changed.section.overview.headline, 'CA72-4近年持续高于参考上限')
  assert.deepEqual(changed.section.sourceEvidence, sections.tumor_risk.sourceEvidence)
  assert.equal(sections.tumor_risk.summary, 'CA72-4持续升高')
})

test('deletes one array item or clause while retaining adjacent conclusions', () => {
  const sections = { tumor_risk: {
    abnormal: ['CA72-4持续升高', '另一项异常'],
    summary: '已完成筛查；CA72-4持续升高；建议核对其他项目',
  } }
  assert.deepEqual(removedReviewConflictClaim(sections, 'tumor_risk.abnormal[0]', 'CA72-4持续升高').section.abnormal, ['另一项异常'])
  assert.equal(removedReviewConflictClaim(sections, 'tumor_risk.summary', 'CA72-4持续升高').section.summary, '已完成筛查；建议核对其他项目')
  assert.equal(removedReviewConflictClaim(sections, 'tumor_risk.summary', '不存在的结论'), null)
})
