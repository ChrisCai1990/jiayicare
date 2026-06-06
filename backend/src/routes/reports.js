const express = require('express');
const auth = require('../middleware/auth');
const MedicalReport = require('../models/MedicalReport');
const HealthRecord = require('../models/HealthRecord');
const router = express.Router();

// 类目中文映射
const CATEGORY_LABEL = {
  tumor:          '常见肿瘤筛查',
  cardiovascular: '心血管筛查',
  brain_vessel:   '脑血管病筛查',
  chronic:        '慢性病筛查',
  other_routine:  '其他常规筛查',
  health_promote: '健康促进筛查',
};
const ALL_CATEGORIES = Object.keys(CATEGORY_LABEL);

// ── 按年份/类目分组获取报告（需求23）──────────────────────────────
router.get('/by-category', auth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({ user: req.user._id })
      .select('-content')
      .sort({ reportYear: -1, checkDate: -1, createdAt: -1 });

    // 按年份分组
    const yearMap = {};
    reports.forEach(r => {
      const year = r.reportYear || (r.date ? new Date(r.date).getFullYear() : new Date(r.createdAt).getFullYear());
      if (!yearMap[year]) yearMap[year] = {};
      const cat = r.screeningCategory || 'other_routine';
      if (!yearMap[year][cat]) yearMap[year][cat] = [];
      yearMap[year][cat].push(r);
    });

    // 转成数组，年份倒序
    const result = Object.keys(yearMap).sort((a, b) => b - a).map(year => ({
      year: Number(year),
      categories: ALL_CATEGORIES
        .filter(cat => yearMap[year][cat]?.length > 0)
        .map(cat => ({
          key: cat,
          label: CATEGORY_LABEL[cat],
          reports: yearMap[year][cat],
        })),
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── AI 解析报告（需求23）───────────────────────────────────────────
router.post('/:id/parse-ai', auth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({ _id: req.params.id, user: req.user._id });
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    if (!report.content) return res.status(400).json({ success: false, message: '报告无图片内容，无法解析' });
    if (!process.env.ANTHROPIC_API_KEY) {
      // 无 API KEY 时，返回待录入状态
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: '已进入 AI 解析队列，请等待健管专员审核录入' });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const isImage = report.mimeType?.startsWith('image/');
    if (!isImage) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'PDF 解析功能即将开放，当前已加入待审核队列' });
    }

    const mediaType = report.mimeType || 'image/jpeg';
    const base64Data = report.content.replace(/^data:[^;]+;base64,/, '');

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: `请分析这份体检报告图片，提取所有检验/检查项目。
以 JSON 格式返回，结构如下：
{
  "institution": "机构名称",
  "checkDate": "YYYY-MM-DD",
  "items": [
    { "name": "项目名称", "value": "检测值", "unit": "单位", "referenceRange": "参考范围", "status": "normal/abnormal/attention/unknown", "itemType": "lab/imaging/data" }
  ],
  "summary": "综合分析（1-2句话，重点关注异常项）"
}
只输出 JSON，不要额外文字。`,
          },
        ],
      }],
    });

    let parsed = null;
    try {
      const text = message.content[0].text.trim();
      parsed = JSON.parse(text.replace(/^```json\n?|\n?```$/g, ''));
    } catch {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'AI 解析结果格式异常，已加入待人工审核队列' });
    }

    await MedicalReport.findByIdAndUpdate(report._id, {
      reportItems:  parsed.items || [],
      aiSummary:    parsed.summary || '',
      aiStatus:     'pending',  // 待健管专员审核
      institution:  parsed.institution || report.institution,
      checkDate:    parsed.checkDate   || report.checkDate,
    });

    res.json({ success: true, message: 'AI 解析完成，已提交健管专员审核', items: parsed.items?.length || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: 'AI 解析失败：' + err.message });
  }
});

// ── 获取用户体检报告列表（列表不返回 content，避免传输过大）
router.get('/', auth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({ user: req.user._id })
      .select('-content')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取报告列表失败', error: err.message });
  }
});

// 获取单个报告（含 content，用于预览）
router.get('/:id', auth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({ _id: req.params.id, user: req.user._id });
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取报告失败', error: err.message });
  }
});

// 创建体检报告记录
router.post('/', auth, async (req, res) => {
  try {
    const { title, type, hospital, date, pages, fileSize, fileUrl, keyFindings, note, content, mimeType,
            screeningCategory, reportYear, checkDate, institution, reportItems } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '报告标题不能为空' });

    // content 存储小于 10MB 的 base64（对应约 7.5MB 原始文件），超出则忽略
    const safeContent = content && content.length < 10 * 1024 * 1024 ? content : '';
    const year = reportYear || (date ? new Date(date).getFullYear() : new Date().getFullYear());

    const report = await MedicalReport.create({
      user: req.user._id,
      title,
      type:               type               || 'annual',
      hospital:           hospital           || '',
      date:               date               || new Date().toISOString().slice(0, 10),
      pages:              pages              || 1,
      fileSize:           fileSize           || '',
      fileUrl:            fileUrl            || '',
      keyFindings:        keyFindings        || [],
      note:               note               || '',
      content:            safeContent,
      mimeType:           mimeType           || '',
      screeningCategory:  screeningCategory  || '',
      reportYear:         year,
      checkDate:          checkDate          || date || '',
      institution:        institution        || hospital || '',
      reportItems:        reportItems        || [],
    });

    // 返回时不包含 content（减少响应体积）
    const { content: _, ...reportObj } = report.toObject();
    res.status(201).json({ success: true, data: reportObj });
  } catch (err) {
    res.status(500).json({ success: false, message: '上传报告失败', error: err.message });
  }
});

// 删除体检报告（已审核报告不允许删除）
router.delete('/:id', auth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({ _id: req.params.id, user: req.user._id });
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    if (report.audit_status === 'audited') {
      return res.status(403).json({ success: false, message: '已审核报告不可删除，如需处理请联系健康管理师' });
    }
    // 级联删除从该报告提取的关联健康记录（如有）
    await HealthRecord.deleteMany({ user: req.user._id, reportId: report._id });
    await report.deleteOne();
    res.json({ success: true, message: '报告已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '删除报告失败', error: err.message });
  }
});

module.exports = router;
