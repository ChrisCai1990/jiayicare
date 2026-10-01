const test=require('node:test'),assert=require('node:assert/strict');
const {apply,clean}=require('../src/utils/reviewPlanAmendment');
const item={key:'abnormal_followup',title:'CYFRA21-1',reason:'研判引用报告异常',advice:'复查，时间由顾问核对',date:'',timingReason:''};
test('补漏保留其他内容及同项执行信息，不重复追加',()=>{
 const base={vaccine:{records:[{name:'原项目'}]},abnormal_followup:{records:[{items:'CYFRA21－1',hospital:'既定机构',time:'2026-11-01',notes:'保留备注',followUpStaff:'staff'}]}};
 const next=apply(base,[item],{topicId:'t',messageId:'m'});
 assert.deepEqual(next.moduleData.vaccine,base.vaccine);
 const row=next.moduleData.abnormal_followup.records[0];
 assert.equal(next.moduleData.abnormal_followup.records.length,1);assert.equal(row.hospital,'既定机构');assert.equal(row.time,'2026-11-01');assert.equal(row.notes,'保留备注');
 assert.match(row.reason,/复查/);assert.equal(base.abnormal_followup.records[0].items,'CYFRA21－1');
 assert.equal(apply(next.moduleData,[item],{}).moduleData.abnormal_followup.records.length,1);
});
test('顾问可指定别名事项更新；新项独立追加并留前后快照',()=>{
 const base={abnormal_followup:{records:[{items:'细胞角蛋白19片段',reason:'旧依据'}]}};
 const updated=apply(base,[{...item,target:0}],{});
 assert.equal(updated.moduleData.abnormal_followup.records.length,1);assert.equal(updated.changes[0].before.reason,'旧依据');
 assert.equal(apply(base,[{...item,title:'另一项目'}],{}).moduleData.abnormal_followup.records.length,2);
 assert.throws(()=>apply(base,[{...item,target:4}],{}));
});
test('拒绝缺依据、错误日期、越权模块和隐藏注入字段',()=>{
 for(const edit of [{reason:''},{key:'__proto__'},{date:'2026-02-30',timingReason:'test'},{date:'2026-11-01'}])assert.throws(()=>clean([{...item,...edit}]));
 assert.equal(clean([{...item,standardPlanName:'篡改模板',followUpStaff:'任意'}])[0].followUpStaff,undefined);
});
test('HTTP权限、跨患者来源、版本冲突和成功留痕，AI使用隔离桩',async t=>{
 const logic=require('../src/utils/reviewPlanAmendment');const originalCatalog=logic.templateCatalog;logic.templateCatalog=async()=>[];t.after(()=>{logic.templateCatalog=originalCatalog});
 const express=require('express'),mongoose=require('mongoose');
 const id=()=>new mongoose.Types.ObjectId().toString();const patient=id(),planId=id(),topicId=id(),messageId=id();
 let written=null;const plan={_id:planId,patientId:patient,updatedAt:new Date('2026-09-30T00:00:00Z'),moduleData:{}};
 const topic={title:'测试',messages:[{_id:messageId,role:'ai',content:'复查项目',createdAt:new Date()}]};
 const paths=['../src/middleware/staffAuth','../src/models/AnnualPlan','../src/models/AiCaseReview','../src/utils/ai'].map(p=>require.resolve(p));
 const old=paths.map(p=>require.cache[p]);let role='familyDoctor',visible=[patient],sourceExists=true;
 let aiInput;
 const mocks=[(req,res,next)=>{req.staff={role,_id:id()};next()}, {findOne:q=>({select:()=>({lean:async()=>q.patientId===patient?plan:null})}),updateOne:async(q,u)=>{written={q,u};return {modifiedCount:1}}}, {findOne:q=>({lean:async()=>sourceExists&&q.user===patient?topic:null})},{chat:async messages=>{aiInput=JSON.parse(messages[0].content);return JSON.stringify({items:[item]})}}];
 paths.forEach((p,i)=>require.cache[p]={id:p,filename:p,loaded:true,exports:mocks[i]});
 const route=require.resolve('../src/routes/reviewPlanAmendments');delete require.cache[route];
 const app=express();app.use(express.json());app.use(require(route)({getVisiblePlanPatientIds:async()=>visible}));
 const server=app.listen(0);t.after(()=>{server.close();paths.forEach((p,i)=>{if(old[i])require.cache[p]=old[i];else delete require.cache[p]});delete require.cache[route]});
 const call=async body=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/${patient}/review-plan-amendment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId,topicId,messageId,...body})});return {status:r.status,...await r.json()}};
 role='nutritionist';assert.equal((await call({action:'preview'})).status,403);role='familyDoctor';visible=[];assert.equal((await call({action:'preview'})).status,403);visible=[patient];
 sourceExists=false;assert.equal((await call({action:'preview'})).success,false);sourceExists=true;
 const preview=await call({action:'preview'});assert.equal(preview.success,true);assert.equal(written,null);
 assert.equal((await call({action:'apply',...preview.data,confirmed:true,baseUpdatedAt:'old'})).status,409);
 assert.equal((await call({action:'apply',...preview.data,confirmed:false})).success,false);
 assert.equal((await call({action:'apply',...preview.data,confirmed:true})).success,true);
 assert.equal(written.u.$push.supplementRevisions.taskStatus,'not_created');assert.deepEqual(written.q.updatedAt,plan.updatedAt);
 assert.equal(written.u.$set.moduleData.abnormal_followup.records.length,1);
 topic.messages.push({_id:id(),role:'staff',content:'更正前面意见，请按最新讨论'});
 const batch=await call({action:'preview',scope:'topic',messageId:undefined});
 assert.equal(batch.success,true);assert.equal(aiInput.discussion.messages.length,2);assert.deepEqual(aiInput.existingPlan,plan.moduleData);
 topic.messages.push({_id:id(),role:'ai',content:'又有新的意见'});
 assert.equal((await call({action:'apply',...batch.data,confirmed:true,messageId:undefined})).status,409);
});
test('不规范/相对日期可进入预览，待确认可保存而不编造日期',()=>{
 const {previewItems}=require('../src/utils/reviewPlanAmendment');
 assert.deepEqual(previewItems([]),[]);
 for(const date of ['三个月后','2026-02-30','2026-11-01']) {
   const result=previewItems([{...item,date}])[0];
   assert.equal(result.date,'');assert.equal(result.datePending,true);assert.equal(result.timeWindow,date);
   const saved=apply({abnormal_followup:{records:[{items:item.title,time:'2026-10-01'}]}},[result],{});
   assert.equal(saved.moduleData.abnormal_followup.records[0].time,'');assert.equal(saved.moduleData.abnormal_followup.records[0].timingStatus,'pending_confirmation');
 }
 assert.equal(previewItems([{...item,date:'2026-11-01',timingReason:'已核实原文日期'}])[0].date,'2026-11-01');
});

test('跨板块迁移两项不串位，标准内容来自目录并保留原依据',()=>{
 const catalog=[{id:'water',hash:'v1',name:'饮水指导',content:'库内标准',schedule:'顾问确认',cycles:[],role:'healthManager'},{id:'nutrition',hash:'v2',name:'营养师评估',content:'库内评估标准',schedule:'顾问确认',cycles:[],role:'nutritionist'}];
 const base={abnormal_followup:{records:[{items:'真正复查',reason:'保留'},{items:'原饮水项',reason:'依据一'},{items:'原营养项',reason:'依据二'}]}};
 const items=catalog.map((t,i)=>({...item,key:'personalized_followups',standardPlanId:t.id,templateHash:t.hash,title:t.name,reason:'原依据',advice:'最终建议',moveFrom:{key:'abnormal_followup',index:i+1},datePending:true}));
 const result=apply(base,items,{topicId:'t'},catalog);
 assert.equal(result.moduleData.abnormal_followup.records.length,1);assert.equal(result.moduleData.abnormal_followup.records[0].items,'真正复查');
 assert.equal(result.moduleData.personalized_followups.records.length,2);assert.equal(result.moduleData.personalized_followups.records[0].standardContent,'库内标准');
 assert.equal(result.changes.find(c=>c.after===null&&c.index===1).before.reason,'依据一');assert.equal(result.changes.filter(c=>c.after===null).length,2);
 assert.equal(base.abnormal_followup.records.length,3);
 assert.throws(()=>apply(base,items,{},[]),/有效Admin模板/);
 assert.throws(()=>apply(base,[{...items[0],templateHash:'old'}],{},catalog),/模板已变化/);
 assert.throws(()=>apply(base,[items[0],items[0]],{},catalog),/重复选择/);
 const retry=apply(result.moduleData,[{...items[0],moveFrom:undefined}],{},catalog);assert.equal(retry.moduleData.personalized_followups.records.length,2);
});

test('显式删除留原因及原内容，批量删除不串位且AI不得删除',()=>{
 const {previewItems}=require('../src/utils/reviewPlanAmendment');
 const base={abnormal_followup:{records:[{items:'A'},{items:'B'},{items:'C'}]}};
 const remove=target=>({key:'abnormal_followup',target,operation:'remove',deletionReason:'重复事项'});
 const result=apply(base,[remove(0),remove(2)],{});
 assert.deepEqual(result.moduleData.abnormal_followup.records,[{items:'B'}]);
 assert.equal(result.changes[0].deletionReason,'重复事项');assert.equal(result.changes[0].before.items,'C');assert.equal(base.abnormal_followup.records.length,3);
 assert.throws(()=>apply(base,[{...remove(0),deletionReason:''}],{}));
 assert.throws(()=>apply(base,[remove(0),remove(0)],{}));
 assert.throws(()=>apply(base,[remove(9)],{}));
 assert.throws(()=>previewItems([remove(0)]),/顾问手动/);
});
