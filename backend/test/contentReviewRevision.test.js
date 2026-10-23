const test = require('node:test');
const assert = require('node:assert/strict');
const { revisionToken, prepareRevision, resubmitRevision } = require('../src/utils/contentReviewRevision');
const { advanceReview } = require('../src/utils/contentReviewWorkflow');
const { applyReviewedRevision } = require('../src/utils/geoStaticPublisher');
const { CONTENT_REVIEW_OWNERS } = require('../src/utils/contentReviewAccess');
const staff = { _id: CONTENT_REVIEW_OWNERS.nutritionist, role: 'nutritionist', name: '审核人' };
const base = () => ({ _id: 'draft', __v: 1, slug: 'test', title: '标题', summary: '摘要', sourceContent: '原稿',
  status: 'changes_requested', currentRole: 'nutritionist', reviewChain: ['nutritionist', 'familyDoctor'],
  nutritionReview: { status: 'returned', note: '明确修改意见' }, doctorReview: { status: 'approved' },
  auditLog: [{ action: 'return', role: 'nutritionist', note: '明确修改意见' }] });
const input = record => ({ expectedToken: revisionToken(record), sourceContent: '修改稿', changeSummary: '按意见修订' });

test('return exits reviewer queue and cannot be approved without revision', () => {
  const row = { ...base(), status: 'pending' };
  advanceReview(row, 'nutritionist', 'return', '请修订', staff);
  assert.equal(row.currentRole, ''); assert.equal(row.status, 'changes_requested');
  assert.throws(() => advanceReview(row, 'nutritionist', 'approve', '', staff), /待审核/);
});
test('revision retains original, rejection and clears every approval on re-review', async () => {
  const row = base(); let update;
  const result = await resubmitRevision({ updateOne: async (filter, value) => {
    assert.equal(filter.__v, 1); assert.equal(filter.status, 'changes_requested'); update = value;
    return { modifiedCount: 1 };
  } }, row, input(row));
  assert.equal(result.currentRole, 'nutritionist'); assert.equal(result.status, 'pending');
  assert.equal(update.$push.revisions.before.sourceContent, '原稿');
  assert.equal(update.$push.revisions.returnNote, '明确修改意见');
  assert.equal(update.$set.doctorReview.status, 'pending');
  assert.equal(update.$inc.__v, 1); assert.equal(row.sourceContent, '原稿');
});
test('stale token, unchanged content, absent note and duplicate submission fail closed', async () => {
  const row = base(); const request = input(row);
  row.auditLog[0].note = '另一个意见';
  assert.throws(() => prepareRevision(row, request), /已变化/);
  assert.throws(() => prepareRevision(row, { ...input(row), sourceContent: row.sourceContent }), /未修改/);
  row.auditLog = []; assert.throws(() => prepareRevision(row, input(row)), /退回意见/);
  const original = base();
  await assert.rejects(resubmitRevision({ updateOne: async () => ({ modifiedCount: 0 }) }, original, input(original)), /版本冲突/);
  original.status = 'pending'; assert.throws(() => prepareRevision(original, input(original)), /不是待修订/);
});
test('publication uses revised reviewed body, including later rebuild of published article', () => {
  const article = { title: '旧标题', sections: [{ heading: '旧标题', paragraphs: ['旧正文'] }], sources: ['原引用'] };
  const row = { ...base(), sourceContent: '新正文一\n\n新正文二', revisions: [{}], sourceUpdatedAt: '2026-10-19' };
  const publicArticle = applyReviewedRevision(article, row);
  assert.deepEqual(publicArticle.sections[0].paragraphs, ['新正文一', '新正文二']);
  assert.deepEqual(publicArticle.sources, ['原引用']);
  assert.equal(applyReviewedRevision(article, base()), article);
});
