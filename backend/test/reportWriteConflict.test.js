const test = require('node:test');
const assert = require('node:assert/strict');
const { sendReportWriteConflict } = require('../src/utils/reportWriteConflict');
test('report write conflict provides a stable 409 and actionable message', () => {
  let status, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  assert.equal(sendReportWriteConflict(res), res);
  assert.equal(status, 409);
  assert.equal(body.code, 'REPORT_WRITE_CONFLICT');
  assert.equal(body.success, false);
  assert.match(body.message, /刷新后重试/);
});
