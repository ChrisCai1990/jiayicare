const express = require('express');
const Order = require('../models/Order');
const HealthRecord = require('../models/HealthRecord');
const MedicalReport = require('../models/MedicalReport');
const PsychAssessment = require('../models/PsychAssessment');
const { SCALES, calcSeverity } = require('../config/psychScales');

const router = express.Router();

const IBD_NAME = /IBD|炎症性肠病|克罗恩病|溃疡性结肠炎|未定型结肠炎/i;
const FC_NAME = /粪(?:便)?钙卫蛋白|fecal\s+calprotectin|^FCP?$/i;
const DIARY_FIELDS = {
  bowelCount: [0, 50], looseCount: [0, 50], blood: [0, 3], pain: [0, 10],
  urgency: [0, 10], fatigue: [0, 10], temperature: [30, 45], weight: [1, 500],
};

function dateAtNoon(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime()) || date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) !== value) return null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  if (value > today) return null;
  return date;
}

function numberField(value, name, range, required = false, integer = false) {
  if (value === '' || value === undefined || value === null) {
    if (required) throw new Error(`请填写${name}`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${name}格式不正确`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < range[0] || n > range[1]) throw new Error(`${name}不在可记录范围内`);
  if (integer && !Number.isInteger(n)) throw new Error(`${name}请填写整数`);
  return n;
}

async function accessFor(userId) {
  const orders = await Order.find({ user: userId, paymentStatus: 'paid', status: { $ne: 'cancelled' }, tradeStatus: { $nin: ['closed', 'refunded'] } })
    .select('serviceName status tradeStatus').sort({ createdAt: -1 }).lean();
  const matching = orders.filter(order => IBD_NAME.test(order.serviceName || ''));
  return { enabled: matching.length > 0, canRecord: matching.some(order => order.status !== 'completed') };
}

function fcFromReport(report) {
  if (!report.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(report.checkDate || '')) return [];
  return (report.reportItems || []).filter(item => FC_NAME.test(item.name || '')).map(item => {
    const unit = String(item.unit || '').replace(/\s/g, '').toLowerCase();
    if (!/^(?:[μµu]g\/g|mg\/kg)$/.test(unit)) return null;
    const raw = String(item.value || '').trim().replace(/,/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return { id: `${report._id}:${item.itemId || item.name}`, date: report.checkDate, value, unit: 'μg/g', source: '已审核报告', verified: true, institution: report.institution || '', reportId: String(report._id) };
  }).filter(Boolean);
}

router.get('/status', async (req, res) => {
  try { res.json({ success: true, data: await accessFor(req.user._id) }); }
  catch (error) { res.status(500).json({ success: false, message: '获取 IBD 服务状态失败' }); }
});

router.get('/overview', async (req, res) => {
  try {
    const access = await accessFor(req.user._id);
    if (!access.enabled) return res.json({ success: true, data: { ...access, diary: [], fc: [], scales: [] } });
    const days = Math.min(Math.max(Number(req.query.days) || 365, 30), 365);
    const since = new Date(Date.now() - days * 86400000);
    const [diaryRows, fcRows, scaleRows, reports] = await Promise.all([
      HealthRecord.find({ user: req.user._id, type: 'ibd_diary', recordedAt: { $gte: since } }).sort({ recordedAt: 1 }).lean(),
      HealthRecord.find({ user: req.user._id, type: 'ibd_fc', recordedAt: { $gte: since } }).sort({ recordedAt: 1 }).lean(),
      PsychAssessment.find({ patientId: req.user._id, scaleType: { $in: ['phq9', 'gad7'] }, filledAt: { $gte: since } }).sort({ filledAt: 1 }).lean(),
      MedicalReport.find({ user: req.user._id, reviewedAt: { $ne: null }, checkDate: { $gte: since.toISOString().slice(0, 10) } }).select('checkDate institution reviewedAt reportItems.name reportItems.value reportItems.unit reportItems.itemId').lean(),
    ]);
    const diary = diaryRows.map(row => ({ id: String(row._id), date: row.extra?.date || row.recordedAt.toISOString().slice(0, 10), ...(row.extra || {}) }));
    const fc = [...fcRows.map(row => ({ id: String(row._id), date: row.extra?.date || row.recordedAt.toISOString().slice(0, 10), value: Number(row.value), unit: 'μg/g', source: '客户录入', verified: false, institution: row.extra?.institution || '' })), ...reports.flatMap(fcFromReport)]
      .filter(row => Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date));
    const scales = scaleRows.map(row => ({ id: String(row._id), date: row.filledAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }), type: row.scaleType, score: row.totalScore, severity: row.severity }));
    res.json({ success: true, data: { ...access, diary, fc, scales } });
  } catch (error) { res.status(500).json({ success: false, message: '获取 IBD 记录失败' }); }
});

router.get('/scales', async (req, res) => {
  const access = await accessFor(req.user._id);
  if (!access.enabled) return res.status(403).json({ success: false, message: 'IBD 服务尚未开通' });
  res.json({ success: true, data: Object.values(SCALES) });
});

router.post('/diary', async (req, res) => {
  try {
    if (!(await accessFor(req.user._id)).canRecord) return res.status(403).json({ success: false, message: 'IBD 服务尚未处于管理期' });
    const date = dateAtNoon(req.body.date);
    if (!date) return res.status(400).json({ success: false, message: '请选择有效的记录日期' });
    const extra = { date: req.body.date, nightBowel: req.body.nightBowel === true };
    for (const [field, range] of Object.entries(DIARY_FIELDS)) extra[field] = numberField(req.body[field], field, range, ['bowelCount', 'looseCount', 'blood', 'pain'].includes(field), !['temperature', 'weight'].includes(field));
    if (extra.looseCount > extra.bowelCount) return res.status(400).json({ success: false, message: '稀便次数不能大于总便次' });
    extra.medication = ['on_time', 'missed', 'changed', 'not_recorded'].includes(req.body.medication) ? req.body.medication : 'not_recorded';
    const note = String(req.body.note || '').trim().slice(0, 1000);
    const filter = { user: req.user._id, type: 'ibd_diary', recordedAt: date };
    const record = await HealthRecord.findOneAndUpdate(filter, { $set: { category: 'lifestyle', label: 'IBD 症状日记', value: String(extra.bowelCount), unit: '次', extra, note, recordedBy: { source: 'customer' } }, $setOnInsert: { user: req.user._id, type: 'ibd_diary', recordedAt: date } }, { upsert: true, new: true, runValidators: true });
    res.json({ success: true, data: { id: String(record._id), ...extra } });
  } catch (error) { res.status(400).json({ success: false, message: error.message || '保存失败' }); }
});

router.post('/fc', async (req, res) => {
  try {
    if (!(await accessFor(req.user._id)).canRecord) return res.status(403).json({ success: false, message: 'IBD 服务尚未处于管理期' });
    const date = dateAtNoon(req.body.date);
    if (!date) return res.status(400).json({ success: false, message: '请选择有效的采样日期' });
    const value = numberField(req.body.value, 'FC 数值', [0, 1000000], true);
    const institution = String(req.body.institution || '').trim().slice(0, 120);
    const record = await HealthRecord.create({ user: req.user._id, category: 'vitals', type: 'ibd_fc', label: '粪便钙卫蛋白', value: String(value), unit: 'μg/g', extra: { date: req.body.date, institution, source: 'customer' }, recordedAt: date, recordedBy: { source: 'customer' } });
    res.status(201).json({ success: true, data: { id: String(record._id), date: req.body.date, value, unit: 'μg/g', verified: false } });
  } catch (error) { res.status(400).json({ success: false, message: error.message || '保存失败' }); }
});

router.delete('/fc/:id', async (req, res) => {
  const mongoose = require('mongoose');
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '无效的记录编号' });
  const record = await HealthRecord.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id, type: 'ibd_fc', 'recordedBy.source': 'customer' },
    { $set: { deletedAt: new Date(), deleteReason: '客户撤回自录 FC 结果' } }, { new: true }
  );
  if (!record) return res.status(404).json({ success: false, message: '自录 FC 记录不存在' });
  res.json({ success: true });
});

router.post('/scales/:type', async (req, res) => {
  try {
    if (!(await accessFor(req.user._id)).canRecord) return res.status(403).json({ success: false, message: 'IBD 服务尚未处于管理期' });
    const scale = SCALES[req.params.type];
    const scores = req.body.answers;
    if (!scale || !Array.isArray(scores) || scores.length !== scale.questions.length || scores.some(score => !Number.isInteger(score) || score < 0 || score > 3)) return res.status(400).json({ success: false, message: '请完成量表全部题目' });
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const result = await PsychAssessment.create({ patientId: req.user._id, scaleType: scale.type, answers: scale.questions.map((question, index) => ({ question, score: scores[index] })), totalScore, severity: calcSeverity(scale.type, totalScore), filledAt: new Date() });
    const safetyConcern = scale.type === 'phq9' && scores[8] > 0;
    let safetyHandoffRecorded = false;
    if (safetyConcern) {
      try {
        await HealthRecord.create({ user: req.user._id, category: 'lifestyle', type: 'symptom', label: '心理安全关注', value: 'PHQ-9 第9题有非零回答', note: '客户量表中报告自伤相关念头，请健管专员尽快核实并反馈健康顾问。', extra: { psychAssessmentId: String(result._id) }, symptomWorkflow: { status: 'pending_manager' }, recordedBy: { source: 'system' } });
        safetyHandoffRecorded = true;
      } catch (error) { console.error('[ibd] psych safety handoff failed', result._id, error); }
    }
    res.status(201).json({ success: true, data: { id: String(result._id), type: scale.type, score: totalScore, severity: result.severity, safetyConcern, safetyHandoffRecorded } });
  } catch (error) { res.status(400).json({ success: false, message: error.message || '提交量表失败' }); }
});

module.exports = router;
