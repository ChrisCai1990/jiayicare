import test from 'node:test';
import assert from 'node:assert/strict';
import { screeningView, referenceLines } from '../src/utils/referralScreeningView.mjs';
test('old laboratory snapshots separate columns without dropping unmatched text',()=>{
 const v=screeningView({结果:'骨钙素 (N-MID) 23.54 参考范围：男 24-68&女 13-45；β-CTx 0.642 参考范围：女 ≤1.108；超声 原始所见'});
 assert.equal(v.rows.length,2);assert.equal(v.rows[0].value,'23.54');assert.equal(v.rows[0].unit,'');assert.deepEqual(v.notes,['超声 原始所见']);assert.deepEqual(referenceLines(v.rows[0].referenceRange),['男 24-68','女 13-45']);
});
test('structured zero and narrative conclusions are preserved',()=>{
 const v=screeningView({结果明细:[{name:'计数',value:0,unit:'个'}],检查所见:'所见原文',报告结论:'结论原文'});
 assert.equal(v.rows[0].value,0);assert.equal(v.findings,'所见原文');assert.equal(v.conclusion,'结论原文');
});
