const id = value => String(value?._id || value || '');
const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
  .replace(/[\s,，。.、:：;；/\\_\-·•（）()【】\[\]]/g, '');

function reportYear(report) {
  const date = String(report.checkDate || report.date || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : null;
}
function sameCheckupRound(plan, report) {
  const target = plan.checkupDate && new Date(plan.checkupDate);
  const actual = new Date(String(report.checkDate || '').slice(0, 10));
  return target && reportYear(report) === Number(plan.year)
    && !Number.isNaN(target.getTime()) && !Number.isNaN(actual.getTime())
    && Math.abs(target.getTime() - actual.getTime()) <= 45 * 86400000;
}
const NON_EXAM_CATEGORIES = ['outpatient_record', 'inpatient_record', 'prescription_order', 'questionnaire', 'other_customer_material'];
const hasResult = part => [part.value, part.findings, part.diagnosis, part.conclusion]
  .some(value => value !== null && value !== undefined && !/^[\s\-—–/]*$/.test(String(value)));

function categoryKeys(categories) {
  const byId = new Map(categories.filter(c => c.status === 'active').map(c => [id(c), c]));
  const result = new Map();
  for (const category of byId.values()) {
    const chain = [category];
    let node = category;
    while (node.parent && byId.has(id(node.parent)) && chain.length < 10) {
      node = byId.get(id(node.parent));
      chain.unshift(node);
    }
    if (node.parent && !byId.has(id(node.parent))) continue;
    const root = chain[0];
    const parent = chain.length > 1 ? chain[chain.length - 2] : category;
    result.set(id(category), `${id(root)}|${parent.name}|${category.name}`);
  }
  return result;
}

function suggest(plan, reports, catalog = new Map()) {
  const pending = (plan.items || []).filter(item => ['pending', 'completed'].includes(item.status) && !item.reportId);
  const names = new Map();
  const categories = new Map();
  for (const item of pending) {
    const name = normalize(item.name);
    if (name) names.set(name, (names.get(name) || 0) + 1);
    const category = catalog.get(id(item.itemId));
    if (category) categories.set(category, (categories.get(category) || 0) + 1);
  }
  return pending.map(item => {
    const name = normalize(item.name);
    const category = catalog.get(id(item.itemId));
    const candidates = reports.filter(report => {
      if (report.audit_status !== 'audited' || report.archiveOnly || NON_EXAM_CATEGORIES.includes(report.documentCategory)
        || !sameCheckupRound(plan, report)) return false;
      return (report.reportItems || []).some(part => {
        if (!hasResult(part)) return false;
        const exact = name && names.get(name) === 1 && [part.name, part.orderName].some(raw => normalize(raw) === name);
        const key = part.screeningKey || (part.screeningKeys?.length === 1 ? part.screeningKeys[0] : '');
        const confirmed = part.classificationSource === 'manual' || !!part.classificationReviewedAt
          || Number(part.matchConfidence) >= 0.95;
        const classified = confirmed && category && categories.get(category) === 1 && key === category;
        return exact || classified;
      });
    });
    return { itemId: id(item), name: item.name, reportId: candidates.length === 1 ? id(candidates[0]) : null,
      candidateCount: candidates.length };
  });
}

async function loadEvidence(plan, models) {
  const { MedicalReport, LabTestOrder, SpecialExam, FunctionalMedicineTest, ProjectCategory } = models;
  const target = new Date(plan.checkupDate);
  if (!plan.checkupDate || !Number.isFinite(target.getTime())) return { reports: [], catalog: new Map() };
  const windowMs = 45 * 86400000;
  const from = new Date(Math.max(target.getTime() - windowMs, Date.UTC(Number(plan.year), 0, 1))).toISOString().slice(0, 10);
  const through = new Date(Math.min(target.getTime() + windowMs, Date.UTC(Number(plan.year) + 1, 0, 1) - 86400000)).toISOString().slice(0, 10);
  const reports = await MedicalReport.find({ user: plan.patientId, audit_status: 'audited', archiveOnly: { $ne: true },
    documentCategory: { $nin: NON_EXAM_CATEGORIES },
    checkDate: { $gte: from, $lte: through } })
    .select('_id title checkDate audit_status archiveOnly documentCategory reportItems.name reportItems.orderName reportItems.screeningKey reportItems.screeningKeys reportItems.classificationSource reportItems.classificationReviewedAt reportItems.matchConfidence reportItems.value reportItems.findings reportItems.diagnosis reportItems.conclusion').lean();
  const ids = (plan.items || []).map(item => item.itemId).filter(Boolean);
  const [orders, exams, functional, categoryRows] = await Promise.all([
    LabTestOrder.find({ _id: { $in: ids } }).select('_id categoryId').lean(),
    SpecialExam.find({ _id: { $in: ids } }).select('_id categoryId').lean(),
    FunctionalMedicineTest.find({ _id: { $in: ids } }).select('_id categoryId').lean(),
    ProjectCategory.find({ status: 'active' }).select('_id name parent status').lean(),
  ]);
  const keys = categoryKeys(categoryRows);
  const catalog = new Map([...orders, ...exams, ...functional]
    .filter(row => keys.has(id(row.categoryId))).map(row => [id(row), keys.get(id(row.categoryId))]));
  return { reports, catalog };
}

async function reconcile(plan, models) {
  const { reports, catalog } = await loadEvidence(plan, models);
  const suggestions = suggest(plan, reports, catalog);
  const applied = [];
  for (const entry of suggestions.filter(row => row.reportId)) {
    const original = (plan.items || []).find(item => id(item) === entry.itemId);
    const changed = await models.HealthPlan.updateOne({ _id: plan._id, patientId: plan.patientId,
      status: { $ne: 'cancelled' }, items: { $elemMatch: { _id: entry.itemId, status: original?.status, reportId: null } } },
    { $set: { 'items.$.status': 'completed', 'items.$.reportId': entry.reportId,
      'items.$.completionSource': 'screening_auto',
      ...(original?.status === 'pending' ? { 'items.$.completedAt': new Date() } : {}) } });
    if (changed.modifiedCount) applied.push(entry);
  }
  return { applied, pending: suggestions.filter(row => !applied.some(done => done.itemId === row.itemId)),
    reports: reports.map(report => ({ id: id(report), title: report.title, checkDate: report.checkDate })) };
}

module.exports = { normalize, reportYear, sameCheckupRound, categoryKeys, suggest, loadEvidence, reconcile, NON_EXAM_CATEGORIES };
