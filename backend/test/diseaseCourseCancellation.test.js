const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/routes/staff'),'utf8');
const start=source.indexOf("router.post('/patients/:id/disease-records/:recordId/course-entries/:entryId/cancel'");
const end=source.indexOf("router.put('/patients/:id/disease-records/:recordId/course-entries/:entryId'",start);

async function run({linked=false,match=1,reason='重复入档，保留既有病历'}={}) {
  let handler,write;
  const entry={_id:'entry',occurredAt:new Date('2025-01-22'),sourceType:'medical_record',content:'反复眩晕70天',...(linked?{sourceReportId:'report'}:{})};
  const patient={_id:'patient',diseaseRecords:[{_id:'dossier',name:'眩晕',courseEntries:[entry]}]};
  vm.runInNewContext(source.slice(start,end),{
    router:{post:(_path,...callbacks)=>{handler=callbacks.at(-1)}},staffAuth:()=>{},checkPermission:()=>{},
    getVisiblePlanPatientIds:async()=>['patient'],
    User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(query,update)=>{write={query,update};return{matchedCount:match}}}},
    normalizedDiseaseRecords:value=>structuredClone(value.diseaseRecords),
    sourceIds:require('../../shared/diseaseReportArchive.cjs').sourceIds,
    cleanMedicalText:(value,max)=>String(value||'').trim().slice(0,max),
  });
  const res={code:200,status(code){this.code=code;return this},json(body){this.body=body}};
  await handler({params:{id:'patient',recordId:'dossier',entryId:'entry'},staff:{role:'familyDoctor',_id:'doctor',name:'健康顾问'},body:{reason}},res);
  return{res,write,patient};
}

test('历史重复诊疗记录可撤销并保留内容、原因、人员和时间',async()=>{
  const {res,write,patient}=await run();
  assert.equal(res.code,200);
  const record=write.update.$set.diseaseRecords[0];
  assert.equal(record.courseEntries.length,0);
  assert.equal(record.cancelledCourseEntries[0].content,'反复眩晕70天');
  assert.equal(record.cancelledCourseEntries[0].cancellationReason,'重复入档，保留既有病历');
  assert.equal(record.cancelledCourseEntries[0].cancelledByName,'健康顾问');
  assert.equal(write.query.diseaseRecords,patient.diseaseRecords);
});
test('带原始报告来源的记录须按资料撤销，且并发变化不得覆盖',async()=>{
  assert.equal((await run({linked:true})).res.code,409);
  assert.equal((await run({match:0})).res.code,409);
  assert.equal((await run({reason:'短'})).res.code,400);
});
