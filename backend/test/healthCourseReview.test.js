const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/routes/staff'),'utf8');
const start=source.indexOf("router.put('/medical-reports/:id/health-course-draft'");const end=source.indexOf('// DELETE /api/staff/medical-reports/',start);
async function run({scope=['p'],date='2026-09-10',match=1,action='approve',sourceChanged=false}={}){
 let handler,write,saved=false;const report={_id:'r',user:'p',audit_status:'audited',healthCourseDraft:{status:'pending_review',content:'AI草稿',sourceVersion:'v'},save:async()=>{saved=true}};
 const patient={_id:'p',diseaseRecords:[{_id:'d',name:'测试',summary:{initialDiagnosis:'已核对'},courseEntries:[]}]};
 vm.runInNewContext(source.slice(start,end),{findReportArchive:require('../../shared/diseaseReportArchive.cjs').findReportArchive,router:{put:(p,...f)=>handler=f.at(-1)},staffAuth:()=>{},getVisiblePlanPatientIds:async()=>scope,MedicalReport:{findById:async()=>report},User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(q,u)=>{write={q,u};return{matchedCount:match}}}},normalizedDiseaseRecords:p=>structuredClone(p.diseaseRecords),cleanMedicalText:v=>String(v||''),mergedHealthChange:b=>b.content,hasMedicalSummary:s=>!!s?.initialDiagnosis,recordVersion:()=>sourceChanged?'changed':'v',courseEvidence:r=>r,mongoose:{Types:{ObjectId:function(){return 'e'}}}});
 const res={code:200,status(c){this.code=c;return this},json(b){this.body=b}};await handler({params:{id:'r'},staff:{role:'familyDoctor',_id:'s',name:'顾问'},body:{action,occurredAt:date,diseaseName:'测试',content:'已核对内容'}},res);return{res,write,saved,patient};
}
test('AI timeline approval uses confirmed visit date and preserves source and reviewer with CAS',async()=>{const {res,write,patient}=await run();assert.equal(res.code,200);const e=write.u.$set.diseaseRecords[0].courseEntries[0];assert.equal(e.occurredAt.toISOString(),'2026-09-09T16:00:00.000Z');assert.equal(e.sourceReportId,'r');assert.equal(e.reviewedById,'s');assert.equal(write.q.diseaseRecords,patient.diseaseRecords)});
test('missing dates, foreign patients, changed evidence and concurrent updates cannot archive',async()=>{for(const [options,code] of [[{date:''},400],[{scope:[]},403],[{sourceChanged:true},409],[{match:0},409]]){const result=await run(options);assert.equal(result.res.code,code);assert.equal(result.saved,false)}});

test('reviewed legacy outpatient record can create its first dossier and archive exactly once', async () => {
  let handler, writes = 0;
  const report = { _id:'report', user:'patient', documentCategory:'outpatient_record', audit_status:'audited', hospital:'来源医院',
    healthCourseDraft:{ status:'pending_review', generatedAt:'2026-10-17T08:41:25.256Z', outpatientRecord:{
      visitDate:'2026/9/23', chiefComplaint:'已核对的主诉', diagnoses:['已核对的诊断'], department:'内科',
    } }, save:async()=>{} };
  const patient = { _id:'patient', diseaseRecords:[] };
  vm.runInNewContext(source.slice(start,end), {
    findReportArchive:require('../../shared/diseaseReportArchive.cjs').findReportArchive,
    router:{put:(_path,...callbacks)=>{handler=callbacks.at(-1)}}, staffAuth:()=>{},
    getVisiblePlanPatientIds:async()=>['patient'],
    MedicalReport:{findById:async()=>report},
    User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(query,update)=>{
      assert.equal(query.diseaseRecords, patient.diseaseRecords);
      patient.diseaseRecords=update.$set.diseaseRecords; writes++; return { matchedCount:1 };
    }}},
    normalizedDiseaseRecords:value=>structuredClone(value.diseaseRecords),
    cleanMedicalText:(value,max)=>String(value??'').trim().slice(0,max||10000),
    mergedHealthChange:body=>body.content,
    recordVersion:()=>'', courseEvidence:()=>({}),
    hasMedicalSummary:summary=>['chiefComplaint','presentIllness','physicalExam','initialDiagnosis','currentMedication'].some(key=>summary?.[key]),
    mongoose:{Types:{ObjectId:function(){return `new-id-${writes}`}}},
    require:name=>{
      if(name.endsWith('clinicalDocumentReview')) return require('../src/utils/clinicalDocumentReview');
      if(name.endsWith('outpatientDiseaseDossier')) return require('../src/utils/outpatientDiseaseDossier');
      throw new Error(name);
    },
  });
  const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}});
  const request={params:{id:'report'},staff:{role:'familyDoctor',_id:'doctor',name:'审核顾问'},body:{
    action:'approve',diseaseName:'医生核对后的专病名称',createDiseaseRecord:true,occurredAt:'2026-09-23',
  }};
  const first=response(); await handler(request,first);
  assert.equal(first.code,200,JSON.stringify(first.body));
  assert.equal(writes,1);
  assert.equal(patient.diseaseRecords.length,1);
  assert.equal(patient.diseaseRecords[0].summary.chiefComplaint,'已核对的主诉');
  assert.equal(patient.diseaseRecords[0].summary.initialDiagnosis,'已核对的诊断');
  assert.equal(patient.diseaseRecords[0].summary.verificationStatus,'source_verified');
  assert.equal(patient.diseaseRecords[0].courseEntries[0].sourceReportId,'report');
  assert.equal(report.courseTargetDiseaseId,patient.diseaseRecords[0]._id);
  const retry=response(); await handler(request,retry);
  assert.equal(retry.body.unchanged,true);
  assert.equal(writes,1);
});
