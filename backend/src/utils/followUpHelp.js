// Customer help is not completion: preserve status, evidence and service locks.
async function requestHelp({ FollowUp, task, body, now = new Date() }) {
  const fail = message => Object.assign(new Error(message), { statusCode: 409 });
  if (body.needFollowUp !== true || body.done === false) throw fail('此计划由健康管理团队跟进至结果审核完成');
  if (!['planned', 'in_progress', 'missed'].includes(task.status)) throw fail('此计划已结束，请联系健康管理团队');
  const updated = await FollowUp.findOneAndUpdate({ _id: task._id, patientId: task.patientId,
    status: task.status, updatedAt: task.updatedAt }, {
    $set: { completedByUser: false, completedByUserAt: null, remindAt: now },
    $addToSet: { tags: '人工跟进' }, $inc: { __v: 1 },
  }, { new: true });
  if (!updated) throw fail('计划已更新，请刷新后重试');
  return updated;
}
module.exports = { requestHelp };
