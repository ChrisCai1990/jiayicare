// Read-only projection of the advisor handoff, never a new clinical assessment.
function consultationBrief(request, parent) {
  const dispatch = request?.annualDispatch;
  const item = (dispatch ? dispatch.itemSnapshot : request?.formData?.serviceRequest?.itemSnapshot) || {};
  // Once dispatched, do not silently substitute a subsequently edited plan.
  const text = String(dispatch ? dispatch.advisorPlanText || '' : parent?.plannedContent || parent?.content || '');
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const field = labels => {
    const lines = text.split(/\r?\n/);
    for (const label of labels) {
      const start = lines.findIndex(line => line.trim().startsWith(`${label}：`) || line.trim().startsWith(`${label}:`));
      if (start < 0) continue;
      const parts = [lines[start].trim().slice(label.length + 1).trim()];
      for (let i = start + 1; i < lines.length && !/^[^：:]{1,20}[：:]/.test(lines[i].trim()); i++) parts.push(lines[i].trim());
      if (parts.join('\n').trim()) return parts.join('\n').trim();
    }
    return '';
  };
  const reason = clean(item.reason) || clean(item.purpose) || field(['原因', '就医原因', '复查原因', '完善依据']);
  const basis = clean(item.basisSummary) || clean(item.matchReason) || field(['设置依据', '完善依据']);
  const communication = clean(item.communicationContent) || field(['与医生交流的内容', '与专家沟通内容', '沟通要点']);
  const items = clean(item.items) || clean(item.name) || field(['项目', '待完善项目', '重点关注']);
  return { reason, basis: basis === reason ? '' : basis, communication, items, missingReason: !reason && !basis };
}
module.exports = { consultationBrief };
