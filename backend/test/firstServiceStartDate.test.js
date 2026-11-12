const test = require('node:test');
const assert = require('node:assert/strict');
const { firstServiceStartDateUpdate } = require('../src/utils/firstServiceStartDate');

test('首次服务开始日期只能初始化一次，续期不改原日期', () => {
  assert.deepEqual(firstServiceStartDateUpdate('', '2025-12-31'), { write: true, value: '2025-12-31' });
  assert.deepEqual(firstServiceStartDateUpdate('2025-12-31', undefined), { write: false });
  assert.deepEqual(firstServiceStartDateUpdate('2025-12-31', '2025-12-31'), { write: false });
  assert.throws(() => firstServiceStartDateUpdate('2025-12-31', '2026-12-31'), { statusCode: 409 });
  assert.throws(() => firstServiceStartDateUpdate('2025-12-31', ''), { statusCode: 409 });
  assert.throws(() => firstServiceStartDateUpdate('', '2026-02-30'), { statusCode: 400 });
});
