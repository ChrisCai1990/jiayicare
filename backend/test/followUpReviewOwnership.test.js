const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../shared/followUpReview.cjs');
const view = require('../../staff/src/utils/followUpDetail.cjs');
const patient = { assignedFamilyDoctor: {_id:'advisor', name:'顾问'}, assignedHealthManager: {_id:'manager', name:'专员'} };
const advisor = {_id:'advisor', role:'familyDoctor'};
const task = { sourceType:'order', sourceScheduleKey:'expert_appointment_followup:order', aiStatus:'pending', reviewRole:'familyDoctor', staffId:'advisor', assignedTo:'manager' };
test('advisor reviews independently of executor and reassignment', () => {
 for (const assignedTo of ['manager', 'other-manager', {_id:'manager'}]) {
  assert.equal(policy.canReview({...task, assignedTo}, advisor, patient), true);
  assert.equal(policy.canReview({...task, assignedTo}, {_id:assignedTo,role:'healthManager'}, patient), false);
  assert.equal(policy.canReview({...task, assignedTo}, {_id:'other-advisor',role:'familyDoctor'}, patient), false);
 }
});
test('explicit reviewer survives executor change; no owner fails closed', () => {
 assert.equal(policy.canReview({...task,reviewAssignedTo:'special-advisor'},advisor,patient),false);
 assert.equal(policy.canReview({...task,reviewAssignedTo:'special-advisor'},{_id:'special-advisor',role:'familyDoctor'},patient),true);
 assert.equal(policy.canReview(task,advisor,{}),false);
 assert.equal(policy.canReview({...task,aiStatus:'approved'},advisor,patient),false);
});
test('legacy advisor slot defaults to manager; actual chosen executor stays', () => {
 assert.equal(policy.executor({...task,assignedTo:'advisor'},patient)._id,'manager');
 assert.equal(policy.executor(task,patient),'manager');
 assert.equal(policy.executor({...task,assignedTo:'other-manager'},patient),'other-manager');
 assert.equal(policy.executor({...task,assignedTo:'advisor',reviewAssignedTo:'advisor'},patient),'advisor');
 assert.equal(policy.executor({...task,assignedTo:null},{}),null);
});
test('unrelated specialty review retains existing role and owner', () => {
 const nutrition={aiStatus:'pending',reviewRole:'nutritionist',assignedTo:'nutritionist'};
 assert.equal(policy.canReview(nutrition,{_id:'nutritionist',role:'nutritionist'},patient),true);
 assert.equal(policy.canReview(nutrition,advisor,patient),false);
});
test('save response preserves only matching populated references', () => {
 const old={assignedTo:{_id:'manager',name:'专员'},sourceOrderId:{_id:'order',serviceName:'约诊'}};
 const updated=view.mergeFollowUpDetail(old,{assignedTo:'new',sourceOrderId:'order'},[{_id:'new',name:'新专员'}]);
 assert.equal(updated.assignedTo.name,'新专员');assert.equal(updated.sourceOrderId.serviceName,'约诊');
 assert.equal(view.mergeFollowUpDetail(old,{sourceOrderId:'different'}).sourceOrderId,'different');
 assert.equal(view.orderAmount({paidAmount:0}),'¥0');assert.equal(view.orderAmount('order'),'金额未提供');
 assert.equal(view.displayDate(undefined),'未提供');assert.equal(view.displayDate('bad'),'未提供');
});
const fs = require('node:fs');
const vm = require('node:vm');
const routeSource = fs.readFileSync(require.resolve('../src/routes/staff.js'), 'utf8');
const start = routeSource.indexOf("router.patch('/followups/:id/review'");
const end = routeSource.indexOf("// ── DELETE /api/staff/followups/:id", start);
async function reviewRequest(actor, changes = {}, owner = patient) {
 let handler, saved = 0;
 const item = {...task, patientId:'patient', status:'planned', ...changes, save:async()=>{ saved++; }};
 vm.runInNewContext(routeSource.slice(start, end), {
  router:{patch:(_path,_auth,fn)=>{handler=fn}},staffAuth:()=>{},followUpReview:policy,
  FollowUp:{findOne:async()=>item},User:{findById:()=>({select:()=>({lean:async()=>owner})})},
  require:()=>({preparationRole:()=>null}),
 });
 const response={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
 await handler({staff:actor,params:{id:'task'},body:{action:'approve'}},response);
 return {response,item,saved};
}
test('actual approval handler allows advisor with manager executor and persists distinct roles', async()=>{
 const {response,item,saved}=await reviewRequest(advisor);
 assert.equal(response.statusCode,200);assert.equal(saved,1);
 assert.equal(item.aiStatus,'approved');assert.equal(item.assignedTo,'manager');assert.equal(item.reviewAssignedTo._id,'advisor');
});
test('actual approval handler rejects unrelated advisor and executor without saving', async()=>{
 for(const actor of [{_id:'other',role:'familyDoctor'},{_id:'manager',role:'healthManager'}]){
  const {response,saved}=await reviewRequest(actor);assert.equal(response.statusCode,403);assert.equal(saved,0);
 }
});
test('actual approval handler corrects legacy executor only when approved; missing executor blocks approval',async()=>{
 const legacy=await reviewRequest(advisor,{assignedTo:'advisor'});
 assert.equal(legacy.response.statusCode,200);assert.equal(legacy.item.assignedTo._id,'manager');
 const missing=await reviewRequest(advisor,{assignedTo:null},{assignedFamilyDoctor:'advisor'});
 assert.equal(missing.response.statusCode,400);assert.equal(missing.saved,0);
});
