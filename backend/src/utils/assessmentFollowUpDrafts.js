const categories = ['medical_visit', 'examination', 'review', 'lifestyle', 'information'];

function validateAssessmentFollowUpDrafts(items) {
  if (!Array.isArray(items) || items.length > 20) throw new Error('随访草稿必须为列表，且最多20条');
  return items.map((item, index) => {
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    const content = typeof item?.content === 'string' ? item.content.trim() : '';
    const date = typeof item?.date === 'string' ? item.date : '';
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!title || title.length > 40 || !content || content.length > 3000) throw new Error(`第${index + 1}条随访需填写标题（40字内）和完整内容（3000字内）`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error(`第${index + 1}条随访日期无效，请核对`);
    if (!categories.includes(item.category)) throw new Error(`第${index + 1}条随访类型无效`);
    return { title, content, date, category: item.category, requiresService: item.requiresService === true };
  });
}

module.exports = { validateAssessmentFollowUpDrafts };
