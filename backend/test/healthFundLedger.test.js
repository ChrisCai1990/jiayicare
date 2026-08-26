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
