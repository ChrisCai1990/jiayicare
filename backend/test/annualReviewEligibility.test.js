const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibility, examReports } = require('../src/utils/annualReviewEligibility');
const now = new Date('2026-10-07T08:00:00Z');
const split = ['血常规', '肝功能', '尿常规', '心电图', '腹部超声'].map((title,i) => ({_id:String(i), title, type:'other', audit_status:'audited', checkDate:'2026-06-01', reportItems:[{name:title}]}));
test('audited split exam batch is detected without changing legacy categories', () => {
 assert.equal(eligibility(split,now).allowed,true);
 assert.equal(eligibility(split,now).latest.date,'2026-06-01');
 assert.equal(examReports(split).length,5);
 assert.equal(eligibility(split.map(r=>({...r,documentCategory:'other_customer_material'})),now).allowed,true);
});
test('unreviewed, stale and future batches are rejected', () => {
 for(const change of [{audit_status:'pending'},{checkDate:'2025-10-06'},{checkDate:'2026-10-08'},{checkDate:'2026-02-30'}]) assert.equal(eligibility(split.map(r=>({...r,...change})),now).allowed,false);
});
test('single tests and notes do not become a physical exam', () => {
 assert.equal(eligibility([split[0]],now).allowed,false);
 assert.equal(eligibility(split.map(r=>({...r,documentCategory:'outpatient_record'})),now).allowed,false);
 assert.equal(eligibility(split.map((r,i)=>({...r,checkDate:`2026-06-0${i+1}`})),now).allowed,false);
});

test('imported specialty reports are not a complete checkup despite annual labels', () => {
 const base={audit_status:'audited',checkDate:'2026-10-01',advisorInterpretationConfirmedAt:new Date()};
 const chemistry={...base,type:'annual',title:'体检报告 2026年10月1日',reportItems:['钾','钠','尿素','肌酐','葡萄糖','白蛋白','胆固醇','甘油三酯'].map(name=>({name}))};
 const psych={...base,type:'annual',documentCategory:'exam_report',title:'体检报告 2026年10月1日',reportItems:[{name:'近红外脑功能成像检查'},{name:'焦虑量表'}]};
 const ecg={...base,type:'other',documentCategory:'exam_report',title:'心电图检查',reportItems:[{name:'常规心电图'}]};
 assert.equal(eligibility([chemistry,psych,ecg],now,{lookbackMonths:3}).allowed,false);
 const tcd={...base,type:'annual',documentCategory:'physical_exam',title:'经颅多普勒超声',reportItems:[{name:'经颅多普勒超声（TCD）'}]};
 const specialty=['前庭眼反射','神经电生理检查','视频半规管检查','视频头脉冲试验','眼震视图检查']
   .map(title=>({...base,type:'other',documentCategory:'exam_report',title,reportItems:[{name:title}]}));
 assert.equal(eligibility([tcd,...specialty],now,{lookbackMonths:3}).allowed,false);
});
test('explicit reviewed exam retains calendar twelve-month boundary', () => {
 const r={audit_status:'audited',documentCategory:'physical_exam',title:'年度体检报告',checkDate:'2025-10-07',examConclusion:'体检综合结论',advisorInterpretationConfirmedAt:new Date()};
 assert.equal(eligibility([r],now).allowed,true);
 assert.equal(eligibility([{...r,checkDate:'2025-10-06'}],now).allowed,false);
 assert.equal(eligibility([{...r,examConclusion:''}],now).allowed,false);
});

test('annual plan uses an inclusive three-calendar-month exam boundary', () => {
 const r={audit_status:'audited',documentCategory:'physical_exam',title:'年度体检报告',checkDate:'2026-07-07',examConclusion:'体检综合结论',advisorInterpretationConfirmedAt:new Date()};
 assert.equal(eligibility([r],now,{lookbackMonths:3}).allowed,true);
 assert.equal(eligibility([{...r,checkDate:'2026-07-06'}],now,{lookbackMonths:3}).allowed,false);
 assert.match(eligibility([{...r,checkDate:'2026-07-06'}],now,{lookbackMonths:3}).message,/近3个月/);
});
test('完整体检批次有任一份未解读时不能生成年度方案', () => {
 const reports=split.map((r,i)=>({...r,documentCategory:'lab_report',advisorInterpretationConfirmedAt:i===0?null:new Date()}));
 assert.equal(eligibility(reports,now).allowed,false);
 assert.deepEqual(eligibility(reports,now).pendingInterpretation,['0']);
 assert.equal(eligibility(reports.map(r=>({...r,advisorInterpretationConfirmedAt:new Date()})),now).allowed,true);
});
