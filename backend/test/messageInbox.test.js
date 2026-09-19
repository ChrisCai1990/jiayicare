const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sift = require('sift').default;
const inbox = require('../src/utils/messageInbox');
const roles = require('../src/utils/conversationRoles');

const user = 'patient-1';
const record = (id, extra = {}) => ({ _id: id, user, type: 'planner', unread: true, createdAt: '2026-09-19', ...extra });

function routeHarness({ messages = [], pushes = [], questionnaires = [], responses = [], orders = [] } = {}) {
  const routes = new Map();
  const model = rows => ({ find(query) {
    let result = rows.filter(sift(query));
    const chain = {
      select() { return chain; }, lean() { return chain; },
      sort() { result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); return chain; },
      limit(n) { result = result.slice(0, n); return chain; },
      distinct(key) { return Promise.resolve([...new Set(result.map(row => row[key]))]); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return chain;
  } });
  const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
  const mocks = {
    express: { Router: () => router }, '../middleware/auth': () => {},
    '../models/Message': model(messages), '../models/PushRecord': model(pushes), '../models/Order': model(orders),
    '../models/DynamicQuestionnaire': { DynamicQuestionnaire: model(questionnaires), QuestionnaireResponse: model(responses) },
    '../utils/messageInbox': inbox, '../utils/conversationRoles': roles,
    '../utils/oss': { signStoredUrl: value => value },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/messages'), 'utf8'), {
    require: name => mocks[name] || {}, module: { exports: {} }, console,
  });
  return async path => {
    let result;
    await routes.get(`get ${path}`)({ user: { _id: user }, query: {} }, { json: value => { result = value; } });
    return result;
  };
}

test('badge excludes recalled messages, AI drafts and user-sent legacy unread flags', async () => {
  const call = routeHarness({ messages: [record('visible'), record('draft', { aiGenerated: true, aiReviewStatus: 'pending' }),
    record('rejected', { aiGenerated: true, aiReviewStatus: 'rejected' }), record('recalled', { recalled: true }),
    record('mine', { type: 'user' }), record('approved', { aiGenerated: true, aiReviewStatus: 'approved' })] });
  assert.equal((await call('/unread-count')).count, 2);
  assert.deepEqual(Array.from((await call('/')).data, row => row._id).sort(), ['approved', 'mine', 'visible']);
});

test('old unread remains reachable even after more than 50 new read messages', async () => {
  const messages = Array.from({ length: 60 }, (_, i) => record(`read-${i}`, { unread: false }));
  messages.push(record('old-unread', { createdAt: '2025-01-01' }));
  const call = routeHarness({ messages });
  const list = await call('/');
  assert.equal(list.data.length, 51);
  assert.equal(list.data.at(-1)._id, 'old-unread');
  assert.equal((await call('/unread-count')).count, 1);
});

test('missing, inactive, deleted, answered and cancelled-order questionnaires cannot create phantom badges', async () => {
  const ids = ['active', 'inactive', 'deleted', 'missing', 'answered', 'cancelled'];
  const pushes = ids.map(id => ({ _id: `push-${id}`, patientId: user, readAt: null, type: 'questionnaire', questionnaireId: id,
    ...(id === 'cancelled' ? { sourceOrderId: 'order-1' } : {}) }));
  const questionnaires = ids.filter(id => id !== 'missing').map(id => ({ _id: id, status: id === 'inactive' ? 'draft' : 'active', deletedAt: id === 'deleted' ? '2026-09-18' : null }));
  const call = routeHarness({ pushes, questionnaires, responses: [{ user, pushRecordId: 'push-answered' }], orders: [{ _id: 'order-1', status: 'cancelled' }] });
  assert.equal((await call('/unread-count')).count, 1);
});

test('another patient and unknown conversation channels never affect this badge', async () => {
  const call = routeHarness({ messages: [record('other', { user: 'patient-2' }), record('unknown', { conversationId: `${user}_unknown` }), record('legacy'), record('reassigned', { type: 'manager', conversationId: `${user}_planner` })] });
  assert.equal((await call('/unread-count')).count, 2);
});

test('merging recent and unread records deduplicates identities without deleting history', () => {
  const a = record('a'); const b = record('b', { createdAt: '2025-01-01' });
  assert.deepEqual(inbox.mergeInboxRecords([a], [a, b]).map(row => row._id), ['a', 'b']);
});
