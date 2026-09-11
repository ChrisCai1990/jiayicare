const test=require('node:test');
const assert=require('node:assert/strict');
const User=require('../src/models/User');
const Message=require('../src/models/Message');
const ChatLog=require('../src/models/ChatLog');
const HealthRecord=require('../src/models/HealthRecord');
const shared=require('../src/utils/aiMessageFallback');
const originalHealth=shared.buildHealthContext;
shared.buildHealthContext=async id=>{assert.equal(String(id),'patient-a');return '已确认健康档案：测试食物过敏；已审核报告：测试报告';};
const context=require('../src/utils/wecomKfContext');
shared.buildHealthContext=originalHealth;
const query=value=>({select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>value});

test('历史组合排除其他客户、撤回、待审核及转人工日志',()=>{
  const base={user:'patient-a',createdAt:'2026-09-01',type:'user',content:'可见信息'};
  const rows=context.historyRows('patient-a',[
    {...base,_id:'valid'}, {...base,_id:'other',user:'patient-b',content:'他人秘密'},
    {...base,_id:'recall',recalled:true}, {...base,_id:'pending',aiReviewStatus:'pending'},
  ],[{_id:'log',user:'patient-a',role:'wecom_kf',userMessage:'客服提问',aiReply:'客服回复',createdAt:'2026-09-02'},
    {_id:'bad',user:'patient-a',recalled:true,userMessage:'撤回'},
    {_id:'transfer',user:'patient-a',role:'transfer',userMessage:'转接'}]);
  assert.equal(rows.length,3);assert.ok(rows.some(r=>r.source==='微信客服'));assert.ok(!JSON.stringify(rows).includes('他人秘密'));
});

test('上下文按绑定客户查询两套历史，检索不设时间截止，复用已确认档案',async t=>{
  const old={user:User.findById,messages:Message.find,logs:ChatLog.find,records:HealthRecord.find};
  t.after(()=>{User.findById=old.user;Message.find=old.messages;ChatLog.find=old.logs;HealthRecord.find=old.records;});
  User.findById=id=>{assert.equal(id,'patient-a');return query({name:'测试客户',isDeleted:false});};
  const messageQueries=[],logQueries=[];
  Message.find=q=>{messageQueries.push(q);const filter=q.$and?.[0]||q;assert.equal(filter.user,'patient-a');assert.deepEqual(filter.recalled,{$ne:true});assert.ok(filter.aiReviewStatus.$nin.includes('pending'));assert.ok(!JSON.stringify(q).includes('$gte'));return query([{_id:q.$and?'old':'recent',user:'patient-a',type:'user',content:q.$and?'去年提过的午餐习惯':'今天午餐',createdAt:q.$and?'2025-01-01':'2026-09-01'}]);};
  ChatLog.find=q=>{logQueries.push(q);assert.equal((q.$and?.[0]||q).user,'patient-a');return query([{_id:'kf',user:'patient-a',role:'wecom_kf',userMessage:'客服问题',aiReply:'上次客服回答',createdAt:'2026-09-02'}]);};
  HealthRecord.find=q=>{assert.deepEqual(q,{user:'patient-a',deletedAt:null});return query([{label:'体重',value:'60',unit:'kg',recordedAt:'2026-09-01'}]);};
  const result=await context.buildWecomKfContext('patient-a','之前午餐聊了什么');
  assert.equal(messageQueries.length,2);assert.equal(logQueries.length,2);
  for(const text of ['去年提过的午餐习惯','上次客服回答','测试报告','体重'])assert.ok(result.systemPrompt.includes(text));
  assert.equal(result.counts.retrieved,1);assert.equal(result.messages.at(-1).content,'之前午餐聊了什么');
});

test('已删除或不存在的档案不能组装上下文',async t=>{
  const old=User.findById;t.after(()=>{User.findById=old;});
  User.findById=()=>query({isDeleted:true});
  await assert.rejects(context.buildWecomKfContext('patient-a','你好'),/不可用/);
});

test('事实查询可引用记录，医疗判断仍转人工',()=>{
  const {needsHandoff}=require('../src/utils/wecomKf');
  assert.equal(needsHandoff('我的报告名称有哪些'),false);
  assert.equal(needsHandoff('我的过敏记录'),false);
  assert.equal(needsHandoff('我的报告异常应该吃什么药'),true);
  assert.equal(needsHandoff('胸痛，查报告名称'),true);
});
