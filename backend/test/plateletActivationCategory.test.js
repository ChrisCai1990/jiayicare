const test = require('node:test');
const assert = require('node:assert/strict');

// The planner is pure; testing it needs no production database or account.
const { selectPath, ALIASES } = require('../src/scripts/ensurePlateletActivationCategory');
const { plateletActivationPanelName } = require('../src/utils/reportMatchContext');
const root = { _id: 'root', name: '其他常规筛查', status: 'active' };
const group = { _id: 'group', parent: 'root', name: '血小板功能', status: 'active' };
const leaf = { _id: 'leaf', parent: 'group', name: '血小板活化四项', status: 'active', aliases: [ALIASES[0]] };

test('creates only missing nodes and aliases in the intended Admin path', () => {
  assert.equal(selectPath([root], []).group, null);
  assert.equal(selectPath([root], [group]).leaf, null);
  assert.deepEqual(selectPath([root], [group, leaf]).missingAliases, ALIASES.slice(1));
});

test('rejects ambiguous or misplaced categories', () => {
  assert.throws(() => selectPath([root, { ...root, _id: 'other' }], []), /唯一/);
  assert.throws(() => selectPath([root], [{ ...group, parent: 'wrong' }]), /其他父分类/);
  assert.throws(() => selectPath([root], [group, { ...leaf, parent: 'wrong' }]), /其他父分类/);
});

test('only the four markers under the printed panel select this category', () => {
  for (const name of ['CD61', 'CD62P', 'CD61抗体(PAC-1)', 'CD61抗体（PAC-1）', 'CD45']) {
    assert.equal(plateletActivationPanelName({ name, sourceSection: '血小板活化四项' }), '血小板活化四项');
  }
  assert.equal(plateletActivationPanelName({ name: 'CD45', sourceSection: '免疫分型' }), '');
  assert.equal(plateletActivationPanelName({ name: '血小板计数', sourceSection: '血小板活化四项' }), '');
});
