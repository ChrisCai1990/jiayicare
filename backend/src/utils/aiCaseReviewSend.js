const { randomUUID } = require('node:crypto');

const failure = (status, message) => Object.assign(new Error(message), { status });
const normalizedFiles = files => (Array.isArray(files) ? files : []).slice(0, 6).map(file => ({
  name: String(file.name || ''), url: String(file.url || ''), mimeType: String(file.mimeType || ''),
}));

// Persist acceptance before starting AI. The document revision serializes claims across processes.
async function acceptSend(Model, { patientId, topicId, staff, content, attachments, requestId }) {
  const legacy = requestId === undefined || requestId === null || requestId === '';
  if (!legacy && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId))) {
    throw failure(400, '发送标识无效，请刷新页面后重试');
  }
  content = String(content || '').trim();
  attachments = normalizedFiles(attachments);
  if (!content && !attachments.length) throw failure(400, '请输入问题或添加图片');
  content ||= '请分析本轮上传的图文资料';
  const topic = await Model.findOne({ _id: topicId, user: patientId, status: { $ne: 'archived' } });
  if (!topic) throw failure(404, '研判主题不存在');
  if (legacy) {
    // Pages open before deployment have no request ID. Reuse a matching recent last turn,
    // or a still pending/failed turn, so transport retries cannot append duplicates.
    const last = [...topic.messages].reverse().find(item => item.role === 'staff');
    const retryable = last?.requestId && (Date.now() - new Date(last.createdAt).getTime() < 600000
      || (topic.generation?.requestId === last.requestId && ['running', 'failed'].includes(topic.generation.status)));
    requestId = retryable && String(last.staff) === String(staff._id) && last.content === content
      && JSON.stringify(normalizedFiles(last.attachments)) === JSON.stringify(attachments)
      ? last.requestId : randomUUID();
  }
  const previous = topic.messages.find(item => item.role === 'staff' && item.requestId === requestId);
  // Explicit retry may replace a stalled worker after five minutes. The token fences any late result.
  const stalled = previous && topic.generation?.requestId === requestId
    && topic.generation.status === 'running' && Date.now() - new Date(topic.generation.startedAt).getTime() > 300000;
  if (previous) {
    if (String(previous.staff) !== String(staff._id) || previous.content !== content
      || JSON.stringify(normalizedFiles(previous.attachments)) !== JSON.stringify(attachments)) {
      throw failure(409, '同一次发送的内容已变化，请刷新后核对');
    }
    if (topic.messages.some(item => item.role === 'ai' && item.requestId === requestId)
      || (topic.generation?.requestId === requestId && topic.generation.status === 'running' && !stalled)) {
      return { topic, claimed: false };
    }
    if (topic.generation?.requestId !== requestId || (topic.generation.status !== 'failed' && !stalled)) {
      throw failure(409, '该讨论已有后续变化，请刷新后核对');
    }
  }
  if (topic.generation?.status === 'running' && !stalled) throw failure(409, 'AI正在回复，请等待本轮完成');
  const generation = { requestId, token: randomUUID(), status: 'running', startedAt: new Date(), error: '' };
  const managementTargets = (topic.conclusion?.managementTargets || []).map(row => ({
    goal: row.goal, focus: row.focus, nutritionRelevant: row.nutritionRelevant === true,
  }));
  const update = {
    $set: { generation, status: 'active', lastActivityAt: new Date(), conclusion: { content: '', structured: null, managementTargets, status: 'draft' } },
    $inc: { __v: 1 },
  };
  const push = {};
  if (topic.conclusion?.status === 'confirmed') push.conclusionHistory = {
    content: topic.conclusion.content, managementTargets, confirmedAt: topic.conclusion.confirmedAt,
    confirmedBy: topic.conclusion.confirmedBy, confirmedByName: topic.conclusion.confirmedByName,
  };
  if (!previous) push.messages = { role: 'staff', requestId, content, attachments,
    staff: staff._id, staffName: staff.name || '', staffRole: staff.roleLabel || staff.role };
  if (Object.keys(push).length) update.$push = push;
  const claimed = await Model.findOneAndUpdate({ _id: topic._id, user: patientId, __v: topic.__v,
    'generation.status': stalled ? 'running' : { $ne: 'running' }, status: { $ne: 'archived' } }, update, { new: true, runValidators: true });
  if (!claimed) throw failure(409, '讨论状态已更新，请重试核对本次发送');
  return { topic: claimed, claimed: true };
}

async function finishSend(Model, topic, generate) {
  const filter = { _id: topic._id, 'generation.token': topic.generation.token, 'generation.status': 'running' };
  try {
    const { result, snapshot } = await generate();
    if (!result.content) throw new Error('AI未返回可展示的分析内容');
    const set = { 'generation.status': 'completed', 'generation.error': '',
      providerSessionId: result.sessionId || topic.providerSessionId, lastActivityAt: new Date() };
    if (!topic.conclusion?.managementTargets?.length && result.managementTargets?.length) {
      set['conclusion.managementTargets'] = require('./caseReviewManagementTargets').normalizeTargets(result.managementTargets);
    }
    await Model.updateOne(filter, { $push: { messages: {
      role: 'ai', requestId: topic.generation.requestId, content: result.content,
      provider: result.provider, providerModel: result.model, durationMs: result.durationMs,
      attachments: result.files || [], evidenceRefs: snapshot.sources, contextSnapshot: snapshot,
    } }, $set: set, $inc: { __v: 1 } });
  } catch (err) {
    await Model.updateOne(filter, { $set: { 'generation.status': 'failed',
      'generation.error': String(err.message || 'AI回复失败').slice(0, 500) }, $inc: { __v: 1 } });
  }
}

module.exports = { acceptSend, finishSend };
