const RecurringSupplyPlan = require('../models/RecurringSupplyPlan');

// 频率文案 → 周期天数，与 annualPlanFollowUps.js 的 FREQUENCY_DAYS 保持同一套映射，
// 避免同一份方案里"随访频率"和"配药/配营养素频率"用两套不同的天数换算引发困惑。
const FREQUENCY_DAYS = {
  '每周一次': 7, '每两周一次': 14,
  '每月一次': 30, '每季度一次': 90, '每半年一次': 182, '每年一次': 365,
};

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

// 年度管理方案保存时，按 moduleData.medication/supplement 里的记录列表同步生成/更新
// RecurringSupplyPlan。幂等策略：按 (sourceAnnualPlanId, planType, itemName) 匹配已有计划，
// 存在则更新频率/机构等元数据但保留 nextDueDate 不重置（避免每次保存方案就把用户已推进的
// 周期打回原点）；不存在则新建，首次 nextDueDate = 保存当天 + 频率天数。
// 方案里该条记录被删除时，对应计划置 enabled:false（不物理删除，保留历史）。
async function syncAnnualPlanSupplyPlans(plan) {
  const moduleData = plan.moduleData || {};
  const MODULE_TYPE_MAP = { medication: 'medication', supplement: 'supplement' };

  let created = 0, updated = 0, disabled = 0;

  for (const [moduleKey, planType] of Object.entries(MODULE_TYPE_MAP)) {
    const records = moduleData[moduleKey]?.records;
    const recordList = Array.isArray(records) ? records : [];

    const existing = await RecurringSupplyPlan.find({ sourceAnnualPlanId: plan._id, planType });
    const existingByName = new Map(existing.map(e => [e.itemName, e]));
    const keepNames = new Set();

    for (const rec of recordList) {
      if (!rec.itemName || !rec.frequency) continue; // 名称/频率缺失的记录跳过，不生成计划
      const days = FREQUENCY_DAYS[rec.frequency];
      if (!days) continue; // 频率文案未识别（如"按需安排"）不进入自动排期

      keepNames.add(rec.itemName);
      const found = existingByName.get(rec.itemName);
      if (found) {
        found.dosage = rec.dosage || '';
        found.frequency = rec.frequency;
        found.institution = rec.institution || '';
        found.notes = rec.notes || '';
        found.enabled = true;
        await found.save();
        updated++;
      } else {
        await RecurringSupplyPlan.create({
          patientId: plan.patientId,
          planType,
          itemName: rec.itemName,
          dosage: rec.dosage || '',
          frequency: rec.frequency,
          institution: rec.institution || '',
          notes: rec.notes || '',
          nextDueDate: addDays(new Date(), days),
          sourceAnnualPlanId: plan._id,
          createdBy: plan.createdBy,
        });
        created++;
      }
    }

    // 方案里已移除的条目，对应计划关停（不再被定时任务扫到）
    for (const [name, e] of existingByName) {
      if (!keepNames.has(name) && e.enabled) {
        e.enabled = false;
        await e.save();
        disabled++;
      }
    }
  }

  return { created, updated, disabled };
}

module.exports = { syncAnnualPlanSupplyPlans, FREQUENCY_DAYS };
