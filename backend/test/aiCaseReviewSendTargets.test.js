const test = require('node:test');
const assert = require('node:assert/strict');
const { acceptSend, finishSend } = require('../src/utils/aiCaseReviewSend');

function modelFor(conclusion) {
  const topic = {
    _id: 'topic', user: 'patient', __v: 0, status: 'active', messages: [],
    generation: {}, conclusion,
  };
  return {
    findOne: async () => topic,
    findOneAndUpdate: async (_filter, update) => {
      topic.conclusion = update.$set.conclusion;
      topic.generation = update.$set.generation;
      topic.messages.push(update.$push.messages);
      topic.conclusionHistory = update.$push.conclusionHistory ? [update.$push.conclusionHistory] : [];
      return topic;
    },
  };
}

const input = { patientId: 'patient', topicId: 'topic', staff: { _id: 'staff', name: 'Test', role: 'advisor' },
  content: '测试提问', attachments: [], requestId: 'target_preserve_test_01' };
const targets = [{ goal: '目标一', focus: '重点一', nutritionRelevant: true }];

test('sending a question preserves draft management targets', async () => {
  const { topic } = await acceptSend(modelFor({ status: 'draft', managementTargets: targets }), input);
  assert.deepEqual(topic.conclusion.managementTargets, targets);
  assert.equal(topic.conclusion.status, 'draft');
  assert.equal(topic.conclusionHistory.length, 0);
});

test('sending after confirmation archives the conclusion and retains its targets as draft', async () => {
  const { topic } = await acceptSend(modelFor({ status: 'confirmed', content: '已确认结论',
    confirmedAt: new Date('2026-10-03T00:00:00Z'), confirmedBy: 'staff', confirmedByName: 'Test',
    managementTargets: targets }), input);
  assert.deepEqual(topic.conclusion.managementTargets, targets);
  assert.equal(topic.conclusion.status, 'draft');
  assert.equal(topic.conclusionHistory[0].content, '已确认结论');
  assert.deepEqual(topic.conclusionHistory[0].managementTargets, targets);
});

test('automatic AI proposals are saved as draft targets with the first reply', async () => {
  let update;
  const model = { updateOne: async (_filter, value) => { update = value; } };
  const topic = { _id: 'topic', generation: { status: 'running', token: 'token', requestId: 'auto_topic_1234567890' },
    conclusion: { status: 'draft', managementTargets: [] } };
  await finishSend(model, topic, async () => ({
    result: { content: '初步分析', managementTargets: targets, provider: 'qwen', model: 'qwen-plus' },
    snapshot: { sources: ['最近一次体检报告'] },
  }));
  assert.deepEqual(update.$set['conclusion.managementTargets'], targets);
  assert.equal(update.$push.messages.content, '初步分析');
});

test('complete reanalysis adds missing draft targets while retaining existing entries', async () => {
  let update;
  const model = { updateOne: async (_filter, value) => { update = value; } };
  const topic = { _id: 'topic', generation: { status: 'running', token: 'token', requestId: 'review_1234567890123456' },
    conclusion: { status: 'draft', managementTargets: targets } };
  const added = { goal: '肺磨玻璃结节：明确随访安排', focus: '核对报告并确定复评时间', nutritionRelevant: false };
  await finishSend(model, topic, async () => ({ result: { content: '年度重整', managementTargets: [...targets, added] }, snapshot: { sources: [] } }));
  assert.deepEqual(update.$set['conclusion.managementTargets'], [...targets, added]);
});
