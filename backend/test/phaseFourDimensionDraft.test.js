const test=require('node:test'),assert=require('node:assert/strict');
const {renderDraft,dimensions}=require('../src/utils/phaseFourDimensionDraft');
test('按年度目标、六项阶段变化及后续分析并保持四卡片解析兼容',()=>{
 const content=renderDraft(dimensions.map(labels=>labels.map(()=> '本期暂无记录')));
 assert.equal(content.split('\n\n').length,4);
 assert.equal(content.split('\n').filter(s=>s.startsWith('- ')).length,14);
 assert.match(content,/三、问题分析\n- 行为习惯前后变化/);
 assert.match(content,/四、下一步规划\n- 健管专员/);
 assert.match(content,/随访完成及时性/);
});
test('不完整或空内容不得保存成成功草稿',()=>{
 assert.throws(()=>renderDraft([[],[],[],[]]));
 assert.throws(()=>renderDraft(dimensions.map(labels=>labels.map(()=>''))));
});

const {ground}=require('../src/utils/phaseFourDimensionGrounding');
test('缺本期依据时清除旧报告、虚构生活方式及新增医疗安排',()=>{
 const input=dimensions.map(labels=>labels.map(()=> '旧报告正常，11月15日每日打卡'));
 const output=ground(input,{recentHealthRecords:[],periodReports:[],periodFollowups:[]});
 assert.ok(output[0].every(x=>x.includes('暂无记录')));assert.ok(output[1].every(x=>x==='本期暂无记录。'));
 assert.doesNotMatch(output.flat().join(' '),/11月15日|旧报告正常/);assert.match(output[3][1],/不凭旧检查结果新增/);
});
test('重复取消不认定未就医，真实未闭环事项与规划对应',()=>{
 const input=dimensions.map(labels=>labels.map(()=> 'AI草稿'));
 const output=ground(input,{capturedAt:'2026-11-17',periodFollowups:[{theme:'医务代办',status:'cancelled',cancelReason:'重复发起已释放预占'},{theme:'眼科复查',status:'planned',date:'2026-11-20'}]});
 assert.match(output[2][1],/重复发起/);assert.match(output[2][1],/不能视作工作人员逾期/);assert.match(output[3][1],/眼科复查/);
});
test('上一轮已办结且本次未检查，新计划未到期时不记工作人员逾期',()=>{
 const input=dimensions.map(labels=>labels.map(()=> 'AI草稿'));
 const output=ground(input,{capturedAt:'2026-11-17',periodFollowups:[
  {theme:'眼科复查提醒',status:'completed',date:'2026-11-01',executedContent:'客户本次未做，已另约11月20日'},
  {theme:'眼科复查继续跟进',status:'planned',date:'2026-11-20'},
 ]});
 assert.match(output[2][1],/已有上一轮办结记录/);
 assert.match(output[2][1],/不能视作工作人员逾期/);
 assert.doesNotMatch(output[2][1],/未及时完成的实际原因/);
});
test('当前有效任务过了计划日期才记工作人员待办逾期',()=>{
 const output=ground(dimensions.map(labels=>labels.map(()=> 'AI草稿')),{capturedAt:'2026-11-17',periodFollowups:[
  {theme:'复查邀约',status:'planned',date:'2026-11-10'},
 ]});
 assert.match(output[2][1],/工作人员待办逾期/);
});

test('饮食记录里的不适原文也归入主诉，不以餐次标记推测饮食',()=>{
 const records=Array.from({length:5},(_,i)=>({type:'diet',recordedAt:'2026-10-16',value:i?'【早餐】':'【早餐】今天上午有些腹泻'}));
 const output=ground(dimensions.map(labels=>labels.map(()=> 'AI草稿')),{recentHealthRecords:records});
 assert.match(output[0][3],/腹泻/);assert.match(output[1][0],/仅标注餐次/);
});
test('本期有生活方式记录时纠正模型误写的五项暂无记录',()=>{
 const records=['diet','exercise','sleep','smoking','alcohol','mood'].map(type=>({type,recordedAt:'2026-10-16T12:00:00Z',value:'已记录'}));
 const output=ground(dimensions.map(labels=>labels.map(()=> '本期暂无记录。')),{recentHealthRecords:records});
 assert.ok(output[1].every(x=>x.includes('记录覆盖1天')&&!x.includes('暂无记录')));
});
