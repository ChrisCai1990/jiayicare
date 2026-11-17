const DAY = 86400000;

function dateOnly(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const local = typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)
    ? value : new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const result = new Date(`${local}T00:00:00.000Z`);
  return result.toISOString().slice(0, 10) === local ? result : null;
}

function addDays(value, days) {
  const date = dateOnly(value);
  return date && new Date(date.getTime() + days * DAY);
}

function taskKey(planId, cycle) { return `nutrition:bodycomp:${planId}:${cycle}`; }

function isBodyCompTask(task) { return Boolean(task?.bodyCompCycle?.planId && task?.assessmentActionKey === taskKey(task.bodyCompCycle.planId, task.bodyCompCycle.cycle)); }

function taskDocument(plan, patient, cycle, targetDate, previousTaskId = null, evidenceAfterAt = null, now = new Date()) {
  const targetAt = dateOnly(targetDate);
  if (!targetAt) throw new Error('请填写有效的测量目标日期');
  const inviteAt = new Date(Math.max(addDays(targetAt, -3).getTime(), dateOnly(now).getTime()));
  return {
    patientId: plan.patientId, staffId: plan.staffId,
    assignedTo: patient.assignedNutritionist || plan.staffId,
    tenantId: patient.tenantId || null,
    sourceType: 'health_plan', sourceHealthPlanId: plan._id,
    sourceAnnualPlanId: plan.sourceAnnualPlanId || null,
    managementIssueIds: [...new Set((plan.content?.annualManagementIssues || []).map(row => String(row.issueId || '')).filter(Boolean))],
    assessmentActionKey: taskKey(plan._id, cycle),
    theme: `体成分测量邀约 · 第${cycle}次`,
    plannedContent: `请营养师提前联系客户，安排体成分测量；目标日期 ${targetAt.toISOString().slice(0, 10)}。测量结果入档后确认下一轮日期。`,
    date: inviteAt, remindAt: inviteAt, type: 'phone', status: 'planned',
    aiStatus: 'approved', reviewRole: 'nutritionist',
    bodyCompCycle: { planId: plan._id, cycle, targetAt, inviteAt, previousTaskId, evidenceAfterAt },
  };
}

async function ensureTask(FollowUp, plan, patient, cycle, targetDate, previousTaskId = null, evidenceAfterAt = null) {
  const key = taskKey(plan._id, cycle);
  try {
    return await FollowUp.findOneAndUpdate(
      { assessmentActionKey: key },
      { $setOnInsert: taskDocument(plan, patient, cycle, targetDate, previousTaskId, evidenceAfterAt) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return FollowUp.findOne({ assessmentActionKey: key });
  }
}

function measurementDate(row) { return dateOnly(row?.measuredAt || row?.recordedAt); }
function hasMeasurement(row) { return ['weight', 'bodyFatRate', 'skelMuscle', 'muscleMass', 'visceralFat', 'fatMass'].some(key => row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== ''); }
function measurementOptions(patient, afterDate) {
  const minDate = dateOnly(afterDate);
  return (patient.bodyCompHistory || []).map((row, index) => ({ row, index, measuredAt: measurementDate(row) }))
    .filter(item => item.measuredAt && hasMeasurement(item.row) && (!minDate || item.measuredAt >= minDate))
    .map(({ row, index, measuredAt }) => ({ index, measuredAt: measuredAt.toISOString().slice(0, 10), source: row.source || 'manual', sourceReportId: row.sourceReportId || '', weight: row.weight, bodyFatRate: row.bodyFatRate, skelMuscle: row.skelMuscle, visceralFat: row.visceralFat }));
}

module.exports = { addDays, dateOnly, taskKey, isBodyCompTask, taskDocument, ensureTask, measurementOptions };
