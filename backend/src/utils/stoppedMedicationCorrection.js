const FIELDS = ['name', 'brandName', 'specification', 'dosage', 'method', 'frequency', 'timing',
  'startDate', 'endDate', 'purpose', 'note', 'imageUrls', 'stopDate', 'stopReason'];

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function buildStoppedMedicationCorrection(med, body, actor, now = new Date()) {
  if (!med.stopped) fail('只有已停用记录可使用历史订正入口', 409);
  if (body.stopped !== undefined || body.active !== undefined || body.aiStatus !== undefined) fail('历史订正不能改变用药状态');
  const version = new Date(body.updatedAt || '');
  if (Number.isNaN(version.getTime()) || version.getTime() !== new Date(med.updatedAt).getTime()) fail('记录已变化，请刷新后重新订正', 409);
  const reason = String(body.correctionReason || '').trim();
  if (!reason || reason.length > 1000) fail('请填写订正理由（最多1000字）');
  const set = {}, changes = {};
  for (const key of FIELDS) {
    if (body[key] === undefined) continue;
    let value = body[key];
    if (key === 'imageUrls') {
      if (!Array.isArray(value) || value.length > 20 || value.some(url => typeof url !== 'string')) fail('附件格式无效');
    } else {
      if (typeof value !== 'string' || value.length > 4000) fail('订正内容格式无效或过长');
      value = value.trim();
    }
    if (['startDate', 'endDate', 'stopDate'].includes(key) && value
      && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) fail('日期格式无效');
    const previous = key === 'imageUrls' ? [...(med.imageUrls || [])] : med[key] || '';
    if (JSON.stringify(previous) !== JSON.stringify(value)) {
      set[key] = value;
      changes[key] = { before: previous, after: value };
    }
  }
  if (!Object.keys(changes).length) fail('没有需要订正的内容');
  for (const key of ['name', 'dosage', 'frequency']) {
    if (!(set[key] ?? med[key] ?? '').trim()) fail('药品名称、剂量和频次不能为空');
  }
  if (!(set.stopReason ?? med.stopReason ?? '').trim()) fail('停用原因不能为空');
  return {
    filter: { _id: med._id, user: med.user, stopped: true, updatedAt: med.updatedAt },
    update: { $set: set, $push: { correctionHistory: {
      at: now, by: actor._id, byName: actor.name || '', reason, changes,
    } } },
  };
}

module.exports = { buildStoppedMedicationCorrection };
