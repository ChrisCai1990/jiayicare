const test = require('node:test'), assert = require('node:assert/strict');
const config = require('../../shared/careFlow.cjs');
const {advance} = require('../src/utils/careFlowState');
const {runtime,hash} = require('../src/utils/careFlowRuntime');
const {generate} = require('../src/utils/careFlowDraft');
const copy = x => x == null ? x : structuredClone(x);
const people = Object.fromEntries([...new Set(Object.values(config.roles))].map(role=>[role,{id:role,role,name:role}]));
const actor = stage => ({_id:config.roles[stage],role:config.roles[stage],name:config.roles[stage],tenantId:null});
test('退回问题按接收环节区分，并保留当时问题文案',()=>{
  assert.notDeepEqual(config.problemLabels('advisor'),config.problemLabels('booking'));
  for(const target of ['advisor','booking']){
    const event=advance(state('planner'),actor('planner'),'return',{target,category:'missing',reason:'请核对'}).event;
    assert.equal(event.categoryLabel,config.problemLabels(target).missing);
  }
});
const state = stage => ({stage,sequence:0,people:copy(people),returns:[],title:'测试事项',data:{advisor:{text:'医院：医院甲\n科室：内科\n项目：复诊\n原因：原顾问要求'},booking:null,upload:{reportIds:['report']}}});
const get = (o,k)=>k.split('.').reduce((v,p)=>v?.[p],o);
function matches(o,q){return Object.entries(q).every(([k,v])=>{
  const x=get(o,k);if(v instanceof RegExp)return v.test(x||'');
  if(v && typeof v==='object' && !(v instanceof Date))return Object.entries(v).every(([op,a])=>op==='$in'?a.includes(x):op==='$nin'?!a.includes(x):op==='$lt'?x<a:op==='$ne'?x!==a:false);
  return v===null?x==null:x instanceof Date?+x===+v:x===v;
});}
function put(o,k,v){const parts=k.split('.');let p=o;while(parts.length>1)p=p[parts.shift()]??={};p[parts[0]]=copy(v);}
function model(rows){
  const query = v=>({lean:async()=>copy(v),select:()=>query(v)});
  const find=q=>[...rows.values()].filter(o=>matches(o,q));
  const update=async(q,u,opts={})=>{let o=find(q)[0];if(!o&&opts.upsert){o={_id:q._id,...copy(u.$setOnInsert)};rows.set(o._id,o);}if(!o)return {matchedCount:0,modifiedCount:0};
    for(const [k,v] of Object.entries(u.$set||{}))put(o,k,v);
    for(const [k,v] of Object.entries(u.$inc||{}))put(o,k,(get(o,k)||0)+v);
    for(const [k,v] of Object.entries(u.$push||{}))put(o,k,[...(get(o,k)||[]),copy(v)]);
    return {matchedCount:1,modifiedCount:1};};
  return {findOne:q=>query(find(q)[0]),findById:id=>query(rows.get(id)),find:q=>query(find(q)),updateOne:update,
    updateMany:async(q,u)=>{for(const o of find(q))await update({_id:o._id},u)},
    findOneAndUpdate:(q,u,opts)=>({lean:async()=>{await update(q,u,opts);return copy(find(q)[0]);}})};
}
function setup(stage='booking'){
  const flows=new Map([['flow',{_id:'flow',patientId:'patient',tenantId:null,parentId:'parent',annualPlanId:'annual',revision:0,state:state(stage),events:[]}]]);
  const tasks=new Map([['flow',{_id:'flow',careFlowId:'flow',status:'planned'}],['parent',{_id:'parent',plannedContent:'原年度顾问内容',status:'planned'}]]);
  const reports=new Map([['report',{_id:'report',user:'patient',tenantId:null,audit_status:'audited',title:'测试病历',reportItems:[],aiSummary:'已审核内容'}]]);
  const admins=new Map(Object.values(people).map(p=>[p.id,{_id:p.id,...p,tenantId:null,staffStatus:'active'}]));
  const Flow=model(flows),Task=model(tasks),Report=model(reports),User=model(new Map([['patient',{_id:'patient',tenantId:null,assignedFamilyDoctor:'familyDoctor',assignedMedicalAssistant:'medicalAssistant'}]]));
  const api=runtime({Flow,Task,Report,User,Admin:model(admins),enabled:()=>true});
  return {flows,tasks,reports,api,Flow,Task};
}
async function complete(s,value){const f=s.flows.get('flow');return s.api.action('flow',actor(f.state.stage),{action:'complete',revision:f.revision,confirmed:true,correction:'已核对修订',value});}
test('pure reminder visits use upload/audit/advisor path without dispatch; idempotent and immutable original',async()=>{
 const s=setup();s.flows.clear();s.tasks.clear();
 s.tasks.set('flow',{_id:'flow',patientId:'patient',assignedTo:'healthManager',sourceType:'scheduled',sourceScheduleKey:'medical_treatment:2026-09-23',deliveryMode:'reminder',status:'in_progress',updatedAt:0,plannedContent:'原年度计划',progressRecords:[{outcome:'visited',visitDate:'2026-09-23',content:'已就医，待报告'}]});
 const first=await s.api.startReminder('flow',actor('upload'));
 await s.api.startReminder('flow',actor('upload'));
 assert.equal(s.flows.size,1);assert.equal(s.tasks.size,2);assert.equal(first.state.stage,'upload');
 assert.deepEqual(config.targets(first.state),['advisor']);
 const projected=require('../src/utils/careFlowClientPlans').projectTasks(first);
 assert.equal(projected.filter(p=>p.uploadReminder).length,1);assert.equal(projected[0].dueDate,'2026-09-23');
 await complete(s,{reportIds:['report'],note:'资料齐全'});
 s.reports.get('report').audit_status='unaudited';
 await assert.rejects(complete(s,{note:'审核'}),/每份/);
 s.reports.get('report').audit_status='audited';await complete(s,{note:'已审核'});
 assert.equal(s.tasks.get('flow').status,'in_progress');
 await generate(s.api,'flow',actor('draft'),false,async()=>JSON.stringify({content:'医嘱随访草稿',date:'2099-01-01'}));
 assert.equal(s.flows.get('flow').state.stage,'review');
 const final=await complete(s,{content:'顾问核对后的计划',date:'2099-01-01',note:'核对通过'});
 await s.api.sync(final);
 assert.equal(s.tasks.get('flow').status,'completed');assert.equal(s.tasks.get('flow').plannedContent,'原年度计划');
 assert.equal([...s.tasks.values()].filter(t=>t.sourceScheduleKey==='care-followup:flow').length,1);
 assert.ok([...s.tasks.values()].every(t=>!['healthPlanner','medicalAssistant'].includes(t.assignedTo)));
});
test('专员结束后健管承接报告，客户上传资料可关联，跨客户资料和未审核资料不能过关',async()=>{
 const s=setup('execute');await complete(s,{text:'检查安排已交接'});
 const flow=s.flows.get('flow'),task=s.tasks.get(hash(`care:flow:${flow.state.sequence}`));
 assert.equal(task.assignedTo,'healthManager');assert.equal(task.workflowKey,'care_flow:upload');
 await assert.rejects(s.api.action('flow',actor('execute'),{action:'complete',revision:flow.revision,confirmed:true,value:{reportIds:['report'],note:'完整'}}),/负责人/);
 s.reports.set('customer',{_id:'customer',user:'patient',tenantId:null,title:'客户已上传',audit_status:'unaudited'});
 s.reports.set('foreign',{_id:'foreign',user:'other',tenantId:null,audit_status:'audited'});
 await assert.rejects(complete(s,{reportIds:['foreign'],note:'核对'}),/不属于/);
 await complete(s,{reportIds:['customer'],note:'已核对是本次检查报告'});
 await assert.rejects(complete(s,{note:'审核'}),/每份/);
 s.reports.get('customer').audit_status='audited';await complete(s,{note:'资料齐全已审核'});assert.equal(s.flows.get('flow').state.stage,'draft');
});
test('已有上传任务归属自愈仅改当前活动负责人，留痕且不重复建任务',async()=>{
 const s=setup('upload'),flow=s.flows.get('flow'),key=hash('care:flow:0');
 s.tasks.set(key,{_id:key,careFlowId:'flow',workflowKey:'care_flow:upload',assignedTo:'medicalAssistant',status:'planned'});
 await s.api.sync(flow);await s.api.sync(flow);
 assert.equal(s.tasks.get(key).assignedTo,'healthManager');assert.equal(s.flows.get('flow').events.filter(e=>e.action==='upload_owner_updated').length,1);
});
test('专员提交待预约检查可进入上传环节；遗漏字段明确提示且不推进状态',async()=>{
  const s=setup('execute');
  const exam={id:'exam-0',type:'exam',title:'肾脏超声',hospital:'医院甲',department:'超声科',mode:'onsite'};
  s.flows.get('flow').state.data.booking={entries:[exam]};
  const value={text:'专家沟通已完成',examinations:[{...exam,status:'pending',note:'先开单，缴费，再预约'}]};
  await assert.rejects(complete(s,{...value,text:''}),/专家沟通与实际办理结果/);
  await assert.rejects(complete(s,{...value,examinations:[{...value.examinations[0],department:''}]}),/第1项检查：请填写检查科室/);
  assert.equal(s.flows.get('flow').state.stage,'execute');
  const saved=await complete(s,value);
  assert.equal(saved.state.stage,'upload');assert.equal(saved.state.data.execute.onsite[0].status,'pending');
});

test('全部人工环节可定向回退；修订直返且原年度内容不变',()=>{
  for(const stage of config.stages.slice(1))for(const target of config.targets(state(stage))){
    const original=state(stage),before=copy(original);
    const r=advance(original,actor(stage),'return',{target,category:'missing',reason:'补充依据'},new Date('2026-09-23T00:00:00Z'));
    assert.equal(r.state.stage,target);assert.equal(r.event.targetId,people[config.roles[target]].id);
    const c=advance(r.state,actor(target),'complete',{confirmed:true,correction:'已补充',value:{text:'修订'}},new Date('2026-09-23T01:00:00Z'));
    assert.equal(c.state.stage,stage);assert.equal(c.state.returns.length,0);assert.equal(c.event.durationMs,3600000);assert.deepEqual(original,before);
    assert.equal(c.event.returnToId,actor(stage)._id);assert.equal(c.event.before.advisor.text,before.data.advisor.text);
  }
});
test('嵌套回退逐层直返，草稿失效标志穿透嵌套',()=>{
  let s=state('review');s.data.draft={content:'旧草稿'};
  s=advance(s,actor('review'),'return',{target:'planner',category:'handoff',reason:'核对交接'}).state;
  s=advance(s,actor('planner'),'return',{target:'advisor',category:'inaccurate',reason:'核对依据'}).state;
  s=advance(s,actor('advisor'),'complete',{confirmed:true,correction:'改正依据',value:{text:'新依据'}}).state;
  assert.equal(s.stage,'planner');assert.equal(s.bookingStale,true);assert.equal(s.draftStale,true);
  s=advance(s,actor('planner'),'complete',{confirmed:true,correction:'核对完成',value:{note:'已核对'}}).state;
  assert.equal(s.stage,'review');assert.equal(s.returns.length,0);assert.equal(s.draftStale,true);
});
test('禁止越权、前进伪装回退、缺原因、缺确认、缺修订说明及已结束改写',()=>{
  const s=state('planner');
  assert.throws(()=>advance(s,actor('booking'),'return',{target:'advisor',category:'missing',reason:'原因'}),/负责人/);
  for(const data of [{target:'upload',category:'missing',reason:'原因'},{target:'advisor',category:'invalid',reason:'原因'},{target:'advisor',category:'missing',reason:''}])assert.throws(()=>advance(s,actor('planner'),'return',data));
  assert.throws(()=>advance(s,actor('planner'),'complete',{value:{}}),/确认/);
  const r=advance(s,actor('planner'),'return',{target:'advisor',category:'missing',reason:'原因'}).state;
  assert.throws(()=>advance(r,actor('advisor'),'complete',{confirmed:true,value:{}}),/填写/);
  assert.throws(()=>advance(state('closed'),{role:'superadmin'},'return',{}),/结束/);
});
test('完整执行、审核、生成、顾问审核链路；重复同步只生成一个新随访',async()=>{
  const s=setup(),original=copy(s.tasks.get('parent'));
  await complete(s,{date:'2026-12-02',time:'09:00'});
  await complete(s,{assigneeId:'medicalAssistant',note:'按顾问要求'});
  await complete(s,{text:'专家意见与办理结果'});
  await complete(s,{reportIds:['report'],note:'本次资料齐全'});
  await complete(s,{note:'逐份已核对'});
  assert.equal(s.flows.get('flow').state.stage,'draft');assert.equal(s.tasks.get('flow').status,'planned');
  await generate(s.api,'flow',actor('draft'),false,async()=>JSON.stringify({content:'跟进专家要求',date:'2099-01-01'}));
  assert.equal(s.flows.get('flow').state.stage,'review');
  const result=await complete(s,{content:'顾问审核后的随访',date:'2099-01-01',note:'审核通过'});
  assert.equal(result.state.finalized,true);assert.equal(s.tasks.get('flow').status,'completed');
  await s.api.sync(result);await s.api.sync(result);
  assert.equal([...s.tasks.values()].filter(t=>t.sourceScheduleKey==='care-followup:flow').length,1);
  assert.equal(s.tasks.get(hash('care-followup:flow')).content,'顾问审核后的随访');assert.deepEqual(s.tasks.get('parent'),original);
});
test('跨租户、非参与人、过期版本以及未审核资料不能流转',async()=>{
  const s=setup('audit');
  await assert.rejects(s.api.view('flow',{...actor('audit'),tenantId:'other'}),/未找到/);
  await assert.rejects(s.api.view('flow',{...actor('audit'),_id:'other'}),/权限/);
  await assert.rejects(s.api.action('flow',actor('audit'),{action:'complete',revision:9}),/已更新/);
  s.reports.get('report').audit_status='unaudited';await assert.rejects(complete(s,{note:'通过'}),/逐份|每份/);
  assert.equal(s.flows.get('flow').state.stage,'audit');
});
test('未生成或已失效草稿不能被顾问批准',async()=>{
  const s=setup('review');await assert.rejects(complete(s,{content:'计划',date:'2099-01-01',note:'通过'}),/草稿/);
  s.flows.get('flow').state.data.draft={content:'旧草稿'};s.flows.get('flow').state.draftStale=true;
  await assert.rejects(complete(s,{content:'计划',date:'2099-01-01',note:'通过'}),/草稿/);
});
test('重复动作竞争只有一个成功，旧同步不关闭新任务',async()=>{
  const s=setup('execute'),old=copy(s.flows.get('flow'));
  const outcomes=await Promise.allSettled([complete(s,{text:'执行结果A'}),complete(s,{text:'执行结果B'})]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
  const current=copy(s.flows.get('flow'));await s.api.sync(old);
  assert.equal(s.tasks.get(hash(`care:flow:${current.state.sequence}`)).status,'planned');
});
test('AI失败保留阶段及历史、不关闭服务；相同依据重用已生成草稿',async()=>{
  const s=setup('draft');let calls=0;
  await assert.rejects(generate(s.api,'flow',actor('draft'),false,async()=>{throw new Error('测试超时')}),/测试超时/);
  assert.equal(s.flows.get('flow').state.stage,'draft');assert.equal(s.flows.get('flow').state.generating,null);
  const chat=async()=>{calls++;return JSON.stringify({content:'已审核依据的草稿',date:''})};
  await generate(s.api,'flow',actor('draft'),false,chat);
  s.flows.get('flow').state.draftStale=true;
  await generate(s.api,'flow',actor('review'),false,chat);assert.equal(calls,1);
  assert.equal(s.flows.get('flow').events.filter(e=>e.action==='draft_generated').length,2);
});
test('质量统计保留分类、人员、重复和修订耗时，不自动判定过错',()=>{
  const r={action:'return',token:'1',targetStage:'booking',targetId:'a',targetName:'甲',category:'hospital',at:new Date(),reason:'医院调整'};
  const f={_id:'flow',state:{title:'测试'},events:[r,{...r,token:'2'},{action:'correct',token:'1',durationMs:3600000,correction:'已核对'},{action:'quality_review',token:'1',personnelIssueConfirmed:false,note:'医院原因',improvement:'提前核对'}]};
  const v=require('../src/utils/careQuality').summarize([f]);assert.equal(v.returns,2);assert.equal(v.groups[0].repeatCount,1);assert.equal(v.groups[0].averageHours,1);assert.equal(v.rows[0].reviews[0].personnelIssueConfirmed,false);
});
test('接入已有预约事项复制交接、不修改原计划，重试不重复建流程',async()=>{
  const s=setup();s.flows.clear();
  s.tasks.set('flow',{_id:'flow',patientId:'patient',assignedTo:'healthPlanner',sourceAnnualPlanId:'annual',sourceType:'annual_service',workflowKey:'service_request',sourceScheduleKey:'service-request:abnormal_followup:0:2026-12-02',taskRole:'supervisor',status:'planned',updatedAt:0,formData:{serviceRequest:{mode:'single',moduleKey:'abnormal_followup',itemSnapshot:{hospital:'医院甲',items:'复查'}}}});
  s.tasks.set('parent',{_id:'parent',patientId:'patient',sourceType:'scheduled',sourceAnnualPlanId:'annual',sourceScheduleKey:'abnormal_followup:2026-12-02:医院甲',assignedTo:'healthManager',deliveryMode:'single',status:'planned',plannedContent:'原顾问计划'});
  const first=await s.api.start('flow',actor('planner'));assert.equal(first.state.stage,'booking');assert.equal(first.state.data.advisor.text,'原顾问计划');
  await s.api.start('flow',actor('planner'));assert.equal(s.flows.size,1);assert.equal(s.tasks.size,3);assert.equal(s.tasks.get('parent').plannedContent,'原顾问计划');
});
test('生成期间新版本不被过期AI响应覆盖',async()=>{
  const s=setup('draft');
  await assert.rejects(generate(s.api,'flow',actor('draft'),false,async()=>{s.flows.get('flow').revision++;s.flows.get('flow').state.data.advisor.text='新修订';return '{"content":"旧响应","date":""}'}),/未覆盖/);
  assert.equal(s.flows.get('flow').state.data.advisor.text,'新修订');assert.equal(s.flows.get('flow').state.data.draft,undefined);
});
