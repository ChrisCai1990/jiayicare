const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the actual startup code with no network, timers or database access.
async function runDatabase(flag) {
  const calls = [];
  const schema = { collection: {
    indexes: async () => [{ name: 'patientId_1_year_1' }, { name: 'user_1_itemId_1' }],
    dropIndex: async name => calls.push(['drop', name]),
  }, syncIndexes: async () => calls.push(['sync']) };
  const mongoose = { set: (key, value) => calls.push(['set', key, value]),
    connect: async () => { calls.push(['connect']); return { connection: { host: 'isolated' } }; } };
  const context = { module: { exports: {} }, console: { log() {}, error() {} },
    process: { env: flag === undefined ? {} : { STARTUP_SCHEMA_WRITES_ENABLED: flag }, exit: () => assert.fail('unexpected exit') },
    require: name => { if (name === 'mongoose') return mongoose; calls.push(['model', name]); return schema; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/config/db.js'), 'utf8'), context);
  await context.module.exports();
  return calls;
}

test('disabled schema startup configures mongoose before connect and never loads migration models', async () => {
  assert.deepEqual(await runDatabase('false'), [
    ['set', 'autoIndex', false], ['set', 'autoCreate', false], ['connect'],
  ]);
});
test('unspecified schema control preserves existing startup migrations', async () => {
  const calls = await runDatabase();
  assert.equal(calls.filter(x => x[0] === 'drop').length, 2);
  assert.equal(calls.filter(x => x[0] === 'sync').length, 2);
});

function runBackground(flag) {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const marker = 'app.listen(PORT, () => {';
  const offset = source.indexOf(marker);
  assert.notEqual(offset, -1);
  const calls = [];
  const moduleMock = new Proxy({}, { get: (_, name) => () => { calls.push(String(name)); return Promise.resolve(); } });
  vm.runInNewContext(source.slice(offset), {
    app: { listen: (_, callback) => callback() }, PORT: 3000,
    process: { env: flag === undefined ? {} : { STARTUP_BACKGROUND_JOBS_ENABLED: flag } },
    console: { log() {}, error() {} }, require: name => { calls.push(name); return moduleMock; },
    setTimeout: () => calls.push('timer'), staffRouter: {},
  });
  return calls;
}
test('disabled background startup imports no workers and schedules no parse recovery', () => {
  assert.deepEqual(runBackground('false'), []);
});
test('unspecified background control preserves existing worker registration', () => {
  const calls = runBackground();
  for (const expected of ['timer', 'startScheduledFollowUpWindowScheduler', 'startReportDraftWorker', 'ensurePhaseAssessmentTemplateDrafts']) {
    assert.ok(calls.includes(expected), expected);
  }
});
