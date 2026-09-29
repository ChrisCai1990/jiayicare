const test=require('node:test'),assert=require('node:assert/strict');
const {project,list}=require('../src/utils/careFlowFeedbackMessages');
test('反馈只读映射原文与日期，区分待核实和已核实，不虚构人工回复',()=>{
 const f={_id:'flow',patientId:'u',state:{title:'咨询',customerUpload:{declaration:{submittedAt:'2026-09-29T07:00:00Z',label:'无资料',note:'仅咨询'}},data:{upload:{}}}};
 const m=project(f);assert.equal(m.type,'user');assert.equal(m.conversationId,'u_manager');assert.equal(m.isAI,false);assert(m.content.includes('仅咨询'));assert(m.content.includes('等待专员核实'));assert.equal(m.createdAt,f.state.customerUpload.declaration.submittedAt);assert.equal(project(f)._id,m._id);
 f.state.data.upload.noDocuments=true;assert(project(f).content.includes('已核实'));assert.equal(project({state:{}}),null);
});
test('查询按客户和租户限定，只读不写聊天或报告',async()=>{
 let filter;const Flow={find:q=>{filter=q;return {select:()=>({lean:async()=>[]})}}};
 assert.deepEqual(await list('u','tenant',Flow),[]);assert.equal(filter.patientId,'u');assert.equal(filter.tenantId,'tenant');
});
