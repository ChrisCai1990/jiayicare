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

    const prompt = `你是一名医疗数据提取助手。请分析这份体检报告图片，严格按以下规则提取数据，禁止对任何检查结果做解读、评估或建议。

══════════════════════════════════════════
【核心规则 — 必须先读】
══════════════════════════════════════════

【规则A：只提取详细报告单，跳过简短总结】
体检报告通常包含两部分：①前面的简短汇总/综合小结；②后面的各科室详细报告单。
→ 只提取详细报告单，前面的简短总结/汇总页完全跳过不提取。
→ 同一项目绝对不能出现两次，每项只提取一次。

【规则B：跳过报告目录/检查部位清单页】
若报告有一页只罗列了"检查部位清单"（如"T双侧颈动脉超声、T甲状腺超声..."），该页直接跳过，不单独提取任何条目。

【规则C：名称必须完整准确】
使用报告单上印刷的完整名称，禁止自行简化或推断。
✓ 正确："双肾输尿管膀胱前列腺彩超"
✗ 错误："双肾彩超"
✓ 正确："颈动脉超声"
✗ 错误："颈部淋巴结彩超"

【规则D：禁止任何解析或解读】
findings 和 diagnosis 字段只放报告原文，绝对禁止写入任何解读、评估、风险提示或建议。
✓ 正确 findings："右肺上叶见一磨玻璃结节，直径约5mm，边缘清晰。"
✗ 错误 findings："结节可能为良性" / "该结节可能为早期肺癌，需重视"

══════════════════════════════════════════
【分类提取规则】
══════════════════════════════════════════

【1. 检验数值项目】
适用范围：血常规、生化（肝功能/肾功能/血脂/血糖等各项）、激素、肿瘤标志物、免疫、尿常规（干化学+尿沉渣各项）、碳13/14尿素呼气试验 等数值型检验。
→ itemType="lab"
→ 每一个检验子项单独一条（如血脂组合：总胆固醇/甘油三酯/LDL-C/HDL-C 各一条）
→ 提取：name / value / unit / referenceRange（必须从报告上提取实际印刷值，禁止使用默认值；无参考范围则留空）/ status（normal/abnormal/attention/unknown）
→ orderName：填写该项所属的检查医嘱组名称（如"肝功能"/"肾功能"/"血脂"/"血常规"等），用于分组展示

【2. 体检科室查体】
适用范围：内科、外科、眼科（含视力检查）、妇科、牙科/口腔科、皮肤科。
→ itemType="imaging"
→ 每个科室作为一条，name=科室名称（如"内科"/"外科"/"眼科视力"）
→ 只填 diagnosis（该科室的总体小结原文），findings 留空
→ 注意：视力检查归入眼科，不单独拆分每只眼的数值

【3. 眼底照相 / 裂隙灯 / 前鼻镜 / 电耳镜】
→ itemType="imaging"，每项单独一条
→ 提取 name（完整项目名）、findings（检查所见完整原文）、diagnosis（诊断意见完整原文）

【4. 心电图】
→ itemType="imaging"，name=心电图完整名称
→ findings=心电图测量结果描述（完整原文）
→ diagnosis=诊断结论（完整原文，如"窦性心律、早复极现象"直接原文，不做分析）

【5. 无创性动脉硬化检测 / PWV / ABI / 动脉弹性检测】
→ itemType="imaging"，name=检测完整名称
→ diagnosis=诊断结论完整原文（含"与健康的XX岁XX性相比在XX范围内"等比较语句务必完整保留）
→ findings 可填测量数值描述

【6. 超声检查】（最复杂，严格遵守以下规则）
适用范围：肝脏、胆囊、胰腺、脾脏、甲状腺、乳腺、颈动脉、心脏（彩超）、双肾输尿管膀胱前列腺、妇科子宫附件等。

→ itemType="imaging"
→ 按【部位】拆分，每个独立脏器/部位单独一条（如腹部超声 → 肝脏/胆囊/胰腺/脾脏各一条）
→ name：使用报告单上的完整名称（如"肝脏彩超"/"胆囊彩超"/"颈动脉超声"/"心脏彩超"/"双肾输尿管膀胱前列腺彩超"）
→ findings：该部位的"超声所见"/"检查所见"原文（只提取本部位相关描述，完整原文，禁止截断）
→ diagnosis：从报告的"超声提示"段落中，提取与本部位对应的描述原文
→ 禁止将"超声提示"整段作为单独一条提取，它应当被拆分对应到各部位的 diagnosis 字段中

心脏彩超特别说明：
→ findings 从 EF值/M型超声/二维超声/多普勒检查 开始，提取完整心脏检查所见原文
→ diagnosis 从超声提示中提取心脏相关描述

【7. CT / MRI / 放射检查 / 骨密度】
→ itemType="imaging"，每个部位单独一条
→ name=完整检查名称（如"胸部低剂量螺旋CT"/"颅脑MRI"/"双能X线骨密度"）
→ bodyPart=检查部位
→ findings=检查所见完整原文（禁止截断）
→ diagnosis=诊断意见/印象完整原文

【8. 内镜检查】（胃镜/肠镜/支气管镜等）
→ itemType="imaging"，name=内镜完整名称
→ findings=镜下所见完整原文
→ diagnosis=诊断/小结完整原文

【9. 跳过不提取的项目】
以下内容直接跳过，不生成任何条目：
- 人体成分检测 / 身体成分测量 / InBody / 体脂分析
- 报告开头的检查项目汇总清单/目录页
- 简短总结页（有详细报告单时）

══════════════════════════════════════════
【输出格式】
══════════════════════════════════════════

以 JSON 格式返回，只输出 JSON，不要额外文字：
{
  "institution": "体检机构名称",
  "checkDate": "YYYY-MM-DD",
  "items": [
    {
      "name": "项目名称（完整准确）",
      "value": "检测值（仅lab类填写）",
      "unit": "单位（仅lab类填写）",
      "referenceRange": "从报告提取的参考范围（非默认值，无则留空）",
      "status": "normal/abnormal/attention/unknown",
      "itemType": "lab或imaging",
      "orderName": "所属检查医嘱组（lab类填写，如肝功能/血常规/血脂）",
      "bodyPart": "检查部位（imaging类可选）",
      "findings": "检查所见/超声所见原文（imaging类，完整原文禁止截断，禁止加入任何解读）",
      "diagnosis": "诊断意见/超声提示对应原文（imaging类，完整原文禁止截断，禁止加入任何解读）"
    }
  ]
}`;

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
