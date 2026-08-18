const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Task = require('../src/models/Task');
const AbnormalReview = require('../src/models/AbnormalReview');
const { reportReviewSourceKey, ensureReportAbnormalReview } = require('../src/utils/reportAbnormalReview');

test('report review source key is stable and requires both identities', () => {
  assert.equal(reportReviewSourceKey('report-1', 'request-1'), 'report-1:request-1');
  assert.throws(() => reportReviewSourceKey('report-1', ''), /缺少/);
});

test('abnormal review and task each have a sparse unique source key', () => {
  for (const Model of [Task, AbnormalReview]) {
    const index = Model.schema.indexes().find(([fields]) => fields.sourceReviewRequestId === 1);
    assert.ok(index);
    assert.equal(index[1].unique, true);
    assert.equal(index[1].sparse, true);
  }
});

test('retry reconciles the same abnormal review and task instead of creating duplicates', async () => {
  const reportId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const staffId = new mongoose.Types.ObjectId();
  const reviewId = new mongoose.Types.ObjectId();
  const taskId = new mongoose.Types.ObjectId();
  const seen = { reviewFilters: [], taskFilters: [], reviewLinks: 0, taskLinks: 0 };
  const ReviewModel = {
    async findOneAndUpdate(filter) { seen.reviewFilters.push(filter); return { _id: reviewId }; },
    async updateOne() { seen.reviewLinks++; },
  };
  const TaskModel = {
    async findOneAndUpdate(filter) { seen.taskFilters.push(filter); return { _id: taskId }; },
    async updateOne() { seen.taskLinks++; },
  };
  const input = {
    report: { _id: reportId, user: userId, title: '年度报告' },
    staff: { _id: staffId, name: '审核员' },
    requestId: 'request-1',
    abnormalItems: [{ name: '血糖', value: '8.0' }],
  };

  await ensureReportAbnormalReview(input, { ReviewModel, TaskModel });
  await ensureReportAbnormalReview(input, { ReviewModel, TaskModel });

  const expectedKey = `${reportId}:request-1`;
  assert.deepEqual(seen.reviewFilters, [{ sourceReviewRequestId: expectedKey }, { sourceReviewRequestId: expectedKey }]);
  assert.deepEqual(seen.taskFilters, [{ sourceReviewRequestId: expectedKey }, { sourceReviewRequestId: expectedKey }]);
  assert.equal(seen.reviewLinks, 2);
  assert.equal(seen.taskLinks, 2);
});

test('a concurrent unique-key loser reuses the winning review and task', async () => {
  const reportId = new mongoose.Types.ObjectId();
  const reviewId = new mongoose.Types.ObjectId();
  const taskId = new mongoose.Types.ObjectId();
  const duplicate = Object.assign(new Error('duplicate key'), { code: 11000 });
  const ReviewModel = {
    async findOneAndUpdate() { throw duplicate; },
    async findOne() { return { _id: reviewId }; },
    async updateOne() {},
  };
  const TaskModel = {
    async findOneAndUpdate() { throw duplicate; },
    async findOne() { return { _id: taskId }; },
    async updateOne() {},
  };
  const result = await ensureReportAbnormalReview({
    report: { _id: reportId, user: new mongoose.Types.ObjectId(), title: '年度报告' },
    staff: { _id: new mongoose.Types.ObjectId(), name: '审核员' },
    requestId: 'concurrent-request',
    abnormalItems: [{ name: '血糖' }],
  }, { ReviewModel, TaskModel });

  assert.equal(String(result.review._id), String(reviewId));
  assert.equal(String(result.task._id), String(taskId));
});
