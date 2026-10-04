const test = require('node:test');
const assert = require('node:assert/strict');
const { singleItemDate } = require('../src/utils/reportExtractionPolicy');

test('one reviewed endoscopy date can restore the report date', () => {
  assert.equal(singleItemDate({ pageDates: new Map([['1', '2024-04-03']]), reportItems: [{ name: '肠镜', sourcePage: 1, examDate: '2024-04-03' }] }), '2024-04-03');
});

test('multiple or invalid item dates cannot become a report date', () => {
  assert.equal(singleItemDate({ reportItems: [{ name: 'A', examDate: '2024-04-03' }, { name: 'B', examDate: '2024-04-04' }] }), '');
  assert.equal(singleItemDate({ pageDates: { 1: '' }, reportItems: [{ name: '肠镜', sourcePage: 1, examDate: '2024-04-03' }] }), '');
  assert.equal(singleItemDate({ reportItems: [{ name: '肠镜', examDate: '2024-04-31' }] }), '');
});
