const express = require('express');
const auth = require('../middleware/auth');
const MedicalReport = require('../models/MedicalReport');
const router = express.Router();

// 获取用户体检报告列表（列表不返回 content，避免传输过大）
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
    const { title, type, hospital, date, pages, fileSize, fileUrl, keyFindings, note, content, mimeType } = req.body;
    if (!title) return res.status(400).json({ success: false, message: '报告标题不能为空' });

    // content 只存储小于 3MB 的文件（base64 后约 4MB），超出则忽略
    const safeContent = content && content.length < 4 * 1024 * 1024 ? content : '';

    const report = await MedicalReport.create({
      user: req.user._id,
      title,
      type:        type        || 'annual',
      hospital:    hospital    || '',
      date:        date        || new Date().toISOString().slice(0, 10),
      pages:       pages       || 1,
      fileSize:    fileSize    || '',
      fileUrl:     fileUrl     || '',
      keyFindings: keyFindings || [],
      note:        note        || '',
      content:     safeContent,
      mimeType:    mimeType    || '',
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
    await report.deleteOne();
    res.json({ success: true, message: '报告已删除' });
  } catch (err) {
    res.status(500).json({ success: false, message: '删除报告失败', error: err.message });
  }
});

module.exports = router;
