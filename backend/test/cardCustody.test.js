const test = require('node:test');
const assert = require('node:assert/strict');
const { prepare } = require('../src/utils/cardCustody');
const at = '2026-11-20T09:00:00Z';
const now = new Date('2026-11-20T12:00:00Z');
const body = { person: '交接人', location: 'A柜', at, purpose: '取药', dueAt: '2026-11-21T09:00:00Z' };
const staff = { _id: 'staff', name: '经办员工' };
function step(action, previous, overrides) {
  const change = prepare({ ...body, action, ...overrides }, previous, staff, now);
  return { state: change.state, current: change.event };
}
test('连续寄存、借出、还库、客户取回，可再次寄存', () => {
  let record;
  for (const [action, expected] of [['deposit','stored'],['lend','lent'],['return','stored'],['release','released'],['deposit','stored']]) {
    record = step(action, record);
    assert.equal(record.state, expected);
    assert.equal(record.current.actor, staff.name);
  }
});
test('借出后允许客户直接取回，拦截重复借出和未入库归还', () => {
  const lent = step('lend', step('deposit'));
  assert.throws(() => step('lend', lent));
  assert.throws(() => step('return'));
  assert.equal(step('release', lent).state, 'released');
});
test('拒绝无领卡人、无地点、无用途、倒签和无效的预计归还时间', () => {
  const stored = step('deposit');
  for (const overrides of [{ person: ' ' }, { purpose: '' }, { location: '' }, { at: '2001-01-01' }, { at: '2030-01-01' }, { dueAt: at }, { dueAt: 'bad' }]) {
    assert.throws(() => step('lend', stored, overrides));
  }
});
