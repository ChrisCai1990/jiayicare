const test=require('node:test'),assert=require('node:assert/strict');
const {examinations}=require('../src/utils/careFlowExaminations');
const original={id:'exam-0',type:'exam',title:'肾脏超声',hospital:'医院甲',department:'超声科',expert:'',mode:'onsite'};
test('专家更换检查与增补逐项保留原始记录，不修改顾问计划',()=>{
 const before=JSON.stringify(original);
 const rows=examinations([{...original,title:'肾脏MRI',department:'影像科',status:'booked',date:'2026-10-01',time:'09:00',reason:'专家建议更换MRI'}, {id:'added-1',title:'血液检查',hospital:'医院甲',department:'检验科',status:'pending',reason:'专家增补',note:'明日开单后安排'}],[original],'staff');
 assert.equal(rows.length,2);assert.equal(rows[0].original.title,'肾脏超声');assert.equal(rows[0].title,'肾脏MRI');assert.equal(rows[1].status,'pending');assert.equal(JSON.stringify(original),before);
});
test('取消检查无需伪造日期，但需要专家意见；原项目不可直接丢弃',()=>{
 assert.equal(examinations([{...original,status:'cancelled',reason:'专家评估无需检查'}],[original],'s')[0].status,'cancelled');
 assert.throws(()=>examinations([], [original],'s'));
 assert.throws(()=>examinations([{...original,status:'cancelled'}],[original],'s'));
 assert.throws(()=>examinations([{...original,status:'pending'}],[original],'s'));
});
test('变更和增补必须记录原因，重复或伪造项目标识被拒绝',()=>{
 assert.throws(()=>examinations([{...original,title:'MRI',status:'booked'}],[original],'s'));
 assert.throws(()=>examinations([{...original,status:'cancelled',reason:'取消'},{...original,status:'cancelled',reason:'取消'}],[original],'s'));
 assert.throws(()=>examinations([{id:'unknown',title:'MRI',status:'cancelled',reason:'x'}],[],'s'));
});
