const Reminder = require('../models/Reminder');
const User = require('../models/User');

const BP_RE = /血压|高血压|收缩压|舒张压/i;
const WEIGHT_RE = /体重|减重|肥胖|超重|BMI|体脂/i;
const HYPERTENSION_RE = /高血压|血压偏高|血压升高/i;
const METABOLIC_RE = /肥胖|超重|代谢综合征|糖尿病|高脂血症|脂肪肝/i;

function patientAge(patient, now = new Date()) {
  const explicit = Number(patient?.age);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const raw = patient?.birthDate || patient?.birthday || patient?.dateOfBirth;
  const birth = raw ? new Date(raw) : null;
  if (!birth || Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function patientText(patient) {
  return [...(patient?.chronicDiseases || []), ...(patient?.medicalHistory || []),
    ...(patient?.healthProfile?.medicalHistory || []), patient?.healthConcern].filter(Boolean).join('；');
}

function scheduleFromFrequency(frequency, daily) {
  const text = String(frequency || '').replace(/\s+/g, '');
  if (/每日|每天|一天/.test(text)) return { daysOfWeek: [], customEveryNDays: 1 };
  if (/每周2次|每周两次|一周2次|一周两次/.test(text)) return { daysOfWeek: ['Mon', 'Thu'] };
  if (/每周|一周/.test(text)) return { daysOfWeek: ['Mon'] };
  const days = text.match(/每(\d+)天/);
  if (days) return { daysOfWeek: [], customEveryNDays: Math.max(1, Number(days[1])) };
  return daily ? { daysOfWeek: [], customEveryNDays: 1 } : { daysOfWeek: ['Mon'] };
}

function reminderTime(value, fallback = '08:00') {
  const match = String(value || '').match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)/);
  return match ? `${String(match[1]).padStart(2, '0')}:${match[2]}` : fallback;
}

// 体重：所有已建档客户每周提醒；有体重/代谢风险时每周两次。
// 血压：35岁及以上每周；有高血压或130/80以上读数每周两次；近30天出现140/90以上则每日。
function buildMonitoringReminderSpecs(patient, moduleData = {}, recentBloodPressure = []) {
  const records = Array.isArray(moduleData.monitoring?.records) ? moduleData.monitoring.records : [];
  const text = patientText(patient);
  const age = patientAge(patient);
  const hasHypertension = HYPERTENSION_RE.test(text);
  const bpValues = recentBloodPressure.map(row => ({
    sys: Number(row?.extra?.sys || String(row?.value || '').split('/')[0]),
    dia: Number(row?.extra?.dia || String(row?.value || '').split('/')[1]),
  })).filter(row => row.sys > 0 && row.dia > 0);
  const hasHighReading = bpValues.some(row => row.sys >= 140 || row.dia >= 90);
  const hasElevatedReading = bpValues.some(row => row.sys >= 130 || row.dia >= 80);
  const bmi = Number(patient?.height) > 0 && Number(patient?.weight) > 0
    ? Number(patient.weight) / ((Number(patient.height) / 100) ** 2) : null;
  const needsWeightFocus = METABOLIC_RE.test(text) || (bmi && bmi >= 24);
  const explicitBp = records.find(row => BP_RE.test(`${row.items || ''} ${row.purpose || ''}`));
  const explicitWeight = records.find(row => WEIGHT_RE.test(`${row.items || ''} ${row.purpose || ''}`));
  const specs = [];
  if (explicitBp || hasHypertension || hasElevatedReading || (age !== null && age >= 35)) {
    const bpSchedule = explicitBp
      ? scheduleFromFrequency(explicitBp.frequency, false)
      : (hasHighReading ? { daysOfWeek: [], customEveryNDays: 1 }
        : ((hasHypertension || hasElevatedReading) ? { daysOfWeek: ['Mon', 'Thu'] } : { daysOfWeek: ['Mon'] }));
    specs.push({
      sourceKey: 'blood_pressure', category: 'monitoring', title: '测量血压',
      description: explicitBp?.precautions || explicitBp?.notes || (hasHypertension ? '按固定时段测量并记录；如有不适或读数异常，请及时联系专业人员。' : '建议每周固定一天、同一时段测量并记录。'),
      reminderTime: reminderTime(explicitBp?.time), ...bpSchedule,
    });
  }
  const weightSchedule = explicitWeight
    ? scheduleFromFrequency(explicitWeight.frequency, false)
    : (needsWeightFocus ? { daysOfWeek: ['Mon', 'Thu'] } : { daysOfWeek: ['Mon'] });
  specs.push({
    sourceKey: 'weight', category: 'weight_checkin', title: '记录体重',
    description: explicitWeight?.precautions || explicitWeight?.notes || '建议晨起、空腹、穿着相近衣物测量并记录，用于观察长期趋势。',
    reminderTime: reminderTime(explicitWeight?.time), ...weightSchedule,
  });
  return specs;
}

async function syncServiceCycleMonitoringReminders(userId) {
  const patient = await User.findById(userId)
    .select('age birthDate birthday dateOfBirth height weight chronicDiseases medicalHistory healthProfile.medicalHistory healthConcern serviceStartDate serviceExpiry createdAt onboardingCompletedAt').lean();
  if (!patient) return { created: 0, updated: 0 };
  const HealthRecord = require('../models/HealthRecord');
  const recentBloodPressure = await HealthRecord.find({ user: patient._id, type: 'bloodPressure', recordedAt: { $gte: new Date(Date.now() - 30 * 86400000) } })
    .sort({ recordedAt: -1 }).limit(14).select('value extra recordedAt').lean();
  const specs = buildMonitoringReminderSpecs(patient, {}, recentBloodPressure);
  const activeKeys = specs.map(item => item.sourceKey);
  const startDate = patient.serviceStartDate || patient.onboardingCompletedAt || patient.createdAt || new Date();
  const endDate = patient.serviceExpiry ? new Date(`${patient.serviceExpiry}T23:59:59+08:00`) : null;
  const serviceActive = !endDate || endDate >= new Date();
  let created = 0; let updated = 0;
  for (const spec of specs) {
    const sourceKey = `service-cycle:${spec.sourceKey}`;
    const existing = await Reminder.findOne({ user: patient._id, sourceKey, systemManaged: true }).select('userDisabled').lean();
    const result = await Reminder.updateOne(
      { user: patient._id, sourceKey, systemManaged: true },
      { $set: { category: spec.category, title: spec.title, description: spec.description,
        scheduleType: 'recurring', reminderTime: spec.reminderTime, daysOfWeek: spec.daysOfWeek || [],
        customEveryNDays: spec.customEveryNDays, startDate, endDate, enabled: serviceActive && !existing?.userDisabled, systemManaged: true,
        sourceAnnualPlanId: null },
        $setOnInsert: { user: patient._id, sourceKey } },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1; else if (result.modifiedCount) updated += 1;
  }
  await Reminder.updateMany(
    { user: patient._id, systemManaged: true, sourceKey: { $regex: '^service-cycle:', $nin: activeKeys.map(key => `service-cycle:${key}`) } },
    { $set: { enabled: false } },
  );
  await syncMonitoringSystemMessage(patient._id);
  return { created, updated };
}

function activeToday(reminder, now = new Date()) {
  if (!reminder?.enabled) return false;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const start = reminder.startDate ? new Date(reminder.startDate) : null;
  const end = reminder.endDate ? new Date(reminder.endDate) : null;
  if (start) { start.setHours(0, 0, 0, 0); if (start > today) return false; }
  if (end) { end.setHours(0, 0, 0, 0); if (end < today) return false; }
  if (reminder.customEveryNDays && start) {
    return Math.floor((today - start) / 86400000) % reminder.customEveryNDays === 0;
  }
  if (!reminder.daysOfWeek?.length) return true;
  return reminder.daysOfWeek.includes(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getDay()]);
}

async function syncMonitoringSystemMessage(userId, now = new Date()) {
  const Message = require('../models/Message');
  const HealthRecord = require('../models/HealthRecord');
  const reminders = await Reminder.find({ user: userId, systemManaged: true, sourceKey: /^service-cycle:/, enabled: true }).lean();
  const due = reminders.filter(item => activeToday(item, now));
  if (!due.length) return null;
  const cstDay = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const dayStart = new Date(`${cstDay}T00:00:00+08:00`);
  const dayEnd = new Date(`${cstDay}T23:59:59.999+08:00`);
  const dueTypes = due.map(item => item.sourceKey.endsWith('blood_pressure') ? 'bloodPressure' : 'weight');
  const completedTypes = await HealthRecord.distinct('type', { user: userId, type: { $in: dueTypes }, recordedAt: { $gte: dayStart, $lte: dayEnd } });
  const pending = due.filter(item => !completedTypes.includes(item.sourceKey.endsWith('blood_pressure') ? 'bloodPressure' : 'weight'));
  const labels = pending.map(item => item.sourceKey.endsWith('blood_pressure') ? '测量血压' : '记录体重');
  const completed = pending.length === 0;
  const content = completed ? '今日健康监测已完成，数据已记录。' : `今日请完成：${labels.join('、')}。完成后数据将用于更新健康趋势。`;
  return Message.findOneAndUpdate(
    { dedupeKey: `health-monitoring:${userId}` },
    { $set: {
      user: userId, type: 'system', sender: '嘉医汇', title: '今日健康监测', content,
      unread: !completed, readAt: completed ? new Date() : null,
      action: { type: 'health_monitoring', route: 'AddRecord', dueTypes, date: cstDay },
    }, $setOnInsert: { dedupeKey: `health-monitoring:${userId}` } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

module.exports = { patientAge, buildMonitoringReminderSpecs, activeToday, syncMonitoringSystemMessage, syncServiceCycleMonitoringReminders };
