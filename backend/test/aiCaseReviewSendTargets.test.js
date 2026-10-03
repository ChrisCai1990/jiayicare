const test = require('node:test');
const assert = require('node:assert/strict');
const { acceptSend } = require('../src/utils/aiCaseReviewSend');

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
