const { addDays, measurementOptions } = require('./nutritionBodyCompFollowUp');
const day = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(value);
const plus = (value, days) => addDays(value, days).toISOString().slice(0, 10);
const openStatuses = ['planned', 'in_progress', 'missed'];
const labels = { first: '第一强化周期', rest: '周期间休息', second: '第二强化周期', quarter: '季度随访', finished: '服务结束' };

function describe(s) {
  if (s.phase === 'finished') return s.reason;
  if (s.phase === 'rest') return '协调第二周期实际启动时间；休息满28天提醒。';
  if (s.waiting && s.targetAt > s.end) return '本服务期内无下一次体测，到期办结。';
  if (s.waiting) return s.phase === 'quarter' ? '待营养师确定首次季度体测目标日。' : '本强化周期内无下一次体测，等待阶段转换。';
  return '体测邀约：' + s.targetAt + '。数据入档后按实际测量日推进同一条任务。';
}
function log(s, at, action, actual = '', previous = '') {
  s.history.push({ at, action, actual, previous, target: s.targetAt, phase: s.phase });
}
function reconcile(original, entries, today, planActive = true) {
  const s = structuredClone(original);
  if (s.phase === 'finished') return s;
  const endFirst = plus(s.firstStart, 84);
  const endSecond = s.secondStart && plus(s.secondStart, 84);
  function advance(date) {
    const previous = s.targetAt;
    if (s.phase === 'first' && date >= endFirst) {
      s.phase = 'rest'; s.targetAt = plus(endFirst, 28); s.waiting = false;
      log(s, endFirst, '第一周期结束，等待协调启动', '', previous);
    }
    if (s.phase === 'second' && date >= endSecond) {
      s.phase = 'quarter'; s.targetAt = endSecond; s.waiting = true;
      log(s, endSecond, '进入季度随访', '', previous);
    }
  }
  for (const actual of [...new Set(entries)].sort()) {
    if (actual <= s.lastMeasured || actual > today || actual > s.end) continue;
    advance(actual);
    const previous = s.targetAt;
    s.lastMeasured = actual;
    if (s.phase !== 'rest' && !(s.phase === 'second' && actual < s.secondStart)) {
      const next = plus(actual, s.phase === 'quarter' ? 84 : 28);
      const limit = s.phase === 'first' ? endFirst : s.phase === 'second' ? endSecond : plus(s.end, 1);
      s.waiting = next >= limit;
      s.targetAt = s.waiting ? limit : next;
    }
    log(s, today, '体成分数据已入档', actual, previous);
  }
  advance(today);
  if (!planActive || today > s.end) {
    s.reason = planActive ? '营养服务已到期' : '关联营养方案已结束';
    s.phase = 'finished'; log(s, today, s.reason);
  }
  return s;
}
function action(original, body, today) {
  const s = structuredClone(original), previous = s.targetAt;
  if (s.phase === 'finished' || today > s.end) throw Error('服务已结束');
  const date = String(body.date || '');
  if (body.action === 'end') {
    s.reason = String(body.reason || '').trim();
    if (!s.reason || s.reason.length > 500) throw Error('请填写具体结束原因（最多500字）');
    s.phase = 'finished'; log(s, today, s.reason);
    return s;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || plus(date,0)!==date || date>s.end) throw Error('日期无效或超出服务期');
  if (body.action === 'start') {
    if (s.phase !== 'rest' || date < plus(s.firstStart,84) || date > today || plus(date,83)>s.end) throw Error('实际启动日须在第一周期后，且能在服务期内完成第二周期');
    s.secondStart=date; s.phase='second'; s.waiting=false; s.targetAt=plus(date,28);
    log(s,today,'第二周期实际启动：'+date,'',previous);
  } else if (body.action === 'schedule') {
    const limit = s.phase==='first'?plus(s.firstStart,84):s.phase==='second'?plus(s.secondStart,84):plus(s.end,1);
    if (date<today || date>=limit) throw Error('请选择本阶段内的有效日期');
    s.targetAt=date; s.waiting=false;
    log(s,today,s.phase==='rest'?'调整下次协调日期':'确认体测安排','',previous);
  } else throw Error('无效操作');
  return s;
}
async function persist(FollowUp, task, s) {
  const date=new Date(s.targetAt+'T01:00:00Z');
  return FollowUp.findOneAndUpdate({_id:task._id,updatedAt:task.updatedAt,status:{$in:openStatuses},'bodyCompCycle.serviceVersion':1},{
    $set:{bodyCompCycle:s,theme:'体成分测量邀约 · '+labels[s.phase],content:describe(s),plannedContent:describe(s),
      date,remindAt:s.phase==='finished'?null:date,nextFollowUpDate:s.phase==='finished'?null:date,
      ...(s.phase==='finished'?{status:'completed',completedAt:new Date()}: {})}
  },{new:true});
}
async function sync(task) {
  const FollowUp=require('../models/FollowUp'), User=require('../models/User'), Plan=require('../models/HealthPlan');
  const [patient,plan]=await Promise.all([User.findById(task.patientId).select('bodyCompHistory').lean(),Plan.findOne({_id:task.sourceHealthPlanId,patientId:task.patientId,type:'nutrition'}).select('status').lean()]);
  if(!patient || !plan)return null;
  const original=task.bodyCompCycle;
  const entries=measurementOptions(patient,original.lastMeasured).map(row=>row.measuredAt);
  const s=reconcile(original,entries,day(new Date()),plan.status==='active');
  return JSON.stringify(original)===JSON.stringify(s)?task:persist(FollowUp,task,s);
}
function startScheduler(){
  const FollowUp=require('../models/FollowUp');
  let running=false;
  async function scan(){
    if(running)return;
    running=true;
    try{
      const tasks=await FollowUp.find({assessmentActionKey:/^nutrition:bodycomp:/,'bodyCompCycle.serviceVersion':1,status:{$in:openStatuses}}).lean();
      for(const task of tasks)await sync(task);
    }catch(e){console.error('[nutrition-service-followup]', e.message)}finally{running=false}
  }
  scan();setInterval(scan,60000).unref();
}
module.exports={labels,describe,reconcile,action,persist,sync,startScheduler,day,openStatuses};
