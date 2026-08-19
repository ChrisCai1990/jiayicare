const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('OCR policy is available to every report route, including reparse claims', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const policyImport = source.indexOf("require('../config/ocrPolicy')");
  const parseFunction = source.indexOf('async function runReportParse');

  assert.ok(policyImport >= 0);
  assert.ok(parseFunction >= 0);
  assert.ok(policyImport < parseFunction, 'OCR policy must be loaded at module scope');
});
