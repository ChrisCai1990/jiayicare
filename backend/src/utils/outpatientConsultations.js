function normalizeOutpatientConsultations(content = {}) {
  const rows = content.consultations === undefined
    ? [{ department: content.department || '', expert: content.expert || '' }]
    : content.consultations;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 12 || rows.some(row =>
    !row || typeof row !== 'object' || typeof row.department !== 'string' || !row.department.trim()
    || row.department.length > 100 || (row.expert !== undefined && (typeof row.expert !== 'string' || row.expert.length > 100)))) {
    throw new Error('请逐项填写1至12组就诊科室，专家可留空');
  }
  return rows.map(row => ({ department: row.department.trim(), expert: (row.expert || '').trim() }));
}

function consultationRequirementLines(content = {}) {
  if (!Array.isArray(content.consultations) || !content.consultations.length) {
    return [content.department && `科室：${content.department}`, content.expert && `医生：${content.expert}`].filter(Boolean);
  }
  return content.consultations.map((row, index) =>
    `就诊专科${index + 1}：${row.department}${row.expert ? ` · 专家：${row.expert}` : ''}`);
}

module.exports = { normalizeOutpatientConsultations, consultationRequirementLines };
