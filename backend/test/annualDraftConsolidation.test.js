const test = require('node:test');
const assert = require('node:assert/strict');
const { revise } = require('../../scripts/consolidate_annual_draft_20261007.cjs');
const names = ['颈动脉超声弹性成像','胃镜复查周期确认、PPI或胆汁结合剂评估','低剂量胸部CT随访时间确认'];
function fixture() {return {
 management_targets:{records:names.map((goal,i)=>({goal,issueId:String(i)}))},
 medical_treatment:{records:names.map((goal,i)=>({basisSummary:goal,reason:goal,timingSourceId:`report:${i}:0`,visit_time:'2026-11-20',department:'科室',hospital:'已选医院',expert:'已选专家',serviceMode:'reminder'}))},
 abnormal_followup:{records:names.map((items,i)=>({items,timingSourceId:`report:${i}:0`,time:'2026-11-20',department:'科室',serviceMode:'reminder'}))},
 checkup_completion:{records:[{items:'Lp-PLA2'}]},annual_checkup:{date:'2027-06-01'}
};}
test('merge only reviewed duplicates, preserving logistics, other exams and targets',()=>{
 const original=fixture();const snapshot=structuredClone(original);const next=revise(original);
 assert.deepEqual(original,snapshot);
 assert.equal(next.abnormal_followup.records.length,0);
 assert.deepEqual(next.checkup_completion,original.checkup_completion);
 assert.deepEqual(next.annual_checkup,original.annual_checkup);
 assert.deepEqual(next.management_targets,original.management_targets);
 next.medical_treatment.records.forEach((r,i)=>{assert.equal(r.hospital,'已选医院');assert.equal(r.expert,'已选专家');assert.equal(r.visit_time,'2026-11-20');assert.equal(r.issueId,String(i));assert.equal(r.goal,names[i]);});
});
test('reject different dates, conflicts and assisted-service arrangements',()=>{
 for(const patch of [{time:'2026-11-21'},{hospital:'不同医院'},{serviceMode:'managed'},{timingSourceId:'unknown'}]){const x=fixture();Object.assign(x.abnormal_followup.records[0],patch);assert.throws(()=>revise(x));}
});
