const DOCTOR_KEYS = ['medical_priority', 'tumor_risk', 'cardiovascular_risk', 'chronic_disease', 'checkup_completeness'];
const DAY = 86400000;

function summaryTodos(user, can, now = new Date()) {
  const root = user.aiHealthSummary || {};
  const byYear = Object.keys(root.byYear || {}).length ? root.byYear
    : root.sections ? { [String(new Date(root.generatedAt || now).getFullYear())]: root } : {};
  const todos = [];
  for (const [year, entry] of Object.entries(byYear)) {
    const records = Array.isArray(entry.records) ? entry.records : entry.sections ? [entry] : [];
    records.forEach((record, index) => {
      if (!record.sections || record.source === 'self_service' || record.approvedAt) return;
      const hasContent = key => record.sections[key] && Object.keys(record.sections[key]).length > 0;
      for (const [scope, type, approved, hasData, label] of [
        ['doctor', 'summary_review', record.doctorApprovedAt, DOCTOR_KEYS.some(hasContent), 'AI健康信息整理待核对（5维度）'],
        ['nutrition', 'lifestyle_review', record.nutritionApprovedAt, hasContent('lifestyle_assessment'), '生活方式评估待审核'],
      ]) {
        if (!can(type) || approved || !hasData || (record.scope && !['all', scope].includes(record.scope))) continue;
        const generatedAt = record.generatedAt ? new Date(record.generatedAt).toISOString() : '';
        const query = new URLSearchParams({ tab: 'ai', aiYear: year, aiScope: scope, aiRecordIndex: String(index), aiGeneratedAt: generatedAt });
        todos.push({ id: `${type}_${user._id}_${year}_${generatedAt || index}`, type, label,
          priority: scope === 'doctor' ? 2 : 3, patientName: user.name || '未知', patientId: String(user._id),
          summary: `${year}年度 · 第${records.length - index}次 · 待人工核对`,
          createdAt: record.generatedAt || user.updatedAt || now,
          overdue: now - new Date(record.generatedAt || user.updatedAt || now) > DAY,
          link: `/patients/${user._id}?${query}` });
      }
    });
  }
  return todos;
}

// Exceptions to patient ownership must be backed by an explicit assignee or a separately scoped query.
function visibleTodo(todo, staff, inMyScope) {
  if (staff.role === 'superadmin') return true;
  if (todo.type === 'geo_content_review') return true;
  if (todo.type === 'wecom_kf_handoff') return String(todo.assignedTo) === String(staff._id);
  return inMyScope(todo.patientId);
}

module.exports = { summaryTodos, visibleTodo };
