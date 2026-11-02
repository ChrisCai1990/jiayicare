const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const patientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const staffId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const tenantId = 'cccccccccccccccccccccccc';
const messageId = 'dddddddddddddddddddddddd';

function fixture({ assigned = true, messageUser = patientId, existing = null, createFails = false } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const snippet = source.split('async function chatMaterialPatient')[1].split('// ── 获取某用户的对话线程')[0];
  const handlers = {};
  let postMiddlewareCount = 0;
  const copied = [];
  const deleted = [];
  let created;
  const urls = ['https://private/messages/one.jpg', 'https://private/messages/two.png'];
  const oss = {
    signStoredUrl: url => `${url}?signed=1`,
    urlToKey: url => url.replace('https://private/', ''),
    copyMessageImageToReport: async key => { copied.push(key); return { key: key.replace('messages/', 'reports/'), url: `https://private/${key.replace('messages/', 'reports/')}` }; },
    deleteFile: async key => { deleted.push(key); },
  };
  const context = {
    router: {
      get: (route, _auth, handler) => { handlers.get = handler; },
      post: (...args) => { postMiddlewareCount = args.length - 2; handlers.post = args.at(-1); },
    },
    staffAuth: () => {}, checkPermission: () => () => {},
    mongoose: { isValidObjectId: value => /^[a-f0-9]{24}$/.test(String(value)) },
    User: { findOne: () => ({ select: () => ({ lean: async () => ({ _id: patientId, tenantId, assignedHealthManager: assigned ? staffId : 'eeeeeeeeeeeeeeeeeeeeeeee' }) }) }) },
    Message: {
      find: () => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [{ _id: messageId, imageUrls: urls, createdAt: new Date(), recipient: 'manager' }] }) }) }) }) }),
      findOne: () => ({ select: () => ({ lean: async () => messageUser === patientId ? { imageUrls: urls, createdAt: new Date() } : null }) }),
    },
    MedicalReport: {
      findOne: async () => existing,
      create: async value => { if (createFails) throw new Error('database unavailable'); created = value; return { _id: 'ffffffffffffffffffffffff', ...value }; },
    },
    require: name => { assert.equal(name, '../utils/oss'); return oss; },
    withSignedReportFiles: value => value,
    console: { error: () => {} }, Date, Set, String, Number,
  };
  vm.runInNewContext(`async function chatMaterialPatient${snippet}`, context);
  const call = async (method, overrides = {}) => {
    const req = { staff: { _id: staffId, tenantId, role: 'healthManager' }, params: { id: patientId, messageId }, query: {}, ...overrides };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await handlers[method](req, res);
    return res;
  };
  return { call, copied, deleted, postMiddlewareCount, get created() { return created; } };
}

test('chat image archive follows existing report upload authorization', () => {
  assert.equal(fixture().postMiddlewareCount, 1);
});

test('assigned staff sees signed customer chat images as source material', async () => {
  const result = await fixture().call('get');
  assert.equal(result.code, 200);
  assert.equal(result.payload.data[0].imageUrls[0], 'https://private/messages/one.jpg?signed=1');
});

test('another staff member cannot read or archive images', async () => {
  const f = fixture({ assigned: false });
  assert.equal((await f.call('get')).code, 403);
  assert.equal((await f.call('post')).code, 403);
  assert.equal(f.copied.length, 0);
});

test('archiving copies every image and records the source message', async () => {
  const f = fixture();
  const result = await f.call('post');
  assert.equal(result.code, 200);
  assert.deepEqual(f.copied, ['messages/one.jpg', 'messages/two.png']);
  assert.equal(f.created.sourceChatMessageId, messageId);
  assert.equal(f.created.documentCategory, 'other_customer_material');
  assert.equal(f.created.audit_status, 'unaudited');
});

test('repeat archive reuses the report and failed writes remove copies', async () => {
  const report = { _id: 'ffffffffffffffffffffffff' };
  const previous = fixture({ existing: report });
  assert.equal((await previous.call('post')).payload.duplicate, true);
  assert.equal(previous.copied.length, 0);
  const failed = fixture({ createFails: true });
  assert.equal((await failed.call('post')).code, 500);
  assert.deepEqual(failed.deleted, ['reports/one.jpg', 'reports/two.png']);
});

test('a message without this customer cannot be archived', async () => {
  const f = fixture({ messageUser: 'eeeeeeeeeeeeeeeeeeeeeeee' });
  assert.equal((await f.call('post')).code, 400);
  assert.equal(f.copied.length, 0);
});
