const test=require('node:test');
const assert=require('node:assert/strict');
const register=require('../src/routes/rehab');
const User=require('../src/models/User');
const FollowUp=require('../src/models/FollowUp');
const routes={};
let visible=[];
register({get:(p,...h)=>routes['GET '+p]=h.at(-1),post:(p,...h)=>routes['POST '+p]=h.at(-1)}, {staffAuth:()=>{},checkPermission:()=>()=>{},getVisiblePlanPatientIds:async()=>visible});
const pid='111111111111111111111111',tid='222222222222222222222222';
async function call(action,role='healthPlanner',tenantId=tid){let result;await routes[action]({params:{patientId:pid},staff:{_id:'333333333333333333333333',tenantId,role},body:{}},{status(n){this.code=n;return this},json(value){result={code:this.code||200,...value}}});return result}
test('rehab routes enforce customer tenant, assignment and writer role before mutations',async()=>{
 const oldFind=User.findById,oldExists=FollowUp.exists;
 try{
 User.findById=()=>({select:async()=>({_id:pid,tenantId:tid})});FollowUp.exists=async()=>false;
 assert.equal((await call('GET /patients/:patientId/rehab','superadmin','444444444444444444444444')).code,404);
 assert.equal((await call('GET /patients/:patientId/rehab')).code,403);
 visible=[pid];
 assert.equal((await call('POST /patients/:patientId/rehab/records')).code,403);
 assert.equal((await call('POST /patients/:patientId/rehab/plans','familyDoctor')).code,403);
 assert.equal((await call('POST /patients/:patientId/rehab/booking','rehabSpecialist')).code,403);
 assert.equal((await call('POST /patients/:patientId/rehab/handoff','healthManager')).code,403);
 }finally{User.findById=oldFind;FollowUp.exists=oldExists}
});
