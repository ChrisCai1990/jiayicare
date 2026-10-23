const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { sourceIds, findReportArchive } = require('../../shared/diseaseReportArchive.cjs');
const { visitDate, mergeVisitEntries } = require('../../shared/diseaseVisit.cjs');
const routeSource = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const date = '2026-09-01';
const oldEntry = () => ({
  _id:'old', occurredAt:new Date(date + 'T00:00:00+08:00'), content:'眼震检查正常',
  sourceReportId:'old-report', sourceTitle:'眼震视图检查', sourceInstitution:'邵逸夫医院',
  sourceType:'medical_record', verificationStatus:'source_verified', recordedAt:new Date('2026-09-02'),
});
const newEntry = () => ({
  _id:'new', occurredAt:new Date(date + 'T00:00:00+08:00'), content:'头晕复诊',
  sourceReportId:'new-report', sourceTitle:'门诊病历', sourceInstitution:'浙江大学医学院附属邵逸夫医院',
  sourceType:'medical_record', verificationStatus:'source_verified',
  outpatientRecord:{ chiefComplaint:'头晕复诊' },
});
test('same visit keeps one timeline entry with separate original source documents and audit', () => {
  const merged = mergeVisitEntries(oldEntry(), newEntry(), { id:'advisor', name:'顾问', at:new Date('2026-09-03') });
  assert.equal(visitDate(merged.occurredAt), date);
  assert.deepEqual(sourceIds(merged), ['old-report','new-report']);
  assert.equal(merged.visitDocuments.length, 2);
  assert.equal(merged.visitDocuments[0].content, '眼震检查正常');
  assert.equal(merged.visitDocuments[1].outpatientRecord.chiefComplaint, '头晕复诊');
  assert.match(merged.content, /眼震检查正常[\s\S]*头晕复诊/);
  assert.equal(merged.revisionHistory[0].content, '眼震检查正常');
  assert.equal(merged.visitMergeHistory[0].sourceEntry._id, 'new');
  assert.equal(findReportArchive([{_id:'d',name:'眩晕',courseEntries:[merged]}], 'new-report').entry._id, 'old');
  assert.throws(() => mergeVisitEntries(merged, newEntry()), /已归入/);
  assert.throws(() => mergeVisitEntries(oldEntry(), {...newEntry(),occurredAt:new Date('2026-09-02T00:00:00+08:00')}), /日期不同/);
});

const response = () => ({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}});
async function approval(options={}) {
  let handler, write, saved=false;
  const report={_id:'new-report',user:'p',audit_status:'audited',documentCategory:'outpatient_record',courseTargetDiseaseId:'d',
    title:'门诊病历',hospital:'浙江大学医学院附属邵逸夫医院',
    healthCourseDraft:{status:'pending_review',outpatientRecord:{chiefComplaint:'头晕复诊',diagnoses:[]}},
    save:async()=>{saved=true}};
  const patient={_id:'p',diseaseRecords:[{_id:'d',name:'眩晕',summary:{initialDiagnosis:'眩晕'},courseEntries:[oldEntry()]}]};
  const context={
    router:{put:(_path,...fns)=>{handler=fns.at(-1)}},staffAuth:()=>{},getVisiblePlanPatientIds:async()=>['p'],
    MedicalReport:{findById:async()=>report},
    User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(q,u)=>{write={q,u};return{matchedCount:options.match ?? 1}}}},
    normalizedDiseaseRecords:p=>structuredClone(p.diseaseRecords),findReportArchive,sourceIds,visitDate,mergeVisitEntries,
    cleanMedicalText:v=>String(v||''),mergedHealthChange:b=>b.content,hasMedicalSummary:s=>!!s?.initialDiagnosis,
    recordVersion:()=>'',courseEvidence:()=>({}),mongoose:{Types:{ObjectId:function(){return 'new'}}},
    require:name=>require(name.endsWith('clinicalDocumentReview')?'../src/utils/clinicalDocumentReview':name),
  };
  const start=routeSource.indexOf("router.put('/medical-reports/:id/health-course-draft'");
  const end=routeSource.indexOf('// DELETE /api/staff/medical-reports/',start);
  vm.runInNewContext(routeSource.slice(start,end),context);
  const res=response();
  await handler({params:{id:'new-report'},staff:{role:'familyDoctor',_id:'advisor',name:'顾问'},body:{
    action:'approve',diseaseName:'眩晕',occurredAt:date,
    outpatientRecord:{chiefComplaint:'头晕复诊',diagnoses:[]},
    ...(options.body||{}),
  }},res);
  return {res,write,saved,report,patient};
}
test('same-day approval waits for explicit same-visit decision', async()=>{
  const result=await approval();
  assert.equal(result.res.code,409);
  assert.equal(result.write,undefined);
  assert.equal(result.saved,false);
});
test('confirmed same visit adds evidence to one existing entry', async()=>{
  const result=await approval({body:{mergeEntryId:'old'}});
  assert.equal(result.res.code,200,JSON.stringify(result.res.body));
  const entries=result.write.u.$set.diseaseRecords[0].courseEntries;
  assert.equal(entries.length,1);
  assert.equal(entries[0]._id,'old');
  assert.deepEqual(sourceIds(entries[0]),['old-report','new-report']);
  assert.equal(entries[0].visitDocuments.length,2);
  assert.equal(result.report.healthCourseDraft.approvedEntryId,'old');
});
test('confirmed separate same-day visit remains two entries; stale merge selection is rejected',async()=>{
  const separate=await approval({body:{separateVisitConfirmed:true}});
  assert.equal(separate.res.code,200);
  assert.equal(separate.write.u.$set.diseaseRecords[0].courseEntries.length,2);
  const stale=await approval({body:{mergeEntryId:'missing',separateVisitConfirmed:true}});
  assert.equal(stale.res.code,409);
  assert.equal(stale.write,undefined);
});
async function historicalMerge(options={}) {
  let handler,write,reportUpdate=false;
  const patient={_id:'p',diseaseRecords:[{_id:'d',name:'眩晕',courseEntries:[oldEntry(),newEntry()]}]};
  const start=routeSource.indexOf("router.post('/patients/:id/disease-records/:recordId/course-entries/merge'");
  const end=routeSource.indexOf("router.put('/patients/:id/disease-records/:recordId/course-entries/:entryId'",start);
  vm.runInNewContext(routeSource.slice(start,end),{
    router:{post:(_path,...fns)=>{handler=fns.at(-1)}},staffAuth:()=>{},checkPermission:()=>{},
    getVisiblePlanPatientIds:async()=>options.scope ?? ['p'],
    User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(q,u)=>{write={q,u};return{matchedCount:options.match ?? 1}}}},
    MedicalReport:{updateMany:async()=>{reportUpdate=true}},
    normalizedDiseaseRecords:p=>structuredClone(p.diseaseRecords),sourceIds,mergeVisitEntries,
  });
  const res=response();
  await handler({params:{id:'p',recordId:'d'},staff:{role:options.role||'familyDoctor',_id:'advisor',name:'顾问'},
    body:{targetEntryId:'old',sourceEntryId:'new',confirmSameVisit:true}},res);
  return {res,write,reportUpdate,patient};
}
test('historical duplicate merge is atomic and leaves every source attached',async()=>{
  const result=await historicalMerge();
  assert.equal(result.res.code,200,JSON.stringify(result.res.body));
  const entries=result.write.u.$set.diseaseRecords[0].courseEntries;
  assert.equal(entries.length,1);
  assert.deepEqual(sourceIds(entries[0]),['old-report','new-report']);
  assert.equal(result.write.q.diseaseRecords,result.patient.diseaseRecords);
  assert.equal(result.reportUpdate,true);
});
test('historical merge enforces advisor scope and concurrency',async()=>{
  for(const [options,code] of [[{role:'nurse'},403],[{scope:[]},403],[{match:0},409]]){
    const result=await historicalMerge(options);
    assert.equal(result.res.code,code);
    assert.equal(result.reportUpdate,false);
  }
});

