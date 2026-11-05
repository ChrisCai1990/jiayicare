const {comparableWeightChange}=require('./phaseAssessmentWeightEvidence');
const headings=['阶段变化','生活方式关联','问题分析','下一步规划'];
const rules=`评估固定为四板块，不以记录数量、覆盖天数或报告目录代替分析。不要用记录条数、覆盖天数代替指标变化。不能仅凭零散数据推断客户存在误区。补充记录建议须经营养师或健康顾问确认。
一、阶段变化：分别核对专项筛查近期复查、日常健康数据（体重/血压/大便等）、体成分、不适症状主诉四个维度。有记录则写日期、实际数值或主诉及可支持的变化；无记录写“本期暂无记录”，不推断没有症状或没有变化。只有同指标、同单位、可比条件才比较；单次记录只描述现值。体成分独立于日常体重。首次筛查与复查区分，不把任意新报告称作复查。
二、生活方式关联：按饮食、运动、睡眠、烟酒、情绪五个维度，只描述本期实际记录；没有记录明确写“本期暂无记录”，不从旧档案补造本期行为。同期数据支持时说明时间上的关联，不作因果判断；无可比证据不强行分析，不自动增加打卡要求。
三、问题分析：固定且只分为“生活方式行为改变”和“就医或检查完成及时性”两个维度，分别写执行情况及未做好/未及时完成的原因。不能把医疗执行混进生活方式，不能以记录条数或资料缺口替代执行分析。仅针对有依据的行为改变未落实，及就医、检查、复查等医疗行为未按计划完成，区分原计划/期限、实际执行、原因、影响。必须有实际计划和执行证据；缺少记录不等于没有执行。取消/未到诊记录不自动代表客户主动放弃。已知原因引用客户或服务记录，未知写“原因待核实”，推测不能当事实。客户对问题解决及服务的反馈可以作为原因分析依据，但不能编造满意度。本期无明确未完成问题则如实说明，不强造问题。
四、下一步规划：固定且只分为“生活方式行为改变”和“就医或检查完成及时性”两个维度，与第三板块两方面逐一对应。逐项对应第三板块已识别的问题及原因，写拟采取的措施、责任岗位、时间/复评节点和如何验证落实。时间或责任人未确定写待确认，不编造已约定安排。原因未知先安排针对性核实；无明确问题不额外强加任务，已有资料足够时写“暂无增加记录的必要”。每项简短，依据放在对应项内，不单独堆砌资料。`;
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const day=v=>v?new Date(new Date(v).getTime()+8*3600000).toISOString().slice(0,10):'';
const sample=rows=>rows.slice(-3).map(r=>`${day(r.recordedAt)} ${text(r.label||r.type)} ${text(r.value)}${r.unit?' '+r.unit:''}${r.note?'（'+text(r.note)+'）':''}`).join('；');
function sections({records=[],reports=[],followups=[]}={}){
 const body=reports.filter(r=>r.documentCategory==='body_composition'||r.type==='body_composition');
 const screening=reports.filter(r=>!body.includes(r)&&(r.screeningItemId||r.screeningL1||r.screeningCategory||r.reportItems?.some(i=>i.screeningKey||i.screeningKeys?.length)));
 const reportText=rows=>rows.slice(-3).map(r=>`${r.checkDate} ${text(r.title)}：${(r.reportItems||[]).slice(0,8).map(i=>[text(i.name),text(i.value),text(i.unit),text(i.conclusion)].filter(Boolean).join(' ')).join('；')||'详见原报告'}`).join('；');
 const lifestyle=[['饮食',['diet']],['运动',['exercise']],['睡眠',['sleep']],['烟酒',['smoking','smoke','alcohol','tobacco']],['情绪',['mood','emotion']]];
 const daily=records.filter(r=>['weight','waist','bloodPressure','bloodSugar','heartRate','temperature','stool','bowel','defecation','bowelMovement','oxygen','spo2','ibd_diary'].includes(r.type));
 const types=[...new Set(daily.map(r=>r.type))],weight=comparableWeightChange(records);
 const symptoms=records.filter(r=>r.type==='symptom');
 const composition=records.filter(r=>['bodyComposition','bodyFat','bodyFatRate','muscleMass','visceralFat'].includes(r.type));
 const changes=[`专项筛查近期复查：${screening.length?reportText(screening)+'。以上为本期筛查相关结果；首次或复查属性及前次同项结果需核对，不据此推断变化。':'本期暂无记录。'}`,
 `日常健康数据：${daily.length?types.map(type=>type==='weight'&&weight?weight.observation:sample(daily.filter(r=>r.type===type))).join('；'):'本期暂无记录。'}`,
 `体成分：${body.length||composition.length?[reportText(body),sample(composition)].filter(Boolean).join('；')+'。仅描述现有记录，可比测量条件及前次结果待核对。':'本期暂无记录。'}`,
 `不适症状主诉：${symptoms.length?sample(symptoms)+'。症状变化与处理结果按已记录情况核实。':'本期暂无记录，不代表没有不适。'}`];
 const life=lifestyle.map(([label,types])=>{const rows=records.filter(r=>types.includes(r.type));return `${label}：${rows.length?sample(rows)+'。与健康变化的关联须结合同期证据，不能认定因果。':'本期暂无记录。'}`});
 const categories=[['生活方式行为改变',/饮食|营养|运动|睡眠|烟|酒|情绪|生活方式/],['就医或检查完成及时性',/就医|检查|复查|预约|门诊/]];
 const grouped=categories.map(([label,pattern],index)=>followups.filter(r=>!r.isBlocked&&pattern.test([r.theme,r.plannedContent].join(' '))&&(index===1||!categories[1][1].test([r.theme,r.plannedContent].join(' ')))));
 const issues=categories.map(([label],index)=>`${label}：${grouped[index].length?grouped[index].map(r=>`计划：${text(r.plannedContent||r.theme)}；实际：${text(r.executedContent)||({completed:'任务标记完成，实际执行详情待核实',cancelled:'任务已取消',missed:'任务标记未完成',planned:'待执行',in_progress:'进行中'})[r.status]||'待核实'}；${r.cancelReason?'已记录原因：'+text(r.cancelReason):'未落实原因待核实'}。计划日期${day(r.date)}仅为任务日期，不自动认定医疗完成期限或逾期`).join('；'):'本期暂无足够计划与执行记录，无法判断执行情况及原因；没有记录不等于没有执行。'}`);
 const next=categories.map(([label],index)=>`${label}：${grouped[index].some(r=>r.status!=='completed')?'针对上述计划核对实际执行及未落实原因，再由营养健康团队提出相应调整；负责人、完成期限与复评节点待确认。':'本期暂无明确问题需要新增措施，按既有已确认计划继续跟进。'}`);
 return [changes,life,issues,next];
}
module.exports={headings,rules,sections};
