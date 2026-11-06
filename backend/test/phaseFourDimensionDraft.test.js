const test=require('node:test'),assert=require('node:assert/strict');
const {renderDraft,dimensions}=require('../src/utils/phaseFourDimensionDraft');
test('固定4+5+2+2维度并保持四卡片解析兼容',()=>{
 const content=renderDraft(dimensions.map(labels=>labels.map(()=> '本期暂无记录')));
 assert.equal(content.split('\n\n').length,4);
 assert.equal(content.split('\n').filter(s=>s.startsWith('- ')).length,13);
 assert.match(content,/三、问题分析\n- 生活方式行为改变/);
 assert.match(content,/四、下一步规划\n- 生活方式行为改变/);
 assert.equal((content.match(/就医或检查完成及时性/g)||[]).length,2);
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
 assert.doesNotMatch(renderDraft(output),/11月15日|旧报告正常/);assert.match(output[3][1],/不凭旧检查结果新增/);
});
test('重复取消不认定未就医，真实未闭环事项与规划对应',()=>{
 const input=dimensions.map(labels=>labels.map(()=> 'AI草稿'));
 const output=ground(input,{periodFollowups:[{theme:'医务代办',status:'cancelled',cancelReason:'重复发起已释放预占'},{theme:'眼科复查',status:'planned'}]});
 assert.match(output[2][1],/重复发起/);assert.match(output[2][1],/不能仅凭状态认定逾期/);assert.match(output[3][1],/眼科复查/);
});

test('饮食记录里的不适原文也归入主诉，不以餐次标记推测饮食',()=>{
 const records=Array.from({length:5},(_,i)=>({type:'diet',recordedAt:'2026-10-16',value:i?'【早餐】':'【早餐】今天上午有些腹泻'}));
 const output=ground(dimensions.map(labels=>labels.map(()=> 'AI草稿')),{recentHealthRecords:records});
 assert.match(output[0][3],/腹泻/);assert.match(output[1][0],/仅标注餐次/);
});
