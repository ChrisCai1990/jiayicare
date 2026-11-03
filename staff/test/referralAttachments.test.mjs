import test from 'node:test';
import assert from 'node:assert/strict';
import { currentRecords, screeningAttachments, diseaseHistoryAttachments } from '../src/utils/referralAttachments.mjs';

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
test('disease history includes current structured records and does not equate missing with none', () => {
  assert.deepEqual(diseaseHistoryAttachments({}), []);
  assert.equal(diseaseHistoryAttachments({coreHealthArchive:{disease:{presence:'unknown'}}})[0].记录,'疾病史不详，需进一步核实');
  const rows = diseaseHistoryAttachments({coreHealthArchive:{disease:{records:[{disease:'甲',status:'稳定',treatment:'既往治疗'},{disease:'乙',institution:'机构'}]}}});
  assert.equal(rows.length,2);
  assert.equal(rows[0].当前状态,'稳定');
  assert.equal(rows[0].治疗经过,'既往治疗');
  assert.equal(rows[1].诊断机构,'机构');
});
