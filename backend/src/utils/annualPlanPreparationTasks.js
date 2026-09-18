const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const { DEFINITIONS, buildAnnualPreparationTaskRows } = require('./annualPlanPreparationTaskRows');

async function syncAnnualPreparationTasks(patientId, year, checklist) {
  const patient = await User.findById(patientId).select('_id assignedHealthManager').lean();
  if (!patient) return { created: 0, completed: 0, warnings: ['会员不存在'] };
  const rows = buildAnnualPreparationTaskRows({ patient, year, checklist });
  const desiredKeys = new Set(rows.map(row => row.key));
  let created = 0;
  for (const row of rows) {
    const result = await FollowUp.updateOne(
      { patientId, sourceType: 'annual_preparation', sourceScheduleKey: `${year}:${row.key}` },
      {
        $set: {
          staffId: row.assignedTo, assignedTo: row.assignedTo,
          type: 'other', theme: row.theme, content: row.content, plannedContent: row.content,
          tags: ['年度方案准备', '内部任务'], aiStatus: 'approved', reviewRole: null,
          formData: { annualPreparation: { year, itemKey: row.itemKey } },
          status: 'planned', completedAt: null, completedBy: null, executedContent: '', isBlocked: false,
        },
        $setOnInsert: { date: new Date(), remindAt: new Date(), sourceType: 'annual_preparation', sourceScheduleKey: `${year}:${row.key}` },
      },
      { upsert: true },
    );
    created += result.upsertedCount || 0;
  }
  const allKeys = Object.values(DEFINITIONS).map(item => `${year}:${item.key}`);
  const completedKeys = allKeys.filter(key => !desiredKeys.has(key.slice(String(year).length + 1)));
  const result = completedKeys.length ? await FollowUp.updateMany(
    { patientId, sourceType: 'annual_preparation', sourceScheduleKey: { $in: completedKeys }, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '档案已完善或已确认无，系统自动完成。' } },
  ) : { modifiedCount: 0 };
  return { created, completed: result.modifiedCount || 0, warnings: patient.assignedHealthManager ? [] : ['客户尚未绑定健管专员，未生成资料完善任务'] };
}

async function completeAnnualPreparationTask(patientId, itemKey) {
  const definition = DEFINITIONS[itemKey];
  if (!definition) return 0;
  const result = await FollowUp.updateMany(
    { patientId, sourceType: 'annual_preparation', sourceScheduleKey: { $regex: `:${definition.key}$` }, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', executedContent: '档案记录已录入，系统自动完成。' } },
  );
  return result.modifiedCount || 0;
}

module.exports = { buildAnnualPreparationTaskRows, syncAnnualPreparationTasks, completeAnnualPreparationTask };
