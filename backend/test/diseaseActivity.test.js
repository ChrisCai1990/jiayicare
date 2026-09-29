const test = require('node:test');
const assert = require('node:assert/strict');
const { diseaseActivity } = require('../src/utils/diseaseActivity');
const { changeStamp, summaryCoverageState } = require('../../shared/diseaseSummary.cjs');
test('staff-initiated unpaid assistance groups original plan tasks and results without an order', () => {
  const groups = diseaseActivity({ plans: [{ _id:'p', title:'医护发起', status:'active' }],
    records: [{ _id:'r', sourceHealthPlanId:'p', diseaseName:'眩晕' }],
    tasks: [{ _id:'t', sourceHealthPlanId:'p', status:'planned' }, { _id:'t2', sourceHealthPlanId:'p', status:'completed' }],
    diseases: [{ _id:'d', name:'眩晕' }] });
  assert.equal(groups.length, 1); assert.equal(groups[0].status, 'active');
  assert.deepEqual(groups[0].diseaseIds, ['d']); assert.equal(groups[0].tasks.length, 2);
});
test('service titles never infer a disease; explicit stable ID links survive disease renames', () => {
  const input = { records: [{ _id:'r', title:'眩晕服务', type:'medical_visit' }], diseases:[{_id:'d',name:'眩晕'}] };
  assert.deepEqual(diseaseActivity(input)[0].diseaseIds, []);
  input.diseases[0] = { _id:'d',name:'新的名称',serviceLinks:[{key:'record:r'}] };
  assert.deepEqual(diseaseActivity(input)[0].diseaseIds, ['d']);
});
test('record/order links survive later plan aggregation; ambiguous orders do not merge separate plans', () => {
  const groups = diseaseActivity({ plans:[{_id:'p',sourceOrderId:'o',status:'draft'}],records:[{_id:'r',sourceOrderId:'o'}],diseases:[{_id:'d',serviceLinks:[{key:'order:o'}]}] });
  assert.equal(groups.length,1); assert.deepEqual(groups[0].diseaseIds,['d']);
  const ambiguous=diseaseActivity({plans:[{_id:'p1',sourceOrderId:'o'},{_id:'p2',sourceOrderId:'o'}],records:[{_id:'r',sourceOrderId:'o'}]});
  assert.equal(ambiguous.length,3);
});
test('a recorded service is not a completed service; cancelled and unfinished tasks stay distinct', () => {
  const records=diseaseActivity({records:[{_id:'r',result:'已有结果'}]});
  assert.equal(records[0].status,'recorded');
  const tasks=diseaseActivity({tasks:[{_id:'t1',sourceOrderId:'o',status:'completed'},{_id:'t2',sourceOrderId:'o',status:'cancelled'},{_id:'t3',sourceOrderId:'o',status:'in_progress'}]});
  assert.equal(tasks[0].status,'tasks'); assert.deepEqual(tasks[0].taskCounts,{completed:1,cancelled:1,in_progress:1});
});
test('summary coverage uses clinical record versions, not service linkage or occurrence date alone', () => {
  const e={_id:'e',occurredAt:'2024-01-01',recordedAt:new Date('2026-09-29T01:00:00Z')};
  assert.deepEqual(changeStamp(e),changeStamp(JSON.parse(JSON.stringify(e))));
  const record={summary:{coveredChanges:[changeStamp(e)]},courseEntries:[e]};
  assert.equal(summaryCoverageState(record).pendingCount,0);
  e.updatedAt='2026-09-29T02:00:00Z'; assert.equal(summaryCoverageState(record).pendingCount,1);
  assert.equal(summaryCoverageState({summary:{updatedAt:'2026-09-17'},courseEntries:[e]}).pendingCount,1);
  assert.equal(summaryCoverageState({summary:{},courseEntries:[]}).coverageKnown,false);
});
