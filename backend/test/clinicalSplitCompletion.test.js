const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
const start = source.indexOf("router.post('/medical-reports/:id/complete-clinical-split'");
const end = source.indexOf('// POST /api/staff/upload/quick-meta', start);

test('混合原件只有被病历与处方完整且不重叠地覆盖后才退出待审', async () => {
  let handler, writes = 0, matchedCount = 1;
  const original = { _id:'source', user:'patient', fileUrls:['one','two'], audit_status:'unaudited' };
  let children = [
    { documentCategory:'outpatient_record', organizedFrom:[{reportId:'source',fileIndex:0}] },
    { documentCategory:'prescription_order', organizedFrom:[{reportId:'source',fileIndex:1}] },
  ];
  const context = {
    router:{ post:(_path, _auth, _permission, callback) => { handler=callback; } },
    staffAuth:()=>{}, checkPermission:()=>{},
    User:{ findOne:()=>({ select:()=>({ lean:async()=>({ assignedHealthManager:'manager' }) }) }) },
    MedicalReport:{
      findById:()=>({ select:()=>({ lean:async()=>original }) }),
      find:()=>({ select:()=>({ lean:async()=>children }) }),
      updateOne:async(filter, update)=>{ assert.equal(filter.audit_status,'unaudited'); assert.equal(update.$set.audit_status,'rejected'); writes++; return { matchedCount }; },
    },
    mongoose:{ isValidObjectId:()=>true }, Set,
  };
  vm.runInNewContext(source.slice(start,end),context);
  const call = async () => {
    const res={code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await handler({params:{id:'source'},staff:{role:'healthManager',_id:'manager',tenantId:'tenant'},body:{childReportIds:['first','second']}},res);
    return res;
  };
  children[1].organizedFrom[0].fileIndex=0;
  assert.equal((await call()).code,409);
  assert.equal(writes,0);
  children[1].organizedFrom[0].fileIndex=1;
  assert.equal((await call()).code,200);
  assert.equal(writes,1);
  matchedCount=0;
  assert.equal((await call()).code,409);
});
