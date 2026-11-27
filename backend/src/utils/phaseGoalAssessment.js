const { sections } = require('./reviewFourSections');
const { metricEvidence } = require('./managementGoalMetrics');

const dimensions = [
  ['本期年度管理目标', '健康数据记录习惯', '随访完成及时性', '日常监测数据', '医院重点检查指标', '体成分数据', '症状与主诉'],
  ['行为与结果的关联'],
  ['记录与结果', '执行情况'],
  ['团队跟进', '效果复核'],
];
const rules = '承接评估截止时已确认且有效的年度目标。阶段变化先分述记录习惯和随访及时性，再分述日常监测、医院重点指标、体成分和症状。按项目及约定频率评价，连续每周一次也可以是规律记录。无约定只描述观察；无记录不等于未执行。结合同期行为和健康结果分析关联，不能推断因果或评价人格。区分客户就医、工作人员办结、报告回收。问题分析分别说明记录质量与结果、执行情况及已核实原因。下一步写团队在何时督促、协助和评估哪个目标，如何复核结果，时间未约定写待确认。撤销事项不得产生建议。';
const day = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
const bowel = new Set(['stool','bowel','defecation','bowelMovement','ibd_diary','energy','fatigue']);
function coverage(records) {
  const groups = new Map();
  for (const r of records) {
    if (r.recordedBy?.source !== 'customer' || !r.recordedAt) continue;
    const key = r.type;
    if (!groups.has(key)) groups.set(key, { label: r.label || key, days: new Set(), weeks: new Set() });
    const group = groups.get(key), date = day(r.recordedAt);
    group.days.add(date);
    group.weeks.add(Math.floor((Date.parse(date) / 86400000 + 3) / 7));
  }
  return groups;
}
function assessment(context) {
  const records = context.recentHealthRecords, reports = context.periodReports;
  const tasks = context.periodFollowups.filter(t => t.status !== 'cancelled' && !t.isBlocked);
  const plan = context.confirmedAnnualPlan;
  const targetModule = plan?.moduleData?.management_targets;
  const goalRows = targetModule?.records?.length ? targetModule.records : Object.values(plan?.moduleData || {}).filter(m=>m?.enabled !== false).flatMap(m=>m?.records || []);
  const goals = (targetModule?.enabled === false ? [] : goalRows).filter(g => g?.goal && !g.advisorExcluded && !g.deletedAt && !g.revokedAt && !['cancelled','revoked'].includes(g.status) && (!g.effectiveAt || new Date(g.effectiveAt) <= new Date(context.period.end)));
  const previous = coverage(context.previousCustomerRecords || []);
  const monitoring = plan?.moduleData?.monitoring;
  const schedules = (monitoring?.enabled === false ? [] : monitoring?.records || []).filter(r=>!r.advisorExcluded && r.frequency);
  const habits = [...coverage(records)].map(([key, group]) => {
    const prior = previous.get(key);
    const schedule = schedules.find(r=>r.metricType===key);
    const weeks = [...group.weeks].sort((a,b)=>a-b);
    let streak=1, longest=1;
    weeks.slice(1).forEach((w,i)=>{ streak=w===weeks[i]+1?streak+1:1; longest=Math.max(longest,streak); });
    return group.label + '：' + (schedule?'方案约定'+schedule.frequency+'；':'') + (longest>1?'连续记录最长'+longest+'周；':'') + group.days.size + '天，覆盖' + group.weeks.size + '个自然周' + (prior ? '（前一等长时段覆盖' + prior.weeks.size + '周）' : '');
  });
  const finished = tasks.filter(t => t.completedAt && t.status === 'completed' && day(t.completedAt) <= day(context.period.end));
  const onTime = finished.filter(t => day(t.completedAt) <= day(t.date)).length;
  const timing = tasks.length ? '本期到期随访' + tasks.length + '项，有办结日期' + finished.length + '项，其中按期' + onTime + '项、延期' + (finished.length-onTime) + '项；其余' + (tasks.length-finished.length) + '项截至期末缺少办结凭据。' : '本期没有已纳入统计的到期随访。';
  const samples = records.map(r => bowel.has(r.type) ? {...r,type:'symptom'} : r);
  const old = sections({records:samples,reports:[...reports].sort((a,b)=>String(a.checkDate).localeCompare(String(b.checkDate))),followups:[]})[0].map(line=>line.slice(line.indexOf('：')+1));

  const hospital = goals.filter(g=>g.goalMetric?.source==='report_item').map(g=>{
    const metric=g.goalMetric, start=[day(context.period.start),day(plan.confirmedAt),g.effectiveAt && day(g.effectiveAt)].filter(Boolean).sort().at(-1);
    const e=metricEvidence(metric,[],reports,{start,end:day(context.period.end)});
    const point=p=>p.date+' '+p.value+' '+p.unit;
    return metric.name+'：'+(e.ambiguous?'同日结果需核对':!e.count?'本期未匹配到同名同单位的已审核结果':e.count===1?'本期基线 '+point(e.latest):point(e.first)+' → '+point(e.latest));
  });
  const opening = context.openingPlan || (plan?.confirmedAt && day(plan.confirmedAt)<=day(context.period.start) ? plan : null);
  const openingGoals = Object.values(opening?.moduleData || {}).filter(m=>m?.enabled!==false)
    .flatMap(m=>m?.records||[]).filter(g=>g.goal && !g.advisorExcluded && !g.deletedAt && !g.revokedAt && !['revoked','cancelled'].includes(g.status) && (!g.effectiveAt || day(g.effectiveAt)<=day(context.period.start)));
  const operators = {lte:'≤',gte:'≥',eq:'=',lt:'<',gt:'>'};
  const goalResults = openingGoals.map(g=>{
    const m=g.goalMetric;
    if (!m) return g.goal;
    const limit = operators[m.operator] && m.targetValue!=null && m.targetValue!==''
      ? operators[m.operator]+m.targetValue+(m.unit||'') : '';
    if (!['vital','report_item'].includes(m.source)) return g.goal;
    const e=metricEvidence(m,records,reports,{start:day(context.period.start),end:day(context.period.end)});
    const meets=value=>({lte:value<=m.targetValue,lt:value<m.targetValue,gte:value>=m.targetValue,gt:value>m.targetValue,eq:value===Number(m.targetValue)})[m.operator];
    const progress=limit && e.latest ? (meets(e.latest.value)?(e.count>1 && e.first.date!==e.latest.date && meets(e.first.value)?'期初和最近一次均达标，继续维持':'最近一次达标'):'最近一次未达标') : '';
    return g.goal+(limit?'（目标 '+limit+'）':'')+'：'+(e.latest?e.latest.date+' '+e.latest.value+' '+e.latest.unit+(progress?'，'+progress:''):'本期缺少可比结果');
  });
  const linkedGoals=goals.map(g=>{
    const linked=tasks.filter(t=>String(t.sourceAnnualPlanId||'')===String(plan._id) && (t.managementIssueIds||[]).map(String).includes(String(g.issueId)) && g.issueId);
    return g.goal+(linked.length?'（本期关联随访'+linked.length+'项）':'');
  });
  const pending = tasks.filter(t => !finished.includes(t));
  const overdue = finished.length - onTime;
  const taskLabel = t => String(t.theme || '随访').slice(0,50);
  const missingTask = pending[0] && taskLabel(pending[0]);
  const suggestedGoal = missingTask ? '下次随访时确认「'+missingTask+'」的实际进展及下一步安排'
    : overdue ? '下次随访时查明延期环节，确认下一项安排的日期' : '下次复盘时核对本期记录与下一阶段重点';
  const phaseTargets=context.periodTargets||[];
  const entered=phaseTargets.map(t=>t.metric+'：'+t.goal+(t.range?'，目标范围 '+t.range:'')+'，记录频率 '+t.frequency);
  const goal = entered.length ? '本阶段已设目标：'+entered.join('；') : goalResults.length ? '期初目标：'+[...new Set(goalResults)].join('；') : (linkedGoals.length?'期内确认目标：'+[...new Set(linkedGoals)].join('；'):'') || '本期未匹配到已确认的年度目标。建议阶段目标（待确认）：'+suggestedGoal+'。';
  const weight = require('./phaseAssessmentWeightEvidence').comparableWeightChange(records);
  const lifestyle = [];
  for (const [type,label] of [['exercise','运动'],['diet','饮食'],['sleep','睡眠'],['mood','情绪'],['smoking','吸烟'],['alcohol','饮酒']]) {
    const rows = records.filter(r=>r.type===type);
    if (!rows.length) continue;
    const values = new Map(), dates = new Set();
    for (const r of rows) {
      const date = day(r.recordedAt), value=String(r.value??'').replace(/【[^】]+】/g,'').trim();
      dates.add(date);
      if(value){if(!values.has(value))values.set(value,new Set());values.get(value).add(date);}
    }
    const common=[...values].sort((a,b)=>b[1].size-a[1].size)[0];
    lifestyle.push(label+'记录'+dates.size+'天'+(common && ['diet','exercise','smoking','alcohol'].includes(type)?'，其中'+common[1].size+'天记有「'+common[0].slice(0,32)+'」':''));
  }
  const outcomeTypes=[['weight','体重'],['bloodPressure','血压'],['sleep','睡眠']];
  const observedDates=new Map();
  for(const r of records){
    if(!r.recordedAt || r.value==null || !String(r.value).trim())continue;
    if(!observedDates.has(r.type))observedDates.set(r.type,new Map());
    observedDates.get(r.type).set(day(r.recordedAt),String(r.value)+(r.unit||''));
  }
  for(const [behavior,label] of [['exercise','运动'],['diet','饮食'],['sleep','睡眠']]){
    const dates=observedDates.get(behavior);
    if(!dates)continue;
    for(const [type,outcome] of outcomeTypes){
      if(type===behavior)continue;
      const pairs=[...(observedDates.get(type)||[])].filter(([date])=>dates.has(date)).sort(([a],[b])=>a.localeCompare(b));
      if(pairs.length<2)continue;
      lifestyle.push('同时记录'+label+'和'+outcome+'的'+pairs.length+'天，首末记录为 '+pairs[0][1]+' → '+pairs.at(-1)[1]);
      break;
    }
  }
  const groups=[...coverage(records).values()].sort((a,b)=>b.days.size-a.days.size);
  const habitSummary=groups.length>3 ? groups.slice(0,3).map(g=>g.label+g.days.size+'天').join('、')+'；共记录'+groups.length+'类项目。' : habits.join('；');
  const waistDays=new Set(records.filter(r=>r.type==='waist').map(r=>day(r.recordedAt))).size;
  const daily=weight ? weight.observation : old[1];
  const results=weight ? '体重有跨日记录，可比较期初和期末。' : '现有体重记录不足以比较期初和期末。';
  const execution=overdue||missingTask ? [overdue?'有'+overdue+'项晚于计划日办结，需区分实际服务延期和补录。':'',missingTask?'「'+missingTask+'」缺办结日期，实际完成情况待确认。':''].join('') : timing;
  const taskOwner = /审核报告|报告审核/.test(missingTask||'') ? '健管专员核对报告归档状态，健康顾问核对审核结论' : '健管专员跟踪预约和执行进度，健康顾问复核结果';
  const followUp = missingTask ? '下次随访前，'+taskOwner+'（'+missingTask+'）。' :
    overdue ? '顾问在下次随访前核实延期事项发生在预约、办理还是登记环节，确认后续安排。' :
    '顾问在下次随访时与客户复核'+(schedules[0]?.items||schedules[0]?.metricType||'本期监测项目')+'的记录，确认下一次记录和复核日期。';
  const nutritionFocus=[...entered,...linkedGoals,missingTask||''].filter(Boolean).some(text=>/营养|饮食|膳食/.test(text));
  const teamReview=nutritionFocus?'营养师核对膳食记录与约定目标的差异，向健康顾问反馈需要调整的环节。':'';
  const review = teamReview+(entered.length?'健康顾问在下次复盘按约定频率核对'+phaseTargets.map(t=>t.metric).join('、')+'的记录及目标范围。':goalResults.length ? '下次复盘逐项对照期初目标和实测结果，标记维持、改善、偏离或证据不足。' :
    '顾问在下次随访时与客户确认需维持或改善的指标、目标范围和记录频率，写入下一期评估。');
  const hospitalSummary=hospital.join('；') || (reports.length?'本期有'+reports.length+'份已审核报告，尚未匹配到年度重点指标。':'本期暂无已审核检查报告。');
  const symptoms=records.filter(r=>bowel.has(r.type)||r.type==='symptom');
  const symptomsSummary=symptoms.length?'本期有'+new Set(symptoms.map(r=>day(r.recordedAt))).size+'天排便、精力或症状记录。'+(symptoms.some(r=>r.type==='symptom')?old[3]:'原记录的评分含义需结合量表核对。'):old[3];
  const dailyTypes = ['bloodPressure','heartRate','bloodSugar','waist','sleep','oxygen','temperature'];
  const dailySummary = dailyTypes.flatMap(type=>{
    const rows=records.filter(r=>r.type===type && r.value!=null && r.value!=='');
    if(!rows.length)return [];
    const dates = new Map();
    for (const row of [...rows].sort((a,b)=>new Date(a.recordedAt)-new Date(b.recordedAt))) dates.set(day(row.recordedAt),row);
    const samples=[...dates.values()], first=samples[0], last=samples.at(-1);
    const value=r=>String(r.value)+(r.unit||'');
    return [(last.label||type)+'（'+samples.length+'天） '+day(first.recordedAt)+' '+value(first)+(samples.length>1?' → '+day(last.recordedAt)+' '+value(last):'')];

  });
  if(weight)dailySummary.unshift(weight.observation);
  else if(records.some(r=>r.type==='weight'))dailySummary.unshift(old[1].split('；')[0]);
  const bodyReports = (context.latestBodyReports || reports.filter(r=>r.documentCategory==='body_composition'||r.type==='body_composition'))
    .filter(r=>r.checkDate && r.checkDate<=day(context.period.end)).sort((a,b)=>b.checkDate.localeCompare(a.checkDate));
  const bodyFields=[['weight','体重','kg'],['bodyFatRate','体脂率','%'],['skelMuscle','骨骼肌','kg'],['visceralFat','内脏脂肪','级']];
  const exams=[...(context.bodyCompHistory||[]),context.bodyComposition].filter(Boolean).flatMap(row=>{
    const date=String(row.measuredAt||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date>day(context.period.end))return [];
    const reportItems=bodyFields.filter(([key])=>row[key]!=null && /^\d+(?:\.\d+)?$/.test(String(row[key]).trim())).map(([key,name,unit])=>({name,unit,value:row[key]}));
    return reportItems.length?[{checkDate:date,reportItems}]:[];
  });
  for(const exam of exams){
    const report=bodyReports.find(r=>r.checkDate===exam.checkDate);
    if(!report)bodyReports.push(exam);
    else for(const item of exam.reportItems)if(!report.reportItems?.some(i=>i.name===item.name))report.reportItems=[...(report.reportItems||[]),item];
  }
  bodyReports.sort((a,b)=>b.checkDate.localeCompare(a.checkDate));
  const current = bodyReports[0], prior = current && bodyReports.find(r=>r.checkDate<current.checkDate);
  let bodySummary = old[2];
  if (current && current.checkDate>=day(context.period.start)) {
    const lines = (current.reportItems||[]).filter(i=>i.name && i.value!=null && String(i.value).trim()).map(i=>{
      const same=(prior?.reportItems||[]).filter(j=>j.name===i.name && (j.unit||'')===(i.unit||''));
      const num=v=>/^-?\d+(?:\.\d+)?$/.test(String(v).trim());
      const single=same.length===1 && num(same[0].value) && num(i.value);
      const delta=single?Number((Number(i.value)-Number(same[0].value)).toFixed(2)):null;
      return i.name+'：'+(single?same[0].value+' → ':'')+i.value+(i.unit||'')+(single?'（'+(delta===0?'持平':(delta>0?'+':'')+delta+(i.unit==='%'?'个百分点':i.unit||''))+'）':'（无可比前值）');
    });
    if(lines.length) bodySummary=current.checkDate+(prior?'，对比 '+prior.checkDate:'，首次可用体测')+'；'+lines.join('；');
  }
  const observations=[goal,habitSummary||'本期暂无可确认的客户自记数据。',timing,dailySummary.join('；')||daily,hospitalSummary,bodySummary,symptomsSummary];
  return [observations,[lifestyle.length?lifestyle.join('；')+'。'+(weight?'同期体重从'+weight.first.value+' kg变为'+weight.last.value+' kg。':'')+(entered.length?'对照本阶段目标：'+entered.join('；')+'。':goalResults.length?'结合期初目标核对：'+goalResults.join('；')+'。':'期初未明确维持或改善目标，无法判断是否达标。')+'仅凭同期记录不能认定因果。':'本期缺少生活方式记录，无法分析与健康结果的关联。'+goalResults.join('；')],[results+(waistDays===1?'腰围仅记录1天，只能作为基线。':''),execution],[followUp,review]];

}
function render(values) {
  if (!Array.isArray(values) || values.length !== dimensions.length) throw Error('评估草稿缺少四板块');
  return dimensions.map((labels,i)=>{
    const group=values[i];
    if(!Array.isArray(group)||group.length!==labels.length) throw Error('评估草稿维度不完整');
    const lines=labels.map((label,j)=>{
      if(typeof group[j]!=='string'||!group[j].trim()||(i>0&&group[j].length>500)) throw Error('评估草稿内容无效');
      return '- '+label+'：'+group[j].replace(/\s+/g,' ').trim();
    });
    return ['一','二','三','四'][i]+'、'+require('./reviewFourSections').headings[i]+'\n'+lines.join('\n');
  }).join('\n\n');
}
module.exports={dimensions,rules,assessment,render};
