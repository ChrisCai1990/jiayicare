import test from 'node:test'
import assert from 'node:assert/strict'
import { consolidatedExamDepartment, normalizeExamDepartment, uniqueClinicalTexts } from '../src/utils/screeningDisplay.js'

test('supported physical-exam sections use stable display departments', () => {
  assert.equal(normalizeExamDepartment('内科'), '全科（内外科）')
  assert.equal(normalizeExamDepartment('外科检查'), '全科（内外科）')
  assert.equal(normalizeExamDepartment('耳鼻咽喉科'), '耳鼻喉科')
  assert.equal(normalizeExamDepartment('牙科'), '口腔科')
  assert.equal(normalizeExamDepartment('妇科检查'), '妇科')
})

test('only explicit same-department imaging rows can be consolidated', () => {
  assert.equal(consolidatedExamDepartment([
    { itemType: 'imaging', sourceSection: '妇科' },
    { itemType: 'imaging', sourceSection: '妇科检查' },
  ]), '妇科')
  assert.equal(consolidatedExamDepartment([
    { itemType: 'imaging', sourceSection: '妇科' },
    { itemType: 'lab', sourceSection: '妇科' },
  ]), '')
  assert.equal(consolidatedExamDepartment([
    { itemType: 'imaging', sourceSection: '妇科' },
    { itemType: 'imaging', sourceSection: '' },
  ]), '')
})

test('repeated conclusions are displayed once without rewriting their text', () => {
  const rows = [{ conclusion: '未见明显异常' }, { conclusion: '未见明显异常' }, { conclusion: '建议复查' }]
  assert.deepEqual(uniqueClinicalTexts(rows, 'conclusion'), ['未见明显异常', '建议复查'])
})
