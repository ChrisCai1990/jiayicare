import test from 'node:test';
import assert from 'node:assert/strict';
import { screeningView, referenceLines, screeningStatus } from '../src/utils/referralScreeningView.mjs';
test('old laboratory snapshots separate columns without dropping unmatched text',()=>{
 const v=screeningView({结果:'骨钙素 (N-MID) 23.54 参考范围：男 24-68&女 13-45；β-CTx 0.642 参考范围：女 ≤1.108；超声 原始所见'});
 assert.equal(v.rows.length,2);assert.equal(v.rows[0].value,'23.54');assert.equal(v.rows[0].unit,'');assert.deepEqual(v.notes,['超声 原始所见']);assert.deepEqual(referenceLines(v.rows[0].referenceRange),['男 24-68','女 13-45']);
});
test('structured zero and narrative conclusions are preserved',()=>{
 const v=screeningView({结果明细:[{name:'计数',value:0,unit:'个'}],检查所见:'所见原文',报告结论:'结论原文'});
 assert.equal(v.rows[0].value,0);assert.equal(v.findings,'所见原文');assert.equal(v.conclusion,'结论原文');
});

test('abnormal display respects recorded status and exact range boundaries',()=>{
 assert.equal(screeningStatus({status:'abnormal',value:2,referenceRange:'0-3'}).abnormal,true);
 assert.equal(screeningStatus({value:3,referenceRange:'0-3'}).abnormal,false);
 assert.equal(screeningStatus({value:3,referenceRange:'<3'}).abnormal,true);
 assert.equal(screeningStatus({value:3,referenceRange:'≤3'}).abnormal,false);
 assert.equal(screeningStatus({value:0,referenceRange:'1-3'}).label,'↓ 偏低');
 assert.equal(screeningStatus({value:'3↑'}).abnormal,true);
 assert.equal(screeningStatus({value:3,referenceRange:'男 1-2&女 2-4'}).label,'');
 assert.equal(screeningStatus({value:'<3',referenceRange:'0-2'}).label,'');
 assert.equal(screeningStatus({value:3,referenceRange:''}).abnormal,false);
});

test('bounded results flag only certain out-of-range values without inventing review tasks',()=>{
 assert.equal(screeningStatus({value:'>41.00',referenceRange:'0-1.75'}).label,'↑ 偏高');
 assert.equal(screeningStatus({value:'<0.1',referenceRange:'1-2'}).label,'↓ 偏低');
 assert.equal(screeningStatus({value:'<3',referenceRange:'0-2'}).abnormal,false);
 assert.equal(screeningStatus({value:'≥2',referenceRange:'0-2'}).abnormal,false);
});
