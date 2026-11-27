const { sections } = require('./reviewFourSections');
const { metricEvidence } = require('./managementGoalMetrics');

const dimensions = [
  ['本期年度管理目标', '健康数据记录习惯', '随访完成及时性', '日常监测数据', '医院重点检查指标', '体成分数据', '症状与主诉'],
  ['行为与结果的关联'],
  ['记录与结果', '执行情况'],
  ['客户行动', '团队行动与复核'],
];
const rules = '承接评估截止时已确认且有效的年度目标。阶段变化先分述记录习惯和随访及时性，再分述日常监测、医院重点指标、体成分和症状。按项目及约定频率评价，连续每周一次也可以是规律记录。无约定只描述观察；无记录不等于未执行。结合同期行为和健康结果分析关联，不能推断因果或评价人格。区分客户就医、工作人员办结、报告回收。问题分析分别说明记录质量与结果、执行情况及已核实原因。下一步按同一个目标分别写客户行动、团队行动及复核依据，时间未约定写待确认。撤销事项不得产生建议。';
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
  const goal = [...new Set(linkedGoals)].join('；') || '本期未匹配到已确认的年度目标。建议阶段目标（待确认）：'+suggestedGoal+'。';
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
  const groups=[...coverage(records).values()].sort((a,b)=>b.days.size-a.days.size);
  const habitSummary=groups.length>3 ? groups.slice(0,3).map(g=>g.label+g.days.size+'天').join('、')+'；共记录'+groups.length+'类项目。' : habits.join('；');
  const waistDays=new Set(records.filter(r=>r.type==='waist').map(r=>day(r.recordedAt))).size;
  const daily=weight ? weight.observation : old[1];
  const results=weight ? '体重有跨日记录，可比较期初和期末。' : '现有体重记录不足以比较期初和期末。';
  const execution=overdue||missingTask ? [overdue?'有'+overdue+'项晚于计划日办结，需区分实际服务延期和补录。':'',missingTask?'「'+missingTask+'」缺办结日期，实际完成情况待确认。':''].join('') : timing;
  const customer=missingTask ? '下次与顾问联系时，说明「'+missingTask+'」是否已经完成；如已完成，告知实际日期，如有报告请一并提供。' :
    schedules.length?'按方案约定记录'+(schedules[0].items||schedules[0].metricType||'监测项目')+'（'+schedules[0].frequency+'），下次随访时带上记录。':'下次随访时，与顾问选定一项要跟踪的指标，约定记录频率。';
  const team=missingTask||overdue ? '顾问在下次随访前'+(missingTask?'查「'+missingTask+'」的办理或回访记录，补齐实际日期和结果。':'核对延期项目的办理日期。')+(overdue?'逐项核实延期发生在预约、就医还是登记环节，再与客户确认下一次安排。':'') : '顾问在下次随访时核对本期指标，与客户确认下一阶段目标、频率和复核日期。';
  const hospitalSummary=hospital.join('；') || (reports.length?'本期有'+reports.length+'份已审核报告，尚未匹配到年度重点指标。':'本期暂无已审核检查报告。');
  const symptoms=records.filter(r=>bowel.has(r.type)||r.type==='symptom');
  const symptomsSummary=symptoms.length?'本期有'+new Set(symptoms.map(r=>day(r.recordedAt))).size+'天排便、精力或症状记录。'+(symptoms.some(r=>r.type==='symptom')?old[3]:'原记录的评分含义需结合量表核对。'):old[3];
  const dailyTypes = ['bloodPressure','heartRate','bloodSugar','waist','sleep','oxygen','temperature'];
  const dailySummary = dailyTypes.flatMap(type=>{
    const rows=records.filter(r=>r.type===type && r.value!=null && r.value!=='');
    if(!rows.length)return [];
    const last=rows.at(-1);
    return [(last.label||type)+' '+day(last.recordedAt)+' '+last.value+(last.unit||'')];
  });
  if(weight)dailySummary.unshift(weight.observation);
  else if(records.some(r=>r.type==='weight'))dailySummary.unshift(old[1].split('；')[0]);
  const observations=[goal,habitSummary||'本期暂无可确认的客户自记数据。',timing,dailySummary.join('；')||daily,hospitalSummary,old[2],symptomsSummary];
  return [observations,[lifestyle.length?lifestyle.join('；')+'。'+(weight?'同期体重从'+weight.first.value+' kg变为'+weight.last.value+' kg。':'')+'仅凭同期记录不能认定因果。':'本期缺少生活方式记录，无法分析与健康结果的关联。'],[results+(waistDays===1?'腰围仅记录1天，只能作为基线。':''),execution],[customer,team]];

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
