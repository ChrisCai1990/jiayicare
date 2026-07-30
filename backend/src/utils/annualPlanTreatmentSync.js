const crypto = require('crypto');
const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');

function recordKey(record, index, kind) {
  if (record.recordKey) return String(record.recordKey);
  const identity = [
    kind,
    record.name || record.itemName || '',
    record.brandName || record.brand || '',
    record.specification || '',
    index,
  ].join('|');
  return crypto.createHash('sha1').update(identity).digest('hex').slice(0, 20);
}

function commonFields(record) {
  return {
    specification: record.specification || '',
    dosage: record.dosage || '',
    method: record.method || '',
    frequency: record.frequency || '',
    startDate: record.startDate || '',
    endDate: record.endDate || '',
    purpose: record.purpose || '',
    note: record.note || record.notes || '',
  };
}

async function syncKind(plan, moduleKey, Model) {
  const module = plan.moduleData?.[moduleKey] || {};
  const records = module.enabled === false || !Array.isArray(module.records) ? [] : module.records;
  const keepKeys = new Set();
  let created = 0;
  let updated = 0;
  let stopped = 0;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const name = String(record.name || record.itemName || '').trim();
    if (!name || !record.dosage || !record.frequency) continue;
    const key = recordKey(record, index, moduleKey);
    keepKeys.add(key);
    const existing = await Model.findOne({
      sourceAnnualPlanId: plan._id,
      sourceRecordKey: key,
      stopped: false,
    }).sort({ createdAt: -1 });

    const fields = {
      ...commonFields(record),
      user: plan.patientId,
      name,
      createdByStaff: true,
      staffId: plan.createdBy,
      createdByName: '管理方案自动写入',
      aiStatus: null,
      sourceType: 'annual_plan',
      sourceAnnualPlanId: plan._id,
      sourceRecordKey: key,
    };
    if (moduleKey === 'medication') {
      fields.brandName = record.brandName || '';
      fields.timing = record.timing || '';
      fields.method = record.method || '口服';
    } else {
      fields.brand = record.brand || '';
      fields.method = record.method || '随餐';
    }

    if (existing) {
      Object.assign(existing, fields);
      await existing.save();
      updated++;
    } else {
      await Model.create(fields);
      created++;
    }
  }

  const activeFromPlan = await Model.find({ sourceAnnualPlanId: plan._id, stopped: false });
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const item of activeFromPlan) {
    if (!keepKeys.has(item.sourceRecordKey)) {
      item.stopped = true;
      item.stopDate = today;
      item.stopReason = '管理方案调整';
      item.stopMode = 'plan_adjustment';
      item.stoppedBy = plan.createdBy;
      item.stoppedByName = '管理方案制定人';
      await item.save();
      stopped++;
    }
  }
  return { created, updated, stopped };
}

async function syncAnnualPlanTreatments(plan) {
  const medication = await syncKind(plan, 'medication', Medication);
  const supplement = await syncKind(plan, 'supplement', Supplement);
  return { medication, supplement };
}

module.exports = { syncAnnualPlanTreatments };
