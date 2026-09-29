const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
const {baseVersion,stageScope,stageFields}=require('../src/utils/diseaseStages');
const {recordVersion}=require('../src/utils/diseaseSummary');
const {SUMMARY_FIELDS}=require('../../shared/diseaseSummary.cjs');
const summary=Object.fromEntries(SUMMARY_FIELDS.map(k=>[k,'阶段内容']));
const record={_id:'d',name:'专病',summary:{chiefComplaint:'首次'},courseEntries:[{_id:'e',occurredAt:'2026-09-01',content:'会诊',recordedAt:'2026-09-02',sourceReportId:'r'}]};
test('scope uses event dates, excludes unverified/undated/later entries, never changes baseline',()=>{
 const r={...record,courseEntries:[...record.courseEntries,{_id:'later',occurredAt:'2026-10-01'},{_id:'unknown'},{_id:'pending',occurredAt:'2026-08-01',verificationStatus:'pending_verification'}]};
 const scoped=stageScope(r,'2026-09-29');assert.equal(scoped.coveredChanges.length,1);assert.equal(scoped.excludedCount,3);assert.equal(r.courseEntries.length,4);
 assert.throws(()=>stageScope(r,'2026-02-30'));assert.throws(()=>stageScope(r,'2020-01-01'));
 assert.equal(baseVersion(r),baseVersion({...r,stageDraft:{a:1}}));assert.throws(()=>stageFields({}));
});
function harness({role='familyDoctor',scope=['p'],changed=false,match=1}={}){
 const patient={_id:'p',diseaseRecords:[structuredClone(record)]}, routes={}, reports=[{_id:'r',title:'会诊病历'}];let generated=0,writes=0;
 const chain={select(){return this},sort(){return this},lean:async()=>reports};
 const mocks={'../../../shared/diseaseReportArchive.cjs':require('../../shared/diseaseReportArchive.cjs'),express:{Router:()=>({post:(p,...f)=>routes[p]=f.at(-1)})},mongoose:{Types:{ObjectId:function(){return new String('draft')}},isValidObjectId:()=>true},'../middleware/staffAuth':()=>{},'../models/User':{findById:()=>({select:()=>({lean:async()=>structuredClone(patient)})}),collection:{updateOne:async(filter,update)=>{writes++;if(match)patient.diseaseRecords=update.$set.diseaseRecords;return{matchedCount:match}}}},'../models/MedicalReport':{find:()=>chain},'../utils/diseaseSummary':{recordVersion,generateDiseaseSummary:async()=>{generated++;return{summary,coverage:{courseCount:1,reportCount:1}}}},'../utils/diseaseStages':{baseVersion,stageScope,stageFields},'../utils/ai':{chat:()=>{}}};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/diseaseStages'),'utf8'),{require:n=>mocks[n],module:mod});mod.exports({getVisiblePlanPatientIds:async()=>scope});
 const call=async(path,body)=>{const res={code:200,status(c){this.code=c;return this},json(b){this.body=b}};await routes[path]({params:{id:'p',recordId:'d'},body,staff:{role,_id:'s',name:'顾问'}},res);return res};
 return{patient,reports,call,get generated(){return generated},get writes(){return writes}};
}
const generate='/:id/disease-records/:recordId/stage-draft',confirm='/:id/disease-records/:recordId/stages';
test('draft remains unconfirmed; explicit confirmation appends a stage and retains initial overview, retry is idempotent',async()=>{
 const h=harness();let r=await h.call(generate,{cutoff:'2026-09-29'});assert.equal(r.code,200);assert.equal(h.patient.diseaseRecords[0].stageSummaries,undefined);
 r=await h.call(confirm,{draftId:'draft',summary});assert.equal(r.code,200);
 const saved=h.patient.diseaseRecords[0];assert.equal(saved.summary.chiefComplaint,'首次');assert.equal(saved.stageSummaries.length,1);assert.equal(saved.stageSummaries[0].sourceReports[0].id,'r');assert.equal(saved.stageSummaries[0].baselineSnapshot.chiefComplaint,'首次');
 r=await h.call(confirm,{draftId:'draft',summary});assert.equal(r.body.unchanged,true);assert.equal(h.writes,2);
});
test('role/scope guard applies before AI generation',async()=>{
 for(const options of [{role:'nurse'},{scope:[]}]){const h=harness(options);assert.equal((await h.call(generate,{cutoff:'2026-09-29'})).code,403);assert.equal(h.generated,0);assert.equal(h.writes,0)}
});
test('changed timeline/report and concurrent writes reject confirmation instead of mixing versions',async()=>{
 for(const change of ['timeline','report']){const h=harness();await h.call(generate,{cutoff:'2026-09-29'});if(change==='timeline')h.patient.diseaseRecords[0].courseEntries[0].content='已纠错';else h.reports[0].title='来源已修改';assert.equal((await h.call(confirm,{draftId:'draft',summary})).code,409);assert.equal(h.patient.diseaseRecords[0].stageSummaries,undefined)}
 const h=harness({match:0});assert.equal((await h.call(generate,{cutoff:'2026-09-29'})).code,409);
});
