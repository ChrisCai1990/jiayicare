function chinaDay(at) { return new Date(at.getTime() + 8 * 3600000).toISOString().slice(0, 10); }

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

function validateChildAnswers(questions, answers, birthDate, at = new Date()) {
  let answered = 0;
  for (const question of questions || []) {
    const value = answers[question.id];
    if (value === undefined || value === null || value === '') continue;
    const label = `「${question.text}」`;
    if (question.type === 'number') {
      const raw = String(value).trim();
      if (!/^(?:\d+)(?:\.\d+)?$/.test(raw)) return `${label}请填写数字，不要附加单位或文字`;
      const number = Number(raw);
      if (!Number.isFinite(number) || number > 30000) return `${label}数值超出可录入范围`;
      const field = String(question.archiveField || '');
      if (['childProfile.apgar1min', 'childProfile.apgar5min'].includes(field) && (number > 10 || !Number.isInteger(number))) return `${label}应为0到10的整数`;
      if (['childProfile.birthWeight', 'childProfile.birthLength', 'childProfile.birthHeadCirc',
        'childProfile.birthChestCirc', 'childProfile.gestationalWeeks', 'childProfile.reportedHeightCm',
        'childProfile.reportedWeightKg'].includes(field) && number === 0) return `${label}须大于0`;
    } else if (question.type === 'date') {
      if (!validDay(value)) return `${label}请填写有效日期`;
      if (value > chinaDay(at)) return `${label}不能晚于今天`;
      if (question.archiveField === 'childProfile.reportedMeasuredAt' && validDay(birthDate) && value < birthDate) return `${label}不能早于孩子出生日期`;
    } else if (question.type === 'dropdown' || question.type === 'radio') {
      const choices = (question.options || []).map(option => typeof option === 'string' ? option : option.label);
      if (choices.length && !choices.includes(value)) return `${label}选项无效`;
    } else if (typeof value === 'string' && value.length > 4000) return `${label}内容过长`;
    answered++;
  }
  return answered ? '' : '请至少填写一项儿童健康信息；不清楚的项目可以留空';
}

module.exports = { validateChildAnswers };
