const test=require('node:test'),assert=require('node:assert/strict');
const {project}=require('../src/utils/careFlowClientPlans');
test('上传提醒独立关闭，安排仍保留，未定日期不显示今天',()=>{
 const {projectTasks}=require('../src/utils/careFlowClientPlans');
 const f={_id:'flow',state:{stage:'upload',data:{execute:{onsite:[{id:'exam',title:'检查',type:'exam',status:'pending'}]}}}};
 const before=projectTasks(f);assert.equal(before.length,2);assert.equal(before[0].scheduleLabel,'待安排');assert.equal(before[0].dueDate,undefined);assert.equal(before[1].uploadReminder,true);
 f.state.customerUpload={completedAt:'now'};const after=projectTasks(f);assert.equal(after.length,1);assert.equal(after[0].canUploadReports,false);assert.equal(f.state.stage,'upload');
});
test('客户与健管读取实际检查时间，未安排不冒充门诊日期，内部依据不外泄',()=>{
 const flow={_id:'flow',state:{stage:'upload',title:'检查',data:{advisor:{text:'内部研判'},booking:{entries:[{id:'outpatient',title:'门诊',status:'booked',date:'2026-09-28',time:'09:00'},{id:'exam',type:'exam',title:'肾脏彩超',mode:'onsite',status:'pending'}]},execute:{text:'内部意见',onsite:[{id:'exam',type:'exam',title:'MRI',hospital:'医院',department:'影像科',status:'booked',date:'2026-10-03',time:'14:00',reason:'内部原因'}]}}}};
 const original=structuredClone(flow),rows=project(flow);
 assert.equal(rows[1].dueDate,'2026-10-03');assert.equal(rows[1].dueTime,'14:00');assert.ok(rows[1].customerReadOnly);assert.ok(rows[1].canUploadReports);assert.ok(!JSON.stringify(rows).includes('内部'));assert.deepEqual(flow,original);
 flow.state.data.execute.onsite[0].status='pending';const pending=project(flow)[1];assert.equal(pending.dueDate,undefined);assert.match(pending.description,/具体日期尚未确认/);
 flow.state.data.execute.onsite[0].status='cancelled';assert.equal(project(flow).length,1);
 flow.state.stage='execute';assert.deepEqual(project(flow),[]);
});
test('健管审核后不再把已完成就医显示为即将，顾问确认前只显示待确认状态',()=>{
 const {projectTasks}=require('../src/utils/careFlowClientPlans');
 const flow={_id:'flow',state:{stage:'draft',title:'肾脏彩超',data:{audit:{note:'内部审核意见'},booking:{entries:[{id:'exam',type:'exam',title:'肾脏彩超',status:'booked',date:'2026-09-28',time:'09:00'}]},execute:{onsite:[]},draft:{content:'未经顾问核对的草稿',date:'2026-10-10'}}}};
 const rows=projectTasks(flow);
 assert.equal(rows[0].status,'completed');
 assert.equal(rows[1].status,'pending');
 assert.equal(rows[1].scheduleLabel,'待顾问确认');
 assert.ok(!JSON.stringify(rows).includes('内部审核意见'));
 assert.ok(!JSON.stringify(rows).includes('未经顾问核对的草稿'));
 flow.state.stage='review';assert.equal(projectTasks(flow).filter(r=>r.status==='pending').length,1);
 flow.state.stage='closed';assert.equal(projectTasks(flow).filter(r=>r.status==='pending').length,0);
});
test('两个就医服务的上传提醒标明对应名称、日期及独立服务编号',()=>{
 const {projectTasks}=require('../src/utils/careFlowClientPlans');
 const make=(id,date)=>({_id:id,state:{stage:'upload',title:'专家约诊',data:{booking:{entries:[{id:'visit',title:'门诊',status:'booked',date,time:'09:00'}]},execute:{onsite:[]}}}});
 const first=projectTasks(make('a'.repeat(24),'2026-09-28')).find(row=>row.uploadReminder);
 const second=projectTasks(make('b'.repeat(24),'2026-10-02')).find(row=>row.uploadReminder);
 assert.match(first.title,/专家约诊.*2026-09-28/);
 assert.match(second.title,/专家约诊.*2026-10-02/);
 assert.notEqual(first.careFlowId,second.careFlowId);
 assert.match(first.description,/服务编号：aaaaaa/);
 assert.match(second.description,/服务编号：bbbbbb/);
});
