const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const routes = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const projection = routes.match(/contentReviews\.forEach\(item => todos\.push\((\{[\s\S]*?\})\)\);/)[1];
const present = new Function('item', `return (${projection})`);

test('revised pending card identifies new version, summary and resubmission time', () => {
  const item = { _id: 'sample', title: '测试稿', currentRole: 'nutritionist', revisions: [{ at: '2026-10-21T01:00:00Z', changeSummary: '按意见调整表述' }] };
  const card = present(item);
  assert.match(card.label, /修订稿 · 第2版 · 待重新审核/);
  assert.match(card.summary, /按意见调整表述/);
  assert.equal(card.createdAt, item.revisions[0].at);
});
test('original card remains an initial review', () => {
  const card = present({ _id: 'sample', title: '测试稿', currentRole: 'familyDoctor', createdAt: 'initial' });
  assert.doesNotMatch(card.label, /修订稿/);
  assert.equal(card.summary, '测试稿');
  assert.equal(card.createdAt, 'initial');
});
test('newest of multiple revisions is used, without mutating review data', () => {
  const item = { _id: 'sample', title: '测试稿', revisions: [{ at: 'first', changeSummary: '旧摘要' }, { at: 'second', changeSummary: '新摘要' }] };
  const before = JSON.stringify(item);
  const card = present(item);
  assert.match(card.label, /第3版/);
  assert.match(card.summary, /新摘要/);
  assert.equal(card.createdAt, 'second');
  assert.equal(JSON.stringify(item), before);
});
