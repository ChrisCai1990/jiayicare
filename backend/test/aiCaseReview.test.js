const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AiCaseReview = require('../src/models/AiCaseReview');

const id = () => new mongoose.Types.ObjectId();

test('AI研判主题默认保存在本系统并使用通义千问', () => {
  const topic = new AiCaseReview({ user: id(), title: '近期血压波动', createdBy: id() });
  const error = topic.validateSync();
  assert.equal(error, undefined);
  assert.equal(topic.preferredProvider, 'qwen');
  assert.equal(topic.status, 'active');
});

test('AI消息保留供应商、资料快照和图文附件审计信息', () => {
  const topic = new AiCaseReview({
    user: id(), title: '报告图文复核', createdBy: id(),
    messages: [{ role: 'ai', content: '需要进一步复核原报告。', provider: 'qwen', providerModel: 'qwen-plus', evidenceRefs: ['2026-08-01 · 年度体检'], contextSnapshot: { capturedAt: new Date(), sources: ['2026-08-01 · 年度体检'] }, attachments: [{ name: '结果图.png', url: '/api/uploads/a.png', mimeType: 'image/png' }] }],
  });
  assert.equal(topic.validateSync(), undefined);
  assert.equal(topic.messages[0].provider, 'qwen');
  assert.equal(topic.messages[0].attachments[0].mimeType, 'image/png');
});

test('正式结论必须显式确认，草稿不会被视为已确认', () => {
  const topic = new AiCaseReview({ user: id(), title: '睡眠问题', createdBy: id(), conclusion: { content: '待补充睡眠日志。' } });
  assert.equal(topic.conclusion.status, 'draft');
  topic.conclusion.status = 'confirmed';
  topic.conclusion.confirmedAt = new Date();
  topic.conclusion.confirmedBy = id();
  assert.equal(topic.validateSync(), undefined);
  assert.equal(topic.conclusion.status, 'confirmed');
});
