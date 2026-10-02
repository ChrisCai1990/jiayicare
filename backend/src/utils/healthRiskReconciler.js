const HealthRecord = require('../models/HealthRecord');
const MedicalReport = require('../models/MedicalReport');
const { syncRecordRisk, syncReportRisk } = require('./healthRiskEvents');
const { runWithoutTenantScope } = require('./tenantScope');
const { policy, patientFilter } = require('./healthRiskRollout');

let running = false;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

async function scanBatches(Model, filter, handler) {
  let lastId = null;
  let processed = 0;
  while (true) {
    const query = lastId ? { ...filter, _id: { $gt: lastId } } : filter;
    const rows = await Model.find(query).sort({ _id: 1 }).limit(100);
    if (!rows.length) break;
    for (const row of rows) {
      try { await handler(row); }
      catch (error) { console.error('[health-risk] reconcile source failed', row._id, error); }
    }
    processed += rows.length;
    lastId = rows[rows.length - 1]._id;
    if (rows.length < 100) break;
  }
  return processed;
}

async function reconcileRecentRiskSources() {
  if (running) return;
  if (policy().mode === 'disabled' || (policy().mode === 'allowlist' && !policy().ids.length)) return { recordCount: 0, reportCount: 0 };
  running = true;
  try {
    return await runWithoutTenantScope(async () => {
      const since = new Date(Date.now() - LOOKBACK_MS);
      const recordCount = await scanBatches(HealthRecord, {
        ...patientFilter('user'),
        type: { $in: ['bloodPressure', 'bloodSugar'] }, status: { $in: ['warning', 'danger'] },
        recordedAt: { $gte: since }, deletedAt: null,
      }, syncRecordRisk);
      const reportCount = await scanBatches(MedicalReport, {
        ...patientFilter('user'),
        audit_status: 'audited', audited_at: { $gte: since },
      }, syncReportRisk);
      return { recordCount, reportCount };
    });
  } finally { running = false; }
}

function startHealthRiskReconciler() {
  setTimeout(() => reconcileRecentRiskSources().catch(error => console.error('[health-risk] initial reconcile failed', error)), 5000);
  setInterval(() => reconcileRecentRiskSources().catch(error => console.error('[health-risk] periodic reconcile failed', error)), 30 * 60 * 1000);
}

module.exports = { reconcileRecentRiskSources, startHealthRiskReconciler };
