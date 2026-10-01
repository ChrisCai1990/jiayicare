const test = require('node:test'), assert = require('node:assert/strict');
test('流程列表省略重点观察说明，不改原文或临床限定',async()=>{
 const {serviceTaskTitle}=await import('../../staff/src/utils/serviceTaskTitle.mjs');
 const task={careFlowId:'flow',theme:'报告及资料上传 · 肾脏彩超（重点观察大小、回声均匀性、血流'};
 assert.equal(serviceTaskTitle(task),'报告及资料上传 · 肾脏彩超');
 assert.ok(task.theme.includes('重点观察'));
 for(const theme of ['检查 · MRI（增强）','检查 · 骨密度（DXA）','检查 · 超声'])assert.equal(serviceTaskTitle({careFlowId:'flow',theme}),theme);
 assert.equal(serviceTaskTitle({theme:task.theme}),task.theme);
});
test('专家约诊旧记录按订单服务显示，医疗代诊预约仍归医疗代诊',async()=>{
 const {serviceTaskTitle}=await import('../../staff/src/utils/serviceTaskTitle.mjs');
 const theme='医疗代诊：健管专员完成专家门诊预约 · 专家约诊服务';
 assert.equal(serviceTaskTitle({theme,sourceOrderId:{serviceName:'专家约诊服务'}}),'专家约诊：健管专员完成专家门诊预约 · 专家约诊服务');
 assert.equal(serviceTaskTitle({theme}), '专家约诊：健管专员完成专家门诊预约 · 专家约诊服务');
 assert.equal(serviceTaskTitle({theme:'医疗代诊：健管专员完成专家门诊预约 · 医疗代诊服务',sourceOrderId:{serviceName:'医疗代诊服务'}}),'医疗代诊：健管专员完成专家门诊预约 · 医疗代诊服务');
});
