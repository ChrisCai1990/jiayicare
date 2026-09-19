const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/pages/messages/index.jsx'), 'utf8');
const start = source.indexOf('  const loadMessages = useCallback');
const end = source.indexOf('\n  useDidShow', start);
const success = data => ({ success: true, data });
function harness() {
  const state = { messages: [], pending: new Set(), assignments: new Set(), error: '', loading: true };
  const responses = { messages: success([]), pushes: success([]), pending: success([]) };
  const resolve = key => async () => { const r = responses[key]; if (r instanceof Error) throw r; return await r; };
  const ctx = { useCallback: f => f, listRequestRef: { current: 0 }, listLoadingRef: { current: false },
    messagesAPI: { list: resolve('messages') }, pushRecordsAPI: { list: resolve('pushes') }, questionnaireAPI: { pending: resolve('pending') },
    normalizePushRecord: r => ({ ...r, isPushRecord: true }), refreshUnreadBadge() {},
    setMessages: f => { state.messages = typeof f === 'function' ? f(state.messages) : f; },
    setPendingQuestionnaireIds: value => { state.pending = value; },
    setPendingQuestionnaireAssignmentIds: value => { state.assignments = value; },
    setLoadError: value => { state.error = value; }, setLoading: value => { state.loading = value; },
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.load = loadMessages;', ctx);
  return { state, responses, ctx, load: () => ctx.load() };
}
test('first-load questionnaire failure does not suppress conversations and historical notifications', async () => {
  const h = harness();
  h.responses.messages = success([{ _id: 'care', type: 'system' }, { _id: 'chat', type: 'planner' }]);
  h.responses.pushes = success([{ _id: 'push', type: 'plan' }]);
  h.responses.pending = new Error('500');
  await h.load();
  assert.equal(h.state.messages.length, 3); assert.match(h.state.error, /待填问卷/);
  assert.equal(h.state.loading, false);
});
test('failed source preserves its previous records; successful empty response clears only its own source', async () => {
  const h = harness();
  h.responses.messages = success([{ _id: 'care' }]); h.responses.pushes = success([{ _id: 'push' }]);
  h.responses.pending = success([{ _id: 'q', assignmentId: 'push' }]); await h.load();
  h.responses.messages = success([]); h.responses.pushes = { success: false }; h.responses.pending = new Error('offline');
  await h.load(); assert.equal(h.state.messages.length, 1); assert.equal(h.state.messages[0]._id, 'push');
  assert.ok(h.state.assignments.has('push'));
  h.responses.pushes = success([]); h.responses.pending = success([]); await h.load();
  assert.equal(h.state.messages.length, 0); assert.equal(h.state.assignments.size, 0); assert.equal(h.state.error, '');
});
test('stale list response cannot overwrite a more recent refresh', async () => {
  const h = harness(); let finish;
  h.responses.messages = new Promise(resolve => { finish = resolve; }); const old = h.load();
  h.responses.messages = success([{ _id: 'new' }]); await h.load();
  finish(success([{ _id: 'old' }])); await old;
  assert.equal(h.state.messages[0]._id, 'new');
});
test('notification overlay exposes load failure and tab changes mark the selected category read', () => {
  assert.match(source, /setTab=\{openNotifications\}/);
  assert.match(source, /loadError=\{loadError\}/);
  assert.match(source, /部分消息加载失败，请点击上方重试/);
});
test('background polling does not supersede requests slower than five seconds', async () => {
  const h = harness(); let finish; let poll;
  h.responses.messages = new Promise(resolve => { finish = resolve; });
  const request = h.load();
  const timerStart = source.indexOf('    listPollRef.current = setInterval(');
  const timerEnd = source.indexOf('\n  });', timerStart);
  vm.runInNewContext(source.slice(timerStart, timerEnd), { ...h.ctx, listPollRef: { current: null },
    setInterval: callback => { poll = callback; }, loadMessages: h.ctx.load });
  poll(); poll();
  assert.equal(h.ctx.listRequestRef.current, 1);
  finish(success([{ _id: 'slow' }])); await request;
  assert.equal(h.state.messages[0]._id, 'slow'); assert.equal(h.ctx.listLoadingRef.current, false);
});
