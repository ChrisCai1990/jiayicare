const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.patch('/medical-reports/:id',");
const end = source.indexOf("router.post('/medical-reports/:id/health-course-draft'", start);

test('legacy outpatient target needs manager confirmation and a valid dossier before advisor handoff', async () => {
  let handler;
  let writes = 0;
  const report = { _id:'report', user:'patient', documentCategory:'outpatient_record', audit_status:'audited',
    courseTargetDiseaseId:null, healthCourseDraft:{ status:'pending_review' } };
  const context = {
    router:{ patch:(_path, _auth, callback) => { handler = callback; } }, staffAuth:()=>{},
    MedicalReport:{ findById:async()=>report, updateOne:async(filter, update)=>{
      assert.equal(filter.audit_status,'audited');
      assert.equal(filter.courseTargetDiseaseId,null);
      assert.equal(filter['healthCourseDraft.status'],'pending_review');
      assert.equal(update.$set.courseTargetDiseaseId,'dossier');
      assert.equal(update.$push.dataEditLog.operatorRole,'healthManager');
      writes++;
      return { modifiedCount:1 };
    } },
    clinicalManagerAuditError:(_report, staff)=>staff.role === 'healthManager' ? '' : '仅健管专员可确认',
    outpatientCourseTargetError:async draft=>draft.courseTargetDiseaseId === 'dossier' ? '' : '专病首页缺少首次概况',
    mongoose:{ isValidObjectId:value=>!!value },
  };
  vm.runInNewContext(source.slice(start,end), context);
  const call = async (role, target) => {
    const res = { code:200, status(code){this.code=code;return this},json(body){this.body=body;return this} };
    await handler({ params:{id:'report'}, staff:{role,_id:'manager',name:'健管专员'},
      body:{editSource:'outpatient_legacy_target_confirmation',courseTargetDiseaseId:target} }, res);
    return res;
  };
  assert.equal((await call('familyDoctor','dossier')).code,403);
  assert.equal((await call('healthManager','invalid')).code,409);
  assert.equal(writes,0);
  assert.equal((await call('healthManager','dossier')).code,200);
  assert.equal(writes,1);
});
