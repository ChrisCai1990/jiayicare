const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.post('/patients/:id/disease-records/materialize-legacy'");
const end = source.indexOf('// 一项疾病对应一份专病档案', start);

test('旧版专病只归一化一次，并用原始快照防止覆盖并发修改', async () => {
  let handler;
  let matchedCount = 1;
  let writes = 0;
  const summary = { initialDiagnosis:'原始病历诊断' };
  const patient = { _id:'patient', assignedHealthManager:'manager', assignedFamilyDoctor:'advisor',
    diseaseRecords:[], medicalRecord:{ summary, courseEntries:[{ content:'旧病程' }] } };
  const context = {
    router:{ post:(_path, _auth, _permission, callback) => { handler = callback; } },
    staffAuth:()=>{}, checkPermission:()=>{},
    User:{ findOne:()=>({ select:()=>({ lean:async()=>patient }) }), collection:{ updateOne:async(filter, update) => {
      assert.equal(filter._id,'patient');
      assert.strictEqual(filter['medicalRecord.summary'],summary);
      assert.deepEqual(Array.from(filter.diseaseRecords),[]);
      assert.equal(update.$set.diseaseRecords[0].summary.initialDiagnosis,'原始病历诊断');
      writes++;
      return { matchedCount };
    } } },
    normalizedDiseaseRecords:()=>[{ _id:'existing-legacy', name:'原始病历诊断', summary, courseEntries:patient.medicalRecord.courseEntries }],
    hasMedicalSummary:value=>!!value?.initialDiagnosis,
  };
  vm.runInNewContext(source.slice(start,end),context);
  const call = async (role='healthManager') => {
    const res = { code:200, status(code){ this.code=code; return this; }, json(body){ this.body=body; return this; } };
    await handler({ params:{id:'patient'}, staff:{_id:role==='familyDoctor'?'advisor':'manager',tenantId:'tenant',role} },res);
    return res;
  };
  assert.equal((await call('familyDoctor')).code,200);
  assert.equal(writes,1);
  assert.equal((await call('nutritionist')).code,403);
  patient.diseaseRecords=[{ _id:'already-saved', name:'原始病历诊断' }];
  assert.equal((await call()).body.unchanged,true);
  assert.equal(writes,1);
  patient.diseaseRecords=[];
  matchedCount=0;
  assert.equal((await call()).code,409);
  assert.equal(writes,2);
});
