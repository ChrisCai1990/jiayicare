const test = require('node:test'), assert = require('node:assert/strict');
const logic = require('../src/utils/annualExecutionReview');
const change = { key: 'abnormal_followup', before: { items: '项目', personalizedAdvice: '原建议', time: '2026-11-01' }, after: { items: '项目', personalizedAdvice: '新建议', time: '2026-12-01' } };
test('only confirmed/frozen plans with execution changes get review markers', () => {
  assert.equal(logic.markForReview({}, [change]), null);
  assert.equal(logic.markForReview({ pushedAt: new Date() }, [change]), null);
  assert.equal(logic.markForReview({ confirmedAt: new Date() }, [change]).status, 'pending');
  assert.equal(logic.markForReview({ frozenAt: new Date() }, [change]).status, 'pending');
  assert.equal(logic.markForReview({ confirmedAt: new Date() }, [{ ...change, after: { ...change.before, reason: '仅补依据', reviewAmendmentSource: { topicId: 'new' } } }]), null);
});
test('add/remove/move and pending dates remain reviewable without inferred dates', () => {
  for (const c of [{ ...change, before: null }, { ...change, after: null }, { ...change, after: { ...change.before, time: '', timingStatus: 'pending_confirmation' } }]) assert.equal(logic.changesForExecution([c]).length, 1);
  const row = logic.summary({ ...change, after: { ...change.before, time: '', timingStatus: 'pending_confirmation' } });
  assert.equal(row.after.date, ''); assert.equal(row.after.datePending, true);
  assert.equal(logic.summary({ ...change, index: 2 }).key, 'abnormal_followup');
  assert.equal(logic.summary({ ...change, index: 2 }).index, 2);
});
test('legacy and handled amendments do not produce tasks; pending revisions group by plan', () => {
  const plan = { _id: 'p', patientId: { _id: 'u', name: '合成会员' }, year: 2026, planType: 'jygj_light', supplementRevisions: [{ id: 'legacy', status: 'applied', changes: [change] }] };
  assert.equal(logic.todo(plan), null);
  for (const id of ['one', 'two']) plan.supplementRevisions.push({ id, status: 'applied', changes: [change], createdAt: new Date(), executionReview: { version: 1, status: 'pending' } });
  assert.match(logic.todo(plan).summary, /2次修订/); assert.equal(logic.todo(plan).id, 'annual_execution_review_p');
  assert.match(logic.todo(plan).link, /planType=jygj_light#annual-execution-review/);
  plan.supplementRevisions.forEach(r => { if (r.executionReview) r.executionReview.status = 'reviewed'; }); assert.equal(logic.todo(plan), null);
});
test('arrangement snapshot is order-insensitive and detects updates and additions', () => {
  const a = { _id: 'a', updatedAt: new Date(1), status: 'planned' }, b = { _id: 'b', updatedAt: new Date(2), status: 'completed' };
  assert.equal(logic.taskVersion([a,b], []), logic.taskVersion([b,a], []));
  assert.notEqual(logic.taskVersion([a], []), logic.taskVersion([{ ...a, status: 'completed' }], []));
  assert.notEqual(logic.taskVersion([a], []), logic.taskVersion([a], [b]));
});
