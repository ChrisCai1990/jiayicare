import test from 'node:test';
import assert from 'node:assert/strict';
import { currentRecords, screeningAttachments } from '../src/utils/referralAttachments.mjs';

test('current records exclude stopped, pending, rejected, expired and future records', () => {
  const rows = [{name:'current'}, {name:'stopped',stopped:true}, {aiStatus:'pending'}, {aiStatus:'rejected'},
    {endDate:'2026-11-02'}, {startDate:'2026-11-04'}, {name:'boundary',startDate:'2026-11-03',endDate:'2026-11-03'}];
  assert.deepEqual(currentRecords(rows,'2026-11-03').map(r=>r.name), ['current','boundary']);
});

test('screening snapshot keeps all matched results including zero and avoids duplicate report', () => {
  const result = screeningAttachments([{_id:'a',itemLabel:'专项', reportId:'r',matchedItems:[{name:'A',value:0},{name:'B',value:2,unit:'mg'}]}],
    [{_id:'r',screeningL1:'x'}, {_id:'s',title:'超声',screeningL1:'x',examConclusion:'原报告结论'}]);
  assert.equal(result.length,2);
  assert.match(result[0].结果,/A 0；B 2 mg/);
  assert.equal(result[1].结果,'原报告结论');
  assert.equal(result[0].reportId,undefined);
});
