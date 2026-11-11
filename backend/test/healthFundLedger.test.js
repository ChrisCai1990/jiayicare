const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeHealthFundLedger } = require('../src/utils/healthFundLedger');

test('same enterprise gift is shown once when gift record and fund transaction coexist', () => {
  const createdAt = new Date('2026-08-16T07:49:00Z');
  const rows = mergeHealthFundLedger(
    [{ _id:'tx1', type:'grant', source:'enterprise', amount:500, remark:'健康基金赠送', createdAt }],
    [{ _id:'gift1', fundType:'enterprise', fundAmount:500, remark:'企业赠送健康基金', createdAt }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._id, 'tx1');
});

test('legacy gift without a matching fund transaction remains visible', () => {
  const rows = mergeHealthFundLedger([], [
    { _id:'gift1', fundType:'enterprise', fundAmount:500, createdAt:new Date('2026-08-16T07:49:00Z') },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 500);
});

test('historical points conversions display as enterprise-gifted fund', () => {
  const rows = mergeHealthFundLedger([
    { _id:'tx1', type:'grant', source:'promotion', amount:3, remark:'300积分自动兑换3元健康基金', createdAt:new Date() },
  ]);
  assert.equal(rows[0].source, 'enterprise');
});

test('legacy and current activation rewards display as reward fund', () => {
  const rows = mergeHealthFundLedger([
    { _id:'old', type:'grant', source:'promotion', amount:100, remark:'首次使用小程序健康基金奖励', createdAt:new Date('2026-08-20') },
    { _id:'new', type:'grant', source:'enterprise', amount:50, remark:'首次完成健康问卷奖励基金', createdAt:new Date('2026-11-11') },
  ]);
  assert.deepEqual(rows.map(row => row.source), ['enterprise', 'enterprise']);
});
