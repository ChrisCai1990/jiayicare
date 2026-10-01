const test=require('node:test'),assert=require('node:assert/strict');
const {prepare,fingerprint,handle}=require('../src/utils/lifestyleInterview');
const {effectiveLifestyle}=require('../src/utils/effectiveLifestyle');
const template={_id:'6a49eab9fc1595013da70645',title:'survey',updatedAt:new Date('2026-10-01'),questions:[{id:'water',type:'text',text:'water',archiveField:'lifestyle_data.waterAmount'},{id:'breakfast',type:'text',text:'breakfast',archiveField:'lifestyle_data.breakfastTime'},{id:'unknown',type:'text',text:'unknown',archiveField:'lifestyle_data.lunchTime'}]};
test('only verified responses map to archives; missing is not no; preserve baseline and version',()=>{
 const user={lifestyle_data:{breakfastTime:'07:00'}};
 const result=prepare(user,template,{answers:{breakfast:'08:00',unknown:'09:00'},confirmed:['breakfast']});
 assert.equal(result.items.length,1);assert.equal(result.items[0].from,'07:00');assert.equal(result.items[0].value,'08:00');assert.deepEqual(result.pending,['water','unknown']);assert.equal(result.verified.unknown,undefined);
 assert.notEqual(fingerprint(user),fingerprint({...user,lifestyle_data:{breakfastTime:'09:00'}}));
 assert.throws(()=>prepare(user,template,{confirmed:'invalid'}));
});
test('interview save then submit archives once, retries interrupted response write, and completes without advisor review',async t=>{
 const FollowUp=require('../src/models/FollowUp'),User=require('../src/models/User'),{DynamicQuestionnaire,QuestionnaireResponse}=require('../src/models/DynamicQuestionnaire');
 let task={_id:'task',patientId:'patient',sourceType:'scheduled',sourceAnnualPlanId:'plan',workflowKey:'annual_nutrition_assessment',assignedTo:'nutrition',status:'planned',aiStatus:'approved',content:'requirements',updatedAt:new Date('2026-10-01'),formData:{}};
 let user={_id:'patient',assignedNutritionist:'nutrition',assignedFamilyDoctor:'advisor',lifestyle_data:{breakfastTime:'07:00'},lifestyleHistory:[]};
 const chain=value=>({lean:async()=>structuredClone(value),sort:()=>chain(value)});
 const set=(obj,path,value)=>{const keys=path.split('.');let target=obj;for(const key of keys.slice(0,-1))target=target[key]??=( {} );target[keys.at(-1)]=value};
 const apply=(obj,u)=>{for(const[k,v]of Object.entries(u.$set||{}))set(obj,k,v);for(const[k,v]of Object.entries(u.$push||{})){let a=k.split('.').reduce((a,x)=>a?.[x],obj)||[];set(obj,k,[...a,v])}};
 t.mock.method(FollowUp,'findById',()=>chain(task));t.mock.method(User,'findById',()=>chain(user));t.mock.method(DynamicQuestionnaire,'findById',()=>chain(template));
 t.mock.method(FollowUp,'findOneAndUpdate',(q,u)=>{apply(task,u);task.updatedAt=new Date(+task.updatedAt+1);return chain(task)});
 t.mock.method(FollowUp,'updateOne',async(q,u)=>{apply(task,u);return{matchedCount:1}});
 let archiveWrites=0,responseWrites=0,interrupt=true;
 t.mock.method(User,'updateOne',async(q,u)=>{archiveWrites++;apply(user,u);return{matchedCount:1}});
 t.mock.method(QuestionnaireResponse,'updateOne',async()=>{if(interrupt)throw Error('interrupted');responseWrites++;return{}});
 const invoke=async(body,role='nutritionist',id='nutrition')=>{let output,code=200;await handle({method:'POST',params:{id:'task'},staff:{_id:id,role,name:'nutrition'},body},{status:n=>{code=n;return{json:d=>{output=d}}},json:d=>{output=d}});return{code,output}};
 const body={action:'draft',answers:{breakfast:'08:00'},confirmed:['breakfast'],notes:'review notes',method:'电话访谈',patientVersion:fingerprint(user),templateVersion:template.updatedAt.toISOString(),baseUpdatedAt:task.updatedAt.toISOString(),confirmConflicts:true};
 assert.equal((await invoke(body,'healthManager','manager')).code,403);
 assert.equal((await invoke(body)).code,200);assert.equal(archiveWrites,0);assert.equal(task.aiStatus,'approved');
 assert.equal((await invoke({...body,action:'submit',baseUpdatedAt:task.updatedAt.toISOString()})).code,500);
 assert.equal(archiveWrites,1);assert.equal(task.formData.lifestyleInterview.phase,'applying');assert.equal(user.lifestyle_data.breakfastTime,'07:00');assert.equal(effectiveLifestyle(user).breakfastTime,'08:00');
 assert.equal((await invoke({action:'submit'})).code,500);assert.equal(archiveWrites,1);
 interrupt=false;assert.equal((await invoke({action:'submit'})).code,200);assert.equal(archiveWrites,1);assert.equal(responseWrites,1);assert.equal(task.status,'completed');assert.equal(task.aiStatus,'approved');assert.equal(task.reviewAssignedTo,null);assert.equal(task.formData.lifestyleInterview.phase,'submitted');
 assert.equal((await invoke(body)).code,409);
});

test('skip rules omit inapplicable questions and explicit negative arrays remain empty',()=>{
 const {visibleQuestions}=require('../../shared/lifestyleInterview.cjs');
 const questions=[{id:'a',jumpLogic:[{condition:'no',jumpTo:'c'}]},{id:'b'},{id:'c'},{id:'female',genderOnly:'女'}];
 assert.deepEqual(visibleQuestions(questions,{a:'no'},'男').map(q=>q.id),['a','c']);
 const r=prepare({}, {questions:[{id:'x',archiveField:'lifestyle_data.badDietHabits',text:'habits'}]}, {answers:{x:{values:['无不良饮食习惯'],inputs:{}}},confirmed:['x']});
 assert.deepEqual(r.items[0].value,[]);
});


test('starting an interview recovers its patient pointer and reuses active task',async t=>{
 const User=require('../src/models/User'),FollowUp=require('../src/models/FollowUp');
 const user={_id:'patient',assignedNutritionist:'nutrition',assignedFamilyDoctor:'advisor',lifestyleInterviewTaskId:'reserved-task'};
 let active=null,upserts=0;const chain=v=>({lean:async()=>v,sort:()=>chain(v)});
 t.mock.method(User,'findById',()=>chain(user));t.mock.method(FollowUp,'findOne',()=>chain(active));t.mock.method(FollowUp,'findById',()=>chain(null));
 t.mock.method(FollowUp,'findOneAndUpdate',async(q,u)=>{upserts++;assert.equal(q._id,'reserved-task');active={_id:q._id,...u.$setOnInsert};return active});
 let result;const res={json:d=>{result=d},status:()=>res};
 const req={params:{id:'patient'},staff:{_id:'nutrition',role:'nutritionist'}};
 await require('../src/utils/lifestyleInterview').start(req,res);assert.equal(result.data.workflowKey,'lifestyle_interview');
 await require('../src/utils/lifestyleInterview').start(req,res);assert.equal(upserts,1);assert.equal(result.data._id,'reserved-task');
 assert.equal(require('../../shared/annualNutrition.cjs').isTask(active),true);
});

test('annual questionnaire preview resolves the saved item and enforces membership access without writes',async t=>{
 const Plan=require('../src/models/AnnualPlan'),User=require('../src/models/User'),FollowUp=require('../src/models/FollowUp'),{DynamicQuestionnaire}=require('../src/models/DynamicQuestionnaire');
 const row={defaultRole:'nutritionist',standardPlanId:'nutrition-template',executionDate:'2026-10-12'};
 t.mock.method(Plan,'findById',()=>({lean:async()=>({_id:'plan',patientId:'patient',moduleData:{personalized_followups:{records:[row]}}})}));
 t.mock.method(User,'findById',()=>({lean:async()=>({assignedNutritionist:'nutrition'})}));
 t.mock.method(DynamicQuestionnaire,'findById',id=>{assert.equal(id,template._id);return{lean:async()=>template}});
 t.mock.method(FollowUp,'findOne',q=>{assert.equal(q.sourceAnnualPlanId,'plan');assert.equal(q.sourceScheduleKey,'personalized:nutrition-template:0:2026-10-12');return{lean:async()=>({_id:'task'})}});
 const invoke=async(id,index)=>{let code=200,data;const res={status:n=>{code=n;return res},json:d=>data=d};await require('../src/utils/lifestyleInterview').preview({params:{id:'plan'},query:{index},staff:{role:'nutritionist',_id:id}},res);return{code,data}};
 assert.equal((await invoke('wrong','0')).code,403);
 assert.equal((await invoke('nutrition','4')).code,404);
 const result=await invoke('nutrition','0');assert.equal(result.code,200);assert.equal(result.data.data.taskId,'task');assert.equal(result.data.data.template._id,template._id);
});
