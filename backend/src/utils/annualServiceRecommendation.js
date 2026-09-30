const FIELDS = { finding: 300, evidence: 500, recommendation: 300, timeframe: 120, nextStep: 300 };

function normalizeRecommendationInput(body = {}) {
  const result = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    if (body[key] != null && typeof body[key] !== 'string') throw Object.assign(new Error(`${key}必须为文字`), { statusCode: 400 });
    result[key] = String(body[key] || '').trim();
    if (result[key].length > max) throw Object.assign(new Error(`${key}不能超过${max}字`), { statusCode: 400 });
  }
  if (!result.finding || !result.evidence || !result.recommendation) {
    throw Object.assign(new Error('请填写发现的问题、客观依据和服务建议'), { statusCode: 400 });
  }
  for (const key of ['plannedFollowUpDate','appointmentDate']) {
    const value=body[key] == null ? '' : body[key];
    if (typeof value!=='string' || (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value))) {
      throw Object.assign(new Error(`${key==='plannedFollowUpDate'?'计划跟进日期':'预约服务日期'}无效，请重新选择`),{statusCode:400});
    }
    result[key]=value;
  }
  if (body.followUpReminderEnabled != null && typeof body.followUpReminderEnabled !== 'boolean') throw Object.assign(new Error('跟进提醒设置无效'), { statusCode: 400 });
  result.followUpReminderEnabled = body.followUpReminderEnabled === true && Boolean(result.plannedFollowUpDate);
  return result;
}

function dentalDrafts(reports, year, existing = []) {
  if (existing.some(row => /牙结石/.test(row.finding || '') && /洁牙|洗牙/.test(row.recommendation || ''))) return [];
  const evidence = [];
  for (const report of reports) {
    if (report.audit_status !== 'audited' || Number(report.reportYear || String(report.checkDate || '').slice(0, 4)) !== Number(year)) continue;
    for (const source of require('./reportIssues').issueSources(report)) {
      const quote = source.evidence.split(/[。；;\n]/).find(line => /牙结石/.test(line) && !/无.{0,6}牙结石|未见.{0,6}牙结石|未发现.{0,6}牙结石|牙结石.{0,4}(?:未见|阴性)|疑似|可能|已清除|已去除|已洁牙|既往|病史/.test(line));
      if (quote) evidence.push(`${report.title || '体检报告'}${report.checkDate ? `（${report.checkDate}）` : ''} · ${source.name}：${quote.trim()}`);
    }
  }
  if (!evidence.length) return [];
  return [{ finding: '体检发现牙结石', evidence: [...new Set(evidence)].join('；').slice(0, 500), recommendation: '洁牙服务', timeframe: '与客户商定', nextStep: '具体洁牙方式由接诊口腔医生确定。', selectedOptions: [] }];
}

function dentalProductQuery(tenantId) {
  return { tenantId, status: 'on', $or: ['name', 'subtitle', 'features', 'description', 'serviceItems.name', 'aiProfile.includedItems'].map(field => ({ [field]: /洁牙|洗牙/ })) };
}
function dentalProductDetail(row) {
  const included = [...(row.aiProfile?.includedItems || []), ...(row.serviceItems || []).map(item => item.name), ...(row.features || []), ...(row.description || '').split(/[\n；;]/)];
  return [...new Set(included.filter(line => typeof line === 'string' && /洁牙|洗牙/.test(line) && !/不含|不包含|不提供|不适用|不包括|除外|另收费/.test(line)).map(line => line.trim()))].slice(0, 4).join('；');
}
async function serviceCatalog(plan) {
  const patient = await require('../models/User').findById(plan.patientId).select('tenantId').lean();
  if (!patient) throw Object.assign(new Error('客户不存在'), { statusCode: 404 });
  const tenantId = patient.tenantId || null;
  const [institutions, products] = await Promise.all([
    require('../models/MedicalInstitution').find({ tenantId, status: 'active', $or: [{ name: /口腔|牙科/ }, { aliases: /口腔|牙科/ }] }).select('name address region').sort({ name: 1 }).lean(),
    require('../models/Product').find(dentalProductQuery(tenantId)).select('name subtitle features description serviceItems aiProfile.includedItems serviceLocation originalPrice').sort({ sortOrder: 1 }).lean(),
  ]);
  return [...institutions.map(row => ({ type: 'institution', id: String(row._id), name: row.name, address: row.address || row.region || '' })),
    ...products.filter(row => /洁牙|洗牙/.test(row.name) || dentalProductDetail(row)).map(row => ({ type: 'product', id: String(row._id), name: row.name, address: row.serviceLocation || '', price: row.originalPrice, includedService: dentalProductDetail(row) }))];
}
function selectCatalogOptions(input = [], catalog = []) {
  if (!Array.isArray(input) || input.length > 10) throw Object.assign(new Error('最多选择10个机构或套餐'), { statusCode: 400 });
  const used = new Set();
  return input.map(ref => {
    const key = `${ref?.type}:${ref?.id}`;
    const match = catalog.find(item => item.type === ref?.type && item.id === String(ref?.id));
    if (!match || used.has(key)) throw Object.assign(new Error('所选机构或套餐已不可用，请重新选择'), { statusCode: 409 });
    used.add(key); return { ...match };
  });
}
async function recommendationOptions(plan, refs) { return selectCatalogOptions(refs, await serviceCatalog(plan)); }
function customerRecommendation(row) {
  const choices = (row.selectedOptions || []).map(item => `${item.type === 'institution' ? '可选机构' : '可选套餐'}：${item.name}${item.address ? `（${item.address}）` : ''}${item.includedService ? `；包含：${item.includedService}` : ''}${typeof item.price === 'number' ? `；目录标价¥${item.price}，实际价格以确认时为准` : ''}`);
  const {plannedFollowUpDate,followUpReminderEnabled,...publicRow}=row;
  return { ...publicRow, timeframe:[row.timeframe,row.appointmentDate?`预约服务日期：${row.appointmentDate}`:''].filter(Boolean).join('；'), nextStep: [row.nextStep, ...choices].filter(Boolean).join('\n') };
}
module.exports = { dentalProductQuery, dentalProductDetail, normalizeRecommendationInput, dentalDrafts, serviceCatalog, selectCatalogOptions, recommendationOptions, customerRecommendation };
