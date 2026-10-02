const stages = require('../../../shared/childAgeStages.json');
const ids = new Set(stages.map(stage => stage.id));

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value ? null : day;
}

function childAgeStage(birthDate, at = new Date()) {
  const birth = parseDay(birthDate);
  const chinaTime = new Date(at.getTime() + 8 * 3600000);
  const today = new Date(Date.UTC(chinaTime.getUTCFullYear(), chinaTime.getUTCMonth(), chinaTime.getUTCDate()));
  if (!birth || Number.isNaN(today.getTime()) || birth > today) return null;
  const days = Math.floor((today - birth) / 86400000);
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) years--;
  const id = days < 28 ? 'newborn' : years < 1 ? 'infant' : years < 3 ? 'toddler' : years < 6 ? 'preschool' : years < 12 ? 'school' : years < 18 ? 'adolescent' : null;
  return id ? { id, label: stages.find(stage => stage.id === id).label } : null;
}

function applicableChildQuestions(questions, stageId, gender) {
  return (questions || []).filter(q => (!q.genderOnly || q.genderOnly === gender)
    && (!q.ageStages?.length || q.ageStages.includes(stageId)));
}

module.exports = { stages, ids, childAgeStage, applicableChildQuestions };
