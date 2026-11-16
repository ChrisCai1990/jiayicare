const categories = ['medical_visit', 'examination', 'review', 'lifestyle', 'information'];

function validateAssessmentFollowUpDrafts(items, { structuredVisit = false } = {}) {
  if (!Array.isArray(items) || items.length > 20) throw new Error('随访草稿必须为列表，且最多20条');
  return items.map((item, index) => {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const content = typeof item?.content === 'string' ? item.content.trim() : '';
    const date = typeof item?.date === 'string' ? item.date : '';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!title || title.length > 40 || !content || content.length > 3000) throw new Error(`第${index + 1}条随访需填写标题（40字内）和完整内容（3000字内）`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`第${index + 1}条随访日期无效，请核对`);
    if (!categories.includes(item.category)) throw new Error(`第${index + 1}条随访类型无效`);
    const result = { title, content, date, category: item.category, requiresService: item.requiresService === true };
    if (structuredVisit && ['medical_visit', 'examination'].includes(item.category)) {
      const source = item.visitPlan || {};
      const fields = ['hospital', 'campus', 'department', 'expert', 'reason', 'notes'];
      const visitPlan = Object.fromEntries(fields.map(key => [key, typeof source[key] === 'string' ? source[key].trim() : '']));
      for (const key of fields) if (visitPlan[key].length > (key === 'reason' || key === 'notes' ? 2000 : 200)) throw new Error(`第${index + 1}条就医安排字段过长，请核对`);
      if (!visitPlan.hospital || !visitPlan.campus || !visitPlan.department || !visitPlan.expert) throw new Error(`第${index + 1}条请明确医院、院区、科室和专家；暂未确定时请先核实，不能发布为已安排`);
      visitPlan.bookingRequired = source.bookingRequired === true;
      visitPlan.serviceMode = ['reminder', 'single', 'managed'].includes(source.serviceMode) ? source.serviceMode : item.requiresService === true ? 'single' : 'reminder';
      visitPlan.serviceType = typeof source.serviceType === 'string' ? source.serviceType : '';
      if (visitPlan.serviceMode === 'single' && !['proxy_booking', 'proxy_visit', 'escort_visit', 'escort_exam', 'consult_coordination'].includes(visitPlan.serviceType)) throw new Error(`第${index + 1}条请选择单项就医协助类型`);
      if (visitPlan.serviceMode !== 'single') visitPlan.serviceType = '';
      result.visitPlan = visitPlan;
      result.requiresService = visitPlan.serviceMode !== 'reminder';
    }
    return result;
  });
}

module.exports = { validateAssessmentFollowUpDrafts };
