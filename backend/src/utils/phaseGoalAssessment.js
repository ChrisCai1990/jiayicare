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
  const sleep = records.filter(r=>r.type==='sleep').slice(-2).map(r=>day(r.recordedAt)+' '+r.value+(r.unit||'')).join('；');
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
  const observations = [[...new Set(linkedGoals)].join('；') || '本期尚无明确的结构化年度目标。',habits.join('；') || '本期缺少可确认由客户记录的数据。',timing,[sleep && old[1]==='本期暂无记录。' ? '' : old[1],sleep && '睡眠：'+sleep].filter(Boolean).join('；'),hospital.join('；') || old[0],old[2],old[3]];
  const lifestyle = records.filter(r=>['diet','exercise','sleep','mood'].includes(r.type)).slice(-3).map(r=>day(r.recordedAt)+' '+(r.label||r.type)+' '+r.value).join('；');
  return [observations,[lifestyle ? '同期记录：'+lifestyle+'。与本期指标对照，不能认定因果。' : '本期缺少可核实的生活方式记录，尚不能判断与健康结果的关联。'],['结合各项记录的日期、覆盖和测量条件判断可比性。',timing+' 工作人员办结与客户实际就医须分别核对。'],['按已确认的计划执行，向顾问反馈实际困难。','核对本期目标的对应结果及缺失原因，与客户确认下一阶段重点和复核日期。']];
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
