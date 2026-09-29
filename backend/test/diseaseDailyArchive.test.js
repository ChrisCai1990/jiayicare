const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/routes/staff'),'utf8');
const start=source.indexOf("router.post('/patients/:id/disease-records/course-entries'");
const end=source.indexOf("router.put('/patients/:id/disease-records/:recordId/course-entries/:entryId'",start);
async function run({duplicate=false,foreign=false,match=1,scope=['p'],role='familyDoctor'}={}){
  let handler,write,query;
  const patient={_id:'p',diseaseRecords:[{_id:'d',name:'测试',courseEntries:duplicate?[{sourceHealthRecordId:'h'}]:[]}]};
  const ctx={router:{post:(path,...fns)=>{handler=fns.at(-1)}},staffAuth:()=>{},checkPermission:()=>{},
    User:{findById:()=>({select:()=>({lean:async()=>patient})}),collection:{updateOne:async(filter,update)=>{write={filter,update};return{matchedCount:match}}}},
    HealthRecord:{findOne:q=>{query=q;return{select:()=>({lean:async()=>foreign?null:{_id:'h',label:'日常症状',value:'原始反馈',recordedAt:'2026-09-29'}})}}},
    cleanMedicalText:v=>String(v||'').trim(),mergedHealthChange:b=>b.content,normalizedDiseaseRecords:p=>p.diseaseRecords.map(d=>({...d})),
    cleanHealthInfoProvenance:b=>({sourceType:b.sourceType,verificationStatus:b.verificationStatus}),getVisiblePlanPatientIds:async()=>scope,
    mongoose:{Types:{ObjectId:function(){return'new-entry'}}},
  };
  vm.runInNewContext(source.slice(start,end),ctx);
  const res={code:200,status(c){this.code=c;return this},json(b){this.body=b}};
  await handler({params:{id:'p'},staff:{role,_id:'staff',name:'顾问'},body:{diseaseName:'测试',recordId:'d',content:'核对后的变化',sourceHealthRecordId:'h',sourceType:'client_report',verificationStatus:'self_reported',occurredAt:'2026-09-28'}},res);
  return{res,write,query,patient};
}
test('daily archive preserves source evidence and confirmed event date without modifying the source workflow',async()=>{
  const r=await run();assert.equal(r.res.code,201);assert.equal(r.query.user,'p');assert.equal(r.query.deletedAt,null);
  const entry=r.write.update.$set.diseaseRecords[0].courseEntries[0];
  assert.equal(entry.sourceHealthRecordId,'h');assert.equal(entry.sourceSnapshot.value,'原始反馈');assert.equal(entry.occurredAt.toISOString().slice(0,10),'2026-09-28');
  assert.equal(r.write.filter.diseaseRecords,r.patient.diseaseRecords);assert.equal(r.patient.diseaseRecords[0].courseEntries.length,0);
});
test('duplicate, cross-patient, unauthorized and concurrently changed archives do not create extra entries',async()=>{
  const duplicate=await run({duplicate:true});assert.equal(duplicate.res.body.unchanged,true);assert.equal(duplicate.write,undefined);
  assert.equal((await run({foreign:true})).res.code,404);
  assert.equal((await run({scope:[]})).res.code,403);
  assert.equal((await run({role:'healthManager'})).res.code,403);
  assert.equal((await run({match:0})).res.code,409);
});
