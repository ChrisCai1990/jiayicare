const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
async function saveProgress({ FollowUp, id, actor, body, now = new Date() }) {
  const task = await FollowUp.findById(id).lean();
  if (!task) throw fail('随访记录不存在', 404);
  const owner = task.assignedTo || task.staffId;
  if (actor.role !== 'superadmin' && String(owner) !== String(actor._id)) throw fail('仅当前任务负责人可记录进展', 403);
  if (task.taskRole || task.workflowKey) throw fail('服务岗位任务请使用原流程入口');
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId || '')) throw fail('缺少有效提交标识', 400);
  const prior = task.progressRecords?.find(row => row.requestId === body.requestId);
  if (prior) return task; // Lost response retry never appends or reopens.
  if (!['planned', 'in_progress', 'missed'].includes(task.status) || task.aiStatus === 'pending') throw fail('已结束或待审核的随访不能记录进展');
  const content = String(body.content || '').trim();
  if (!content || content.length > 5000) throw fail('请填写5000字以内的本次沟通情况', 400);
  const type = body.type || task.type;
  if (!['phone', 'wechat', 'visit', 'video', 'other'].includes(type)) throw fail('沟通方式无效', 400);
  const next = body.nextContactAt ? new Date(body.nextContactAt) : null;
  if (next && !Number.isFinite(next.getTime())) throw fail('下次跟进时间无效', 400);
  if (!body.updatedAt || new Date(body.updatedAt).getTime() !== new Date(task.updatedAt).getTime()) throw fail('记录已更新，请刷新后补充，原记录不会覆盖');
  const record = { requestId: body.requestId, content, type, staffId: actor._id, staffName: actor.name || '', recordedAt: now, nextContactAt: next };
  const records = [];
  if (!task.progressRecords?.length && task.executedContent) records.push({ requestId: 'legacy-execution', content: task.executedContent,
    type: task.executedType || task.type, recordedAt: task.updatedAt });
  records.push(record);
  const saved = await FollowUp.findOneAndUpdate({ _id: task._id, updatedAt: task.updatedAt, status: task.status,
    assignedTo: task.assignedTo || null, 'progressRecords.requestId': { $ne: body.requestId } }, {
    $push: { progressRecords: { $each: records } }, $inc: { __v: 1 },
    $set: { status: 'in_progress', plannedContent: task.plannedContent || task.content || '', executedContent: content, executedType: type,
      ...(next ? { nextFollowUpDate: next, remindAt: next } : {}) },
  }, { new: true, runValidators: true });
  if (!saved) throw fail('记录已更新，请刷新后补充，原记录不会覆盖');
  return saved;
}
module.exports = { saveProgress };
