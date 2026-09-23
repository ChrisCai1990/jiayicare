const test = require('node:test'), assert = require('node:assert/strict');
test('流程列表省略重点观察说明，不改原文或临床限定',async()=>{
 const {serviceTaskTitle}=await import('../../staff/src/utils/serviceTaskTitle.mjs');
 const task={careFlowId:'flow',theme:'报告及资料上传 · 肾脏彩超（重点观察大小、回声均匀性、血流'};
 assert.equal(serviceTaskTitle(task),'报告及资料上传 · 肾脏彩超');
 assert.ok(task.theme.includes('重点观察'));
 for(const theme of ['检查 · MRI（增强）','检查 · 骨密度（DXA）','检查 · 超声'])assert.equal(serviceTaskTitle({careFlowId:'flow',theme}),theme);
 assert.equal(serviceTaskTitle({theme:task.theme}),task.theme);
});
