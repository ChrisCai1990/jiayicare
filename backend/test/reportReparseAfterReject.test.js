const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a rejected AI review may start a new full-report parse despite its completed historical job', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf("router.post('/medical-reports/:id/parse-ai'");
  const end = source.indexOf("router.post('/medical-reports/:id/parse-page'", start);
  const route = source.slice(start, end);

  assert.match(route, /retryAfterRejectedReview\s*=\s*report\.aiStatus\s*===\s*'none'\s*&&\s*report\.audit_status\s*!==\s*'audited'/);
  assert.match(route, /report\.parseJob\?\.status\s*===\s*'completed'\s*&&\s*!retryAfterRejectedReview/);
  assert.match(route, /report\.audit_status\s*===\s*'audited'/);
});
