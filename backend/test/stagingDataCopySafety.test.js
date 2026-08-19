const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafety } = require('../scripts/copy-production-to-staging-sanitized');

const salt = '12345678901234567890123456789012';
const confirm = 'create-isolated-anonymized-staging-copy-v1';

test('dry-run permits inspection without a target or anonymization salt', () => {
  assert.doesNotThrow(() => assertSafety({ sourceDbName: 'jiayicare', apply: false }));
});

test('copy refuses a source other than the production baseline database', () => {
  assert.throws(() => assertSafety({ sourceDbName: 'jiayicare_staging', apply: false }), /拒绝读取/);
});

test('apply can write only a new isolated import database with explicit confirmation', () => {
  assert.doesNotThrow(() => assertSafety({
    sourceDbName: 'jiayicare',
    targetDbName: 'jiayicare_staging_import_20260819_a1',
    apply: true,
    confirm,
    salt,
  }));
  assert.throws(() => assertSafety({ sourceDbName: 'jiayicare', targetDbName: 'jiayicare_staging', apply: true, confirm, salt }), /临时库/);
  assert.throws(() => assertSafety({ sourceDbName: 'jiayicare', targetDbName: 'jiayicare_staging_import_x', apply: true, confirm: 'wrong', salt }), /确认值/);
  assert.throws(() => assertSafety({ sourceDbName: 'jiayicare', targetDbName: 'jiayicare_staging_import_x', apply: true, confirm, salt: 'short' }), /32 个字符/);
});
