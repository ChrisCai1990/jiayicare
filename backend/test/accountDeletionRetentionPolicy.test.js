const test=require('node:test'),assert=require('node:assert/strict');
const {voucherRetention,validateVoucherRetention}=require('../src/utils/accountDeletionRetentionPolicy');
test('thirty complete years start after the accounting year, in China time',()=>{
 const p=voucherRetention(2026);
 assert.equal(p.retentionStartsAt.toISOString(),'2026-12-31T16:00:00.000Z');
 assert.equal(p.minimumRetainUntil.toISOString(),'2056-12-31T16:00:00.000Z');
 assert.equal(p.automaticDestruction,false);assert.equal(p.expiryAction,'appraisal_required');
 assert.equal(voucherRetention(2024).minimumRetainUntil.toISOString(),'2054-12-31T16:00:00.000Z');
});
test('missing year cannot silently become the deletion year, and shorter periods fail',()=>{
 for(const value of [undefined,null,'2026',2026.5,0])assert.throws(()=>voucherRetention(value));
 assert.throws(()=>validateVoucherRetention({accountingYear:2026,retainUntil:'2056-12-31T15:59:59.999Z'},new Date('2026-10-28')));
 assert.doesNotThrow(()=>validateVoucherRetention({accountingYear:2026,retainUntil:'2056-12-31T16:00:00Z'},new Date('2026-10-28')));
 assert.throws(()=>validateVoucherRetention({accountingYear:2027,retainUntil:'2058-01-01'},new Date('2026-12-31T15:59:59Z')));
 assert.doesNotThrow(()=>validateVoucherRetention({accountingYear:2027,retainUntil:'2058-01-01'},new Date('2026-12-31T16:00:00Z')));
});
