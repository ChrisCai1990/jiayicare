const active = (e) => e.kind === 'task' && ['planned', 'in_progress'].includes(e.status);
const date = (v) => v ? new Date(v).toLocaleDateString('zh-CN', {timeZone:'Asia/Shanghai'}) : '待确认';
function workbench(entries, staffId, now = new Date()) {
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const pending = entries.filter(active).sort((a,b)=>
    (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));
  return {
    pending,
    reminders: pending.filter(e=>String(e.assignedTo?._id || e.assignedTo) === String(staffId) && e.dueAt && new Date(e.dueAt) <= end),
    completed: entries.filter(e=>['completed','confirmed'].includes(e.status) && ['task','record'].includes(e.kind)),
    drafts: entries.filter(e=>e.status === 'draft'),
  };
}
function draft(kind, {groupName, entries, staff = [], staffId, now = new Date()}) {
  const w = workbench(entries, staffId, now);
  const owner = e => staff.find(s=>String(s._id) === String(e.assignedTo?._id || e.assignedTo))?.name || '负责人待核对';
  const pending = w.pending.slice(0,20).map(e=>`- ${e.title}；负责人：${owner(e)}；期限：${date(e.dueAt)}`);
  const completed = w.completed.slice(0,10).map(e=>`- ${e.title}${e.result ? '；结果：'+e.result : ''}`);
  if(kind === 'handoff') return {
    kind:'summary', title:'服务交接草稿',
    content:[`${groupName}｜交接草稿（${date(now)}）`, '仅依据当前助手已保存事项，未包含未接入的群聊。', '待跟进：', ...(pending.length ? pending : ['暂无已确认的待跟进事项']), '近期已完成/已确认记录：', ...(completed.length ? completed : ['暂无记录']), `另有 ${w.drafts.length} 条未确认草稿，请核对，不作为已完成事项。`, '交接人员及待补资料：请人工补充。'].join('\n'),
  };
  if(kind === 'reply') return {
    kind:'notification', title:'客户回复草稿',
    content:['您好，向您同步本次服务进展：', ...(completed.length ? ['已完成/已确认的服务记录：', ...completed] : ['目前暂无可自动引用的已完成服务记录。']), '具体后续安排请服务人员核对补充。'].join('\n'),
  };
  throw Object.assign(new Error('草稿类型无效'), {status:400});
}
module.exports = {workbench, draft};
