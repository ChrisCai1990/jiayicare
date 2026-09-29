const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('../src/utils/careFlowCustomerUpload');
function setup(){
  const id='a'.repeat(24),user={_id:'b'.repeat(24),tenantId:'tenant'};
  const flow={_id:id,patientId:user._id,tenantId:'tenant',revision:1,events:[],state:{stage:'upload',data:{execute:{onsite:[]},upload:{reportIds:[]},advisor:{text:'immutable'}}}};
  const reports=new Map();let race=false;
  const match=(r,q)=>r&&Object.entries(q).every(([k,v])=>v?.$in?v.$in.includes(r[k]):r[k]===v);
  const query=value=>({select(){return this},lean:async()=>structuredClone(value)});
  const Flow={findOne:q=>query(match(flow,q)?flow:null),updateOne:async(q,u)=>{if(race||!match(flow,q))return {modifiedCount:0};for(const [key,value] of Object.entries(u.$set)){const parts=key.split('.');let o=flow;for(const p of parts.slice(0,-1))o=o[p]??={};o[parts.at(-1)]=structuredClone(value)}flow.revision++;flow.events.push(u.$push.events);return {modifiedCount:1}}};
  const Report={find:q=>query([...reports.values()].filter(r=>match(r,q))),countDocuments:async q=>[...reports.values()].filter(r=>match(r,q)).length,findOneAndUpdate:async(q,u)=>{if(!reports.has(q._id))reports.set(q._id,{...q,...u.$setOnInsert});return reports.get(q._id)}};
  const api=runtime({Flow,Report,enabled:()=>true,verify:token=>JSON.parse(token)});
  const input=(key,category='exam_report')=>({title:key,category,uploadToken:JSON.stringify({scope:'report-upload',userId:user._id,key,url:'https://storage/'+key,mimeType:'image/jpeg'})});
  return {api,id,user,flow,reports,input,race:()=>{race=true},unrace:()=>{race=false}};
}
test('三类资料逐份保留、自动关联；确认只关闭客户提醒，不越过健管审核',async()=>{
  const x=setup();
  for(const category of ['exam_report','outpatient_record','prescription_order'])await x.api.add(x.id,x.user,x.input(category,category));
  assert.equal(x.reports.size,3);assert.equal(x.flow.state.data.upload.reportIds.length,3);
  assert.equal(x.flow.state.customerUpload,undefined);
  const result=await x.api.complete(x.id,x.user,{confirmed:true});assert.equal(result.completed,true);assert.equal(result.canUpload,false);
  assert.equal(x.flow.state.stage,'upload');assert.equal(x.flow.state.data.advisor.text,'immutable');
  assert.ok([...x.reports.values()].every(r=>r.audit_status==='unaudited'));
  const revision=x.flow.revision;await x.api.complete(x.id,x.user,{confirmed:true});assert.equal(x.flow.revision,revision);
  await assert.rejects(x.api.add(x.id,x.user,x.input('extra')),/常规上传/);
});
test('重试不重复建报告；并发冲突保留原件但不误结束提醒',async()=>{
  const x=setup();x.race();await assert.rejects(x.api.add(x.id,x.user,x.input('one')),/刷新重试/);
  assert.equal(x.reports.size,1);assert.equal(x.flow.state.customerUpload,undefined);
  x.unrace();await x.api.add(x.id,x.user,x.input('one'));const revision=x.flow.revision;
  await x.api.add(x.id,x.user,x.input('one'));assert.equal(x.reports.size,1);assert.equal(x.flow.revision,revision);
  x.race();await assert.rejects(x.api.complete(x.id,x.user,{confirmed:true}),/刷新重试/);assert.equal(x.flow.state.customerUpload,undefined);
});
test('拒绝跨客户、跨租户、无凭证、非法类目、空资料、漏确认和阶段越权',async()=>{
  const x=setup();
  await assert.rejects(x.api.view(x.id,{...x.user,_id:'c'.repeat(24)}),/任务不存在/);
  await assert.rejects(x.api.view(x.id,{...x.user,tenantId:'other'}),/任务不存在/);
  await assert.rejects(x.api.complete(x.id,x.user,{confirmed:true}),/先上传/);
  await assert.rejects(x.api.add(x.id,x.user,{...x.input('one'),uploadToken:'bad'}),/凭证/);
  await assert.rejects(x.api.add(x.id,x.user,{...x.input('one'),uploadToken:JSON.stringify({scope:'report-upload',userId:'other',key:'key',url:'url'})}),/凭证/);
  await assert.rejects(x.api.add(x.id,x.user,x.input('one','bad')),/资料类型/);
  await x.api.add(x.id,x.user,x.input('one'));
  await assert.rejects(x.api.complete(x.id,x.user,{}),/确认/);
  x.flow.state.stage='review';await assert.rejects(x.api.add(x.id,x.user,x.input('two')),/资料收集/);
  x.flow.state.stage='audit';await x.api.add(x.id,x.user,x.input('two'));assert.equal(x.flow.state.stage,'audit');
  x.reports.delete(x.flow.state.data.upload.reportIds[0]);await assert.rejects(x.api.complete(x.id,x.user,{confirmed:true}),/资料已变更/);
});

test('无资料声明持久化、幂等且跨客户隔离；不创建报告或完成上传',async()=>{
 const x=setup();const result=await x.api.declare(x.id,x.user,{kind:'no_exam',note:'仅咨询，无检查'});
 assert.equal(result.declaration.kind,'no_exam');assert.equal(result.completed,false);assert.equal(result.canUpload,true);assert.equal(x.reports.size,0);
 const revision=x.flow.revision;await x.api.declare(x.id,x.user,{kind:'no_exam',note:'仅咨询，无检查'});assert.equal(x.flow.revision,revision);
 await assert.rejects(x.api.declare(x.id,{...x.user,_id:'c'.repeat(24)},{kind:'pending'}),/任务不存在/);
 await assert.rejects(x.api.declare(x.id,x.user,{kind:'other'}),/具体情况/);
 await assert.rejects(x.api.declare(x.id,x.user,{kind:'unknown'}),/请选择/);
 x.race();await assert.rejects(x.api.declare(x.id,x.user,{kind:'no_print'}),/刷新重试/);assert.equal(x.flow.state.customerUpload.declaration.kind,'no_exam');
});

test('声明后首页改为专员待核实，核实无资料后停止客户上传任务',async()=>{
 const x=setup();x.flow.state.data.execute.onsite=[{id:'visit',type:'consultation',title:'门诊',status:'done'}];
 const project=require('../src/utils/careFlowClientPlans').projectTasks;
 await x.api.declare(x.id,x.user,{kind:'no_print',note:'医院没有打印'});
 let task=project(x.flow).find(t=>t.uploadReminder);assert.equal(task.scheduleLabel,'已反馈，待专员核实');assert.equal(task.assignee,'健管专员');assert.equal(task.documentDeclaration.kind,'no_print');
 x.flow.state.data.upload.noDocuments=true;
 assert.equal(project(x.flow).some(t=>t.uploadReminder),false);assert.equal((await x.api.view(x.id,x.user)).canUpload,false);
 await assert.rejects(x.api.declare(x.id,x.user,{kind:'pending'}),/专员已核实/);
});
