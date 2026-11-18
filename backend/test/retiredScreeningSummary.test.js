const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('old annual screening summary writes are stopped for every customer', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.use('/patients/:id/screening-year-summaries/:year'");
  const end = source.indexOf("router.put('/patients/:id/screening-year-summaries/:year'", start);
  assert.ok(start >= 0 && end > start);
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    router: { use(_path, _auth, callback) { handler = callback; } }, staffAuth() {},
  });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  handler({}, response);
  assert.equal(response.statusCode, 410);
  assert.match(response.body.message, /已停用/);
});
