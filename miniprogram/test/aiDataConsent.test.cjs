const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), babel = require('@babel/core');
const code = babel.transformSync(fs.readFileSync(require.resolve('../src/utils/aiDataConsent'), 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
function setup(options = {}) {
  const calls = { modal: [], updates: [], notices: [] };
  const item = { purpose: 'assistant', available: true, granted: false, title: 'Test consent', recipient: 'Test supplier', data: 'Selected text', use: 'Reply', optional: 'Optional', subjectId: 'account-a', version: 'v1', revision: 3, ...options.item };
  const api = { list: async () => { if (options.fail) throw new Error('offline'); return { data: [item] }; }, update: async (...args) => { calls.updates.push(args); if (options.stale) throw new Error('account changed'); } };
  const taro = { showModal: async value => { calls.modal.push(value); return { confirm: options.confirm !== false }; }, showToast: value => calls.notices.push(value) };
  const context = { module: { exports: {} }, process: { env: { TARO_ENV: 'h5' } }, window: options.window, require: name => name === '@tarojs/taro' ? taro : { aiDataConsentAPI: api } };
  context.exports = context.module.exports; vm.runInNewContext(code, context);
  return { run: context.exports.ensureAiDataConsent, open: context.exports.openReferenceUrl, calls, item };
}
test('decline and unavailable service never grant; network failure preserves the non-AI path', async () => {
  for (const options of [{ confirm: false }, { item: { available: false } }, { fail: true }]) {
    const s = setup(options); assert.equal(await s.run('assistant'), false); assert.equal(s.calls.updates.length, 0);
  }
});
test('explicit choice binds the described purpose, account, version and revision', async () => {
  const s = setup(); assert.equal(await s.run('assistant'), true);
  assert.match(s.calls.modal[0].content, /Test supplier/); assert.match(s.calls.modal[0].content, /Selected text/);
  assert.equal(JSON.stringify(s.calls.updates[0]), JSON.stringify(['assistant', { subjectId: 'account-a', granted: true, version: 'v1', revision: 3 }]));
  const stale = setup({ stale: true }); await assert.rejects(stale.run('assistant'), /account changed/);
});
test('authorization is fetched anew so a later revocation prompts again', async () => {
  const s = setup({ item: { granted: true }, confirm: false });
  assert.equal(await s.run('assistant'), true); assert.equal(s.calls.modal.length, 0);
  s.item.granted = false; assert.equal(await s.run('assistant'), false); assert.equal(s.calls.modal.length, 1);
});

test('message consent buttons satisfy Taro modal limits so the choice can open', async () => {
  const page = fs.readFileSync(require.resolve('../src/pages/messages/index.jsx'), 'utf8');
  const label = page.match(/ensureAiDataConsent\('assistant',\s*\{\s*cancelText:\s*'([^']+)'/)[1];
  const s = setup({ confirm: false });
  assert.equal(await s.run('assistant', { cancelText: label }), false);
  for (const key of ['cancelText', 'confirmText']) {
    // Taro H5 rejects the entire modal above eight weighted characters.
    assert.ok(s.calls.modal[0][key].replace(/[\u0391-\uFFE5]/g, 'aa').length <= 8, key);
  }
  assert.equal(s.calls.updates.length, 0);
});

test('approved source links navigate even when browser popups are blocked', () => {
  const navigations = [];
  const s = setup({ window: { location: { assign: url => navigations.push(url) }, open: () => { throw new Error('popup blocked'); } } });
  const allowed = 'https://www.who.int/en/news-room/fact-sheets/detail/obesity-and-overweight';
  s.open(allowed);
  for (const url of ['javascript:alert(1)', 'https://www.who.int.attacker.invalid/', 'http://www.who.int/']) s.open(url);
  assert.deepEqual(navigations, [allowed]);
});
