const test=require('node:test'),assert=require('node:assert/strict');
const {transition}=require('../src/utils/annualNutritionReview');
test('营养评估仅派营养师一项，不生成健管或规划师需求',async t=>{
 const team={assignedNutritionist:'bbbbbbbbbbbbbbbbbbbbbbbb'};
 const date=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const input={personalized_followups:{records:[{defaultRole:'nutritionist',standardPlanId:'template',executionDate:date,sourceCycles:[{cycleType:'relative',cycleDuration:10,cycleUnit:'day'}]}]}};
 const normalize=require('../src/utils/annualItemManagement').normalizeAnnualItems;
 assert.throws(()=>normalize(input,null,{}),/分配营养师/);
 const plan={_id:'plan',patientId:'patient',moduleData:normalize(input,null,team)};
 const User=require('../src/models/User'),Admin=require('../src/models/Admin');
 t.mock.method(User,'findById',()=>({select:()=>({lean:async()=>team})}));t.mock.method(Admin,'find',()=>({select:()=>({lean:async()=>[]})}));
 const rows=await require('../src/utils/annualPlanFollowUps').buildAnnualPlanFollowUps(plan);
 assert.equal(rows.length,1);assert.equal(rows[0].assignedTo,team.assignedNutritionist);assert.equal(rows[0].reviewAssignedTo,null);assert.equal(rows[0].aiStatus,'approved');
 assert.equal(require('../src/utils/annualPlanServiceTasks').buildAnnualPlanServiceTasks(plan,team).length,0);
});

test('legacy review is disabled',async()=>{await assert.rejects(()=>transition({task:{sourceType:'professional_assessment',workflowKey:'lifestyle_interview'},review:true}),/无需健康顾问审核/)});

test('年度标准营养评估派营养师一项，保留顾问勾选的对比指标',async t=>{
 const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
 const team={assignedNutritionist:'bbbbbbbbbbbbbbbbbbbbbbbb'};
 const plan={_id:'plan',patientId:'patient',moduleData:{nutrition_assessment:{enabled:true,executionDate:date,nutritionComparisonMetrics:['糖化血红蛋白','甘油三酯']},personalized_followups:{records:[{directNutritionAssessment:true,executionDate:date,standardPlanId:'legacy'}]}}};
 const User=require('../src/models/User'),Admin=require('../src/models/Admin');
 t.mock.method(User,'findById',()=>({select:()=>({lean:async()=>team})}));t.mock.method(Admin,'find',()=>({select:()=>({lean:async()=>[]})}));
 const rows=await require('../src/utils/annualPlanFollowUps').buildAnnualPlanFollowUps(plan);
 assert.equal(rows.length,1);
 assert.equal(rows[0].workflowKey,'annual_nutrition_assessment');
 assert.equal(rows[0].assignedTo,team.assignedNutritionist);
 assert.deepEqual(rows[0].formData.annualNutritionMetrics,['糖化血红蛋白','甘油三酯']);
});
