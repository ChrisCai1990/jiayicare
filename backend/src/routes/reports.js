const express = require('express');
const auth = require('../middleware/auth');
const MedicalReport = require('../models/MedicalReport');
const HealthRecord = require('../models/HealthRecord');
const { uploadBase64, deleteFile, urlToKey } = require('../utils/oss');
const { parseImage } = require('../utils/ai');
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

// ── AI 解析报告（通义千问视觉模型）────────────────────────────────
router.post('/:id/parse-ai', auth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({ _id: req.params.id, user: req.user._id });
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });

    const hasOssUrl = !!report.fileUrl;
    const hasBase64 = !!report.content;
    const isImage = report.mimeType?.startsWith('image/');

    if (!hasOssUrl && !hasBase64) {
      return res.status(400).json({ success: false, message: '报告无文件内容，无法解析' });
    }

    if (!process.env.QWEN_API_KEY) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: '已进入 AI 解析队列，请等待健管专员审核录入' });
    }

    if (!isImage) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'PDF 解析功能即将开放，当前已加入待审核队列' });
    }

    const prompt = `请分析这份体检报告图片，提取所有检验/检查项目。
以 JSON 格式返回，结构如下：
{
  "institution": "机构名称",
  "checkDate": "YYYY-MM-DD",
  "items": [
    { "name": "项目名称", "value": "检测值", "unit": "单位", "referenceRange": "参考范围", "status": "normal/abnormal/attention/unknown", "itemType": "lab/imaging/data" }
  ],
  "summary": "综合分析（1-2句话，重点关注异常项）"
}
只输出 JSON，不要额外文字。`;

    // 优先用 OSS URL（通义千问可直接读取公开 URL）
    const text = hasOssUrl
      ? await parseImage(report.fileUrl, prompt, { isUrl: true })
      : await parseImage(report.content, prompt, { isUrl: false });

    let parsed = null;
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\n?|\n?```$/g, ''));
    } catch {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'AI 解析结果格式异常，已加入待人工审核队列' });
    }

    await MedicalReport.findByIdAndUpdate(report._id, {
      reportItems: parsed.items || [],
      aiSummary:   parsed.summary || '',
      aiStatus:    'pending',
      institution: parsed.institution || report.institution,
      checkDate:   parsed.checkDate   || report.checkDate,
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

// 创建体检报告记录（若携带 base64 content 则自动上传 OSS）
router.post('/', auth, async (req, res) => {
  try {
    const { title, type, hospital, date, pages, fileSize, keyFindings, note, content, mimeType,
            screeningCategory, reportYear, checkDate, institution, reportItems } = req.body;
    let { fileUrl } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '报告标题不能为空' });

    // 有 base64 内容且 OSS 已配置 → 上传到 OSS，不存 MongoDB
    let ossKey = '';
    let storedContent = '';
    if (content && process.env.OSS_ACCESS_KEY_ID) {
      try {
        const result = await uploadBase64(content, mimeType || 'image/jpeg');
        fileUrl = result.url;
        ossKey = result.key;
      } catch (ossErr) {
        // OSS 上传失败降级：存 base64（限10MB）
        storedContent = content.length < 10 * 1024 * 1024 ? content : '';
      }
    } else if (content) {
      storedContent = content.length < 10 * 1024 * 1024 ? content : '';
    }

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
      ossKey:             ossKey,
      keyFindings:        keyFindings        || [],
      note:               note               || '',
      content:            storedContent,
      mimeType:           mimeType           || '',
      screeningCategory:  screeningCategory  || '',
      reportYear:         year,
      checkDate:          checkDate          || date || '',
      institution:        institution        || hospital || '',
      reportItems:        reportItems        || [],
    });

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
    // 删除 OSS 文件
    if (report.ossKey) await deleteFile(report.ossKey);
    // 级联删除从该报告提取的关联健康记录（如有）
    await HealthRecord.deleteMany({ user: req.user._id, reportId: report._id });
    await report.deleteOne();
    res.json({ success: true, message: '报告已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '删除报告失败', error: err.message });
  }
});

module.exports = router;
