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

    // PDF 必须有 OSS URL 才能发给通义千问；无 OSS URL 则走人工审核
    if (!isImage && !hasOssUrl) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'PDF 需上传至 OSS 后才能 AI 解析，当前已加入待人工审核队列' });
    }

    const prompt = `你是一名医疗数据提取助手。请分析这份体检报告，严格按以下规则提取数据，禁止对任何检查结果做解读、评估或建议。

══════════════════════════════════════════
【最高优先级规则 — 防止幻觉，必须先读】
══════════════════════════════════════════

【规则零：只提取图片中真实存在的内容，绝对禁止推断和补全】
→ 图片中没有出现的检查项目，一律不得生成。
→ 你只能提取报告图片上实际印刷的文字和数字，禁止根据"通常会做"或"同类报告一般包含"来推断添加。
→ 特别禁止：
  ✗ 报告中没有"粪便隐血"但你凭空生成了一条
  ✗ 报告中只有"总胆固醇"的数值，但你把它填入了"LDL-C"/"脂蛋白a"字段
  ✗ 报告中有"空腹胰岛素"，但你补全了"30分钟胰岛素"/"1小时胰岛素C肽"等不存在的时间点
  ✗ 报告中有"心电图"，但你同时生成了"动态心电图"（两者是完全不同的检查）
  ✗ 报告中有"脂蛋白a"，但你把它填入了"脂蛋白磷脂酶A2"字段（完全不同的指标）
→ 对于每一条提取结果，你必须能在报告图片中找到对应的原文。找不到原文 = 不提取。

【规则A：绝对禁止提取患者基本信息字段及行政字段】
以下字段是患者个人信息或行政信息，一律跳过，不生成任何条目：
→ 姓名、性别、年龄、出生日期、身份证号、手机号/电话、单位/工作单位、体检日期、体检编号/报告编号、科别/部门
→ 病历号、床号、申请科室、送检科室、送检医生、检验者、审核者、报告者、操作者、检查医生姓名
→ 这些字段可能出现在报告表头、化验单抬头、影像报告落款处，必须完全忽略，不得作为 name 或 conclusion 提取。

【规则B：必须跳过的页面类型 — 这是最高优先级，违反即为严重错误】
以下类型的页面，一条数据都不能提取，完全跳过：
① 报告封面页
   → 包含机构Logo/名称/报告标题/"体检报告"/"健康体检报告"等封面信息，整页跳过
② 前言 / 致受检者信 / 医院简介页
   → 通常以"尊敬的XX先生/女士，您好"或"感谢您选择"开头，或介绍医院、科室的文字页，整页跳过
③ "异常结果汇总" / "异常结果及建议" / "体检结果汇总" / "综合小结" / "主要阳性结果" 页及其之前的所有汇总类页面
   → 这类页面标题通常含"汇总"/"小结"/"总结"/"阳性"/"异常"/"建议"，内容是对各科室结果的文字摘要和建议
   → 即使其中提到了具体数值（如"BMI 25.61"），也不能从这里提取，因为详细报告单里有原始数据
   → 特别注意：单独的"建议"页（如"健康建议"/"医生建议"/"复查建议"）也完全跳过
   → 【关键规则】：遇到"异常结果及建议"页后，该页及其之前出现的所有汇总/摘要页全部跳过；
     只提取各科室原始详细报告单（即有具体检查数据的页面）
④ 报告目录 / 检查部位清单页（只罗列项目名称，无具体结果）
⑤ 患者基本信息栏（姓名/年龄/性别/电话/单位/体检日期等表头行）

→ 判断依据：以下任意一条成立即整页跳过：
  - 页面是封面（有机构名+体检报告标题，无具体检查数据）
  - 页面以"尊敬的"/"感谢您"开头（前言/致受检者信）
  - 页面标题含"汇总"/"小结"/"总结"/"阳性结果"/"异常结果"/"建议"
  - 页面内容是对其他报告单结果的再次列举/摘要，而非原始检查数据
→ 同一项目只提取一次，详细报告单中的数据优先。
→ 提取顺序从身高/体重/血压/脉搏等一般检查开始，向后逐页提取原始报告单。

【规则D：name 字段必须干净，不包含任何符号前缀】
→ name 只填检查项目的名称文字，不包含报告中的任何标点符号、括号、序号前缀
✗ 错误："【内科】"/"内科】"/"1、内科"/"(内科)"
✓ 正确："内科"
→ 报告中的【】《》①②等符号全部去掉，只保留名称本身

【规则E：名称必须完整准确，不得混淆相似名称】
使用报告单上印刷的完整名称，禁止自行简化、推断或用相似名称替换。
✓ 正确："双肾输尿管膀胱前列腺彩超"
✗ 错误："双肾彩超"
✓ 正确："颈动脉超声"
✗ 错误："颈部淋巴结彩超"
→ 易混淆名称对（必须严格区分，不可互换）：
  - "碳13呼气试验" ≠ "碳14呼气试验"（报告上写哪个就用哪个，不得改名）
  - "常规心电图" ≠ "动态心电图"（动态心电图=Holter=24小时佩戴，普通心电图不是）
  - "脂蛋白a" / "Lp(a)" ≠ "脂蛋白磷脂酶A2" / "Lp-PLA2"（完全不同的两个指标）
  - "空腹胰岛素" ≠ "30分钟胰岛素C肽" / "1小时胰岛素C肽"（后者只在OGTT+胰岛素释放试验时才有）
  - "前列腺特异性抗原(总PSA)" ≠ "游离PSA"（分别为独立检测项目，按报告实际提取）

【规则F：检验数值必须与项目严格对应，禁止串值】
→ 每个检验子项的 value 只能填该项自己的数值，严禁把A项的数值填入B项。
→ 例：总胆固醇=5.2, 甘油三酯=1.8, LDL-C=3.1, HDL-C=1.4，必须各填各自数值，不得混填。
→ 若某项目在报告上有名称但数值模糊看不清，value 填空字符串，不要猜测。

【规则G：禁止任何解析或解读】
findings、diagnosis、conclusion 字段只放报告原文，绝对禁止写入任何解读、评估、风险提示或建议。
✓ 正确 findings："右肺上叶见一磨玻璃结节，直径约5mm，边缘清晰。"
✗ 错误 findings："结节可能为良性" / "该结节可能为早期肺癌，需重视"

══════════════════════════════════════════
【分类提取规则】
══════════════════════════════════════════

【1. 一般检查（身高/体重/BMI/脉搏）】
→ itemType="data"
→ 每个测量项目单独一条：身高、体重、BMI（体质指数）、脉搏 各一条
→ 提取：name（报告原文名称）/ value（测量值）/ unit（单位）/ referenceRange（参考范围，无则留空）/ status
→ conclusion = 该项目所在一般检查的小结/医生意见原文（每项都填同一段小结，作为主要结论展示）

【2. 血压】
→ itemType="data"，name="血压"
→ value = 收缩压/舒张压（如"120/80"）/ unit="mmHg"/ referenceRange 从报告提取
→ findings = 血压测量的描述（如有）
→ diagnosis = 血压检查的小结原文
→ conclusion = 同 diagnosis 原文

【3. 内科/外科/耳鼻喉/听力/视力检查/眼压检查/眼科检查/裂隙灯检查/双眼眼底照相 及其他一般体格检查项目】
→ 【重要】这类项目是体格检查，不是检验项目。itemType="imaging"，每项单独一条，不得拆成多条检验子项。
→ name = 科室或检查名称，与报告原文完全一致（如"内科"/"外科"/"耳鼻喉"/"听力"/"视力检查"/"眼压检查"/"眼科检查"/"裂隙灯检查"/"双眼眼底照相"）
→ findings = 该项下所有子项检查结果的完整逐行原文，包括正常项目，不得省略、压缩、摘要：
  ✓ 正确示例（内科）："发育：正常；营养：良好；神志：清晰；皮肤：未见明显异常；家族史：不详；个人史：不详；淋巴结：未触及肿大；心率：76次/分；心律：整齐；心音：正常；肺部：呼吸音清晰，未闻及干湿性啰音；腹部：腹软，未扪及包块，肝脾肋下未触及；脊柱：正常；四肢：正常"
  ✓ 正确示例（外科）："皮肤：未见明显异常；乳房：（女）外形正常，未触及包块；甲状腺：未触及肿大；脊柱：活动正常；四肢关节：活动正常；肛门直肠：未见异常；前列腺：（男）大小正常"
  ✓ 正确示例（视力检查）："左裸眼视力：4.7；右裸眼视力：4.8；左矫正视力：/；右矫正视力：/"
  ✓ 正确示例（听力）："左耳：正常；右耳：正常"
  ✗ 禁止：只写"未见异常" / 只写有异常的项目 / 合并压缩成一句话
  ✗ 禁止：把内科/外科下的子项（如"心率：76次/分"）拆成独立的 lab 条目
→ diagnosis = 该项医生小结/诊断意见原文（完整原文，无则留空字符串）
→ conclusion = 同 diagnosis 原文（禁止填写检查者/检查医生姓名，留空）

【5. 所有血液/体液数值型检验项目】
适用范围：凡是有检测数值的化验项目，无论叫什么名称，一律按此规则提取。包括但不限于：肝功能、肾功能、血常规、血糖、血脂、甲状腺功能、肿瘤标志物、电解质、凝血功能、性激素、维生素D、同型半胱氨酸、免疫球蛋白、尿微量白蛋白、胱抑素C、炎症指标、微量元素等所有数值型检验项目。
→ itemType="lab"
→ 【核心规则】每一个检验子项单独一条，不得合并。一张化验单有10个子项就提取10条。
→ 提取字段：name（报告原文名称）/ value（数值）/ unit（单位）/ referenceRange（报告上印刷的参考范围，无则留空，禁止填默认值）/ status（normal/abnormal/attention/unknown）
→ conclusion 字段留空字符串，不填检查者/检验者/审核者姓名，不填任何人名。
→ 【orderName 必填，填写该子项所属的检验单大标题】：

  肝功能类：丙氨酸氨基转移酶(ALT)/天门冬氨酸氨基转移酶(AST)/碱性磷酸酶(ALP)/γ-谷氨酰转肽酶(GGT)/总蛋白/白蛋白/球蛋白/前白蛋白/总胆红素/直接胆红素/间接胆红素/乳酸脱氢酶(LDH)/总胆汁酸 → "肝功能"

  肾功能类：肌酐/血肌酐/尿素/尿素氮(BUN)/尿酸/肾小球滤过率/eGFR/胱抑素C（报告标题无论写"肾功能"/"肾功能四项"/"肾功能+尿酸"等任何变体，一律 orderName="肾功能"）→ "肾功能"

  尿微量白蛋白类：尿微量白蛋白/尿肌酐/白蛋白肌酐比值(ACR) → "尿微量白蛋白"

  血脂类：总胆固醇/甘油三酯/LDL-C/HDL-C/载脂蛋白A1/载脂蛋白B/脂蛋白a/非高密度脂蛋白胆固醇 → "血脂"

  血糖类：葡萄糖/空腹血糖 → "血糖"；糖化血红蛋白(HbA1c) → 与葡萄糖同单时填"血糖"，单独检测时填"糖化血红蛋白"

  甲状腺功能类：TSH/FT3/FT4/T3/T4/TPOAb/TgAb/TRAb → "甲状腺功能"

  血常规类：白细胞/红细胞/血红蛋白/血小板/中性粒细胞/淋巴细胞/单核细胞/嗜酸性粒细胞/血细胞比容/平均红细胞体积等全血细胞计数项目 → "血常规"

  肿瘤标志物类：AFP/CEA/CA19-9/CA125/CA724/SCC/NSE/CYFRA21-1/ProGRP/TSGF/HCG/铁蛋白 → "肿瘤标志物"

  电解质类：血钾/血钠/血氯/血钙/血磷/血镁 → "电解质"

  凝血功能类：凝血酶原时间(PT)/活化部分凝血活酶时间(APTT)/国际标准化比值(INR)/纤维蛋白原/凝血酶时间/D-二聚体 → "凝血功能"

  性激素类：FSH/LH/雌二醇(E2)/孕酮/睾酮/催乳素(PRL)/DHEA-S → "性激素"

  维生素类：25-羟基维生素D/维生素B12/叶酸 → "维生素"（单独检测时按报告标题填）

  炎症/免疫类：超敏C反应蛋白(hsCRP)/C反应蛋白(CRP)/红细胞沉降率(ESR)/降钙素原(PCT)/免疫球蛋白IgG/IgM/IgA/类风湿因子(RF)/抗核抗体(ANA)/补体C3/C4 → 按报告标题填（如"免疫全套"/"炎症指标"/"风湿指标"等）

  其他：同型半胱氨酸(Hcy)/脂蛋白磷脂酶A2(Lp-PLA2)/空腹胰岛素/C肽/OGTT各时间点/胃蛋白酶原/胃泌素17/EB病毒抗体/乙肝五项/丙肝抗体/HIV/梅毒等 → 按报告标题填对应 orderName

  → 上表未覆盖的项目：orderName 直接填报告单上印刷的检验单标题原文

【6. 尿常规 / 粪便常规】
→ 【重要】与内科/外科体格检查相同的提取方式，按检查项目整体提取，不拆成检验子项。
→ itemType="imaging"，每项单独一条（尿常规一条、粪便常规一条）
→ name = 检查名称（"尿常规"/"粪便常规"）
→ findings = 该检查所有子项结果的完整逐行原文，包括正常项目，不得省略压缩：
  ✓ 正确示例（尿常规）："颜色：淡黄色；透明度：清晰；pH：6.0；比重：1.020；蛋白质：阴性；葡萄糖：阴性；酮体：阴性；胆红素：阴性；亚硝酸盐：阴性；白细胞：阴性；红细胞：阴性；尿胆原：正常"
  ✗ 禁止：把各子项拆成独立 lab 条目 / 只写异常项 / 合并成一句话
→ diagnosis = 该项小结/医生意见原文（完整原文，无则留空）
→ conclusion = 同 diagnosis 原文（禁止填检查者姓名，留空）

【7. 碳13/碳14呼气试验】
→ itemType="imaging"，name=报告原文名称（严格区分碳13/碳14，不得改名）
→ findings = 检测结果（DOB值/测量数值等完整原文）
→ diagnosis = 结论/小结原文（如"幽门螺杆菌阳性"/"阴性"及完整原文）
→ conclusion = 同 diagnosis 原文

【8. 超声检查】
→ itemType="imaging"
→ 【核心规则】按脏器/部位拆分，每个脏器单独一条，findings 和 diagnosis 只写该脏器相关内容
→ 禁止把多个脏器合并成一条；禁止把"超声提示"整段作为单独一条

按以下7类项目提取（name 与报告原文一致）：

① 肝脏
  name = 报告原文（如"肝脏彩超"/"肝脏超声"）
  findings = 肝脏"超声所见"/"检查所见"原文（完整原文，禁止截断）
  diagnosis = 肝脏"超声提示"原文
  conclusion = 同 diagnosis

② 胆胰脾（同一张报告单时按脏器拆分为独立条目）
  胆囊：name="胆囊超声"（或报告原文），findings=胆囊所见，diagnosis=胆囊提示
  胰腺：name="胰腺超声"（或报告原文），findings=胰腺所见，diagnosis=胰腺提示
  脾脏：name="脾脏超声"（或报告原文），findings=脾脏所见，diagnosis=脾脏提示
  → 若报告将胆胰脾写在同一张单上（如"肝胆胰脾超声"），仍需按脏器拆为独立条目
  → 拆分时 findings/diagnosis 只写该脏器的内容，不要把其他脏器描述混入

③ 双肾输尿管膀胱
  name = 报告原文（如"双肾输尿管膀胱超声"/"泌尿系超声"）
  findings = 双肾+输尿管+膀胱所见完整原文（整体作为一条，不再拆分）
  diagnosis = 双肾输尿管膀胱超声提示完整原文
  conclusion = 同 diagnosis

④ 前列腺（男）
  name = 报告原文（如"前列腺超声"/"前列腺彩超"）
  findings = 前列腺所见完整原文
  diagnosis = 前列腺超声提示完整原文
  conclusion = 同 diagnosis

⑤ 甲状腺（及周围淋巴结）
  name = 报告原文（如"甲状腺及周围淋巴结超声"/"甲状腺彩超"）
  findings = 甲状腺及淋巴结所见完整原文（禁止截断）
  diagnosis = 甲状腺超声提示完整原文
  conclusion = 同 diagnosis

⑥ 颈动脉
  name = 报告原文（如"颈动脉超声"/"双侧颈动脉彩超"）
  findings = 颈动脉所见完整原文（含内中膜厚度/斑块描述等）
  diagnosis = 颈动脉超声提示完整原文
  conclusion = 同 diagnosis

⑦ 心脏超声
  name = 报告原文（如"心脏彩超"/"超声心动图"）
  findings = 从EF值/M型超声/二维超声/多普勒检查开始，提取检查所见完整原文
  diagnosis = 心脏超声提示/诊断结论完整原文
  conclusion = 同 diagnosis

其他超声（乳腺/子宫附件/阴道超声等）：
  → 同上逻辑，每个独立部位单独一条，findings=所见原文，diagnosis=提示原文，conclusion=同diagnosis

【9. 肺CT / 胸部CT】
→ itemType="imaging"，name="胸部CT"（统一用此名，不论报告写"低剂量螺旋CT"/"肺部CT"/"胸部平扫CT"等）
→ bodyPart="肺部"
→ findings = 检查所见完整原文（禁止截断）
→ diagnosis = 诊断意见/印象完整原文
→ conclusion = 同 diagnosis 原文

【10. 胃镜 / 胃镜病理 / 肠镜 / 肠镜病理】
→ itemType="imaging"
→ 胃镜：name="胃镜检查"（统一用此名，不论报告写"电子胃镜"/"无痛胃镜"等）
   findings=检查所见/镜下所见原文；diagnosis=镜下诊断/X线诊断/诊断原文；conclusion=同diagnosis
→ 肠镜：name="肠镜检查"（统一用此名，不论报告写"结肠镜"/"电子肠镜"/"无痛肠镜"等）
   findings=检查所见/镜下所见原文；diagnosis=镜下诊断/X线诊断/诊断原文；conclusion=同diagnosis
→ 胃镜病理：name="胃镜病理"（统一用此名，不论报告写"胃黏膜活检病理"/"病理组织诊断"等）
   findings=大体所见原文；diagnosis=病理诊断原文；conclusion=同diagnosis
→ 肠镜病理：name="肠镜病理"（统一用此名，不论报告写"肠镜活检病理"/"结肠镜病理"等）
   findings=大体所见原文；diagnosis=病理诊断原文；conclusion=同diagnosis

【11. 常规心电图】
心电图报告需提取两类条目：

① 测量参数（itemType="lab"，每项单独一条）：
   心率、P-R间期、QRS间期、QT间期、QTc间期 各自独立一条
   → name=参数名称原文（如"心率"/"P-R间期"/"QRS"/"QT/QTc"）
   → value=数值；unit=单位；referenceRange=参考范围；abnormal=是否异常
   → orderName="心电图参数"

② 检查描述与诊断（itemType="imaging"，一条）：
   → name="常规心电图"（统一用此名，不论报告写"心电图"/"ECG"/"12导联心电图"等；常规心电图≠动态心电图，不得混淆）
   → findings = 检查描述/波形分析完整原文
   → diagnosis = 诊断结论完整原文
   → conclusion = 同 diagnosis 原文

【12. 肺功能检查】
肺功能报告需提取两类条目：

① 测量参数（itemType="lab"，每项单独一条）：
   FVC、FEV1、FEV1/FVC（或FEV1%）、MVV、DLCO 等数值型指标各自独立一条
   → name=参数名称原文（如"FVC"/"FEV1"/"FEV1/FVC%"/"MVV"/"DLCO"）
   → value=数值；unit=单位；referenceRange=参考范围；abnormal=是否异常
   → orderName="肺功能"

② 检查描述与诊断（itemType="imaging"，一条）：
   → name="肺功能"（统一用此名，不论报告写"肺通气功能"/"肺弥散功能"等）
   → findings = 检查描述/肺功能分析完整原文
   → diagnosis = 诊断结论完整原文
   → conclusion = 同 diagnosis 原文

【13. 睡眠呼吸监测】
→ itemType="imaging"，name=完整名称
→ findings = 所有检测数据完整原文（AHI指数/血氧/呼吸暂停次数等）
→ diagnosis = 结论/诊断原文
→ conclusion = 同 diagnosis 原文

【14. 人体成分分析】
人体成分报告需提取两类条目：

① 测量参数（itemType="lab"，每项单独一条）：
   体脂率、体脂肪量、骨骼肌量、内脏脂肪面积、基础代谢率、去脂体重 等数值型指标各自独立一条
   → name=参数名称原文（如"体脂率"/"骨骼肌量"/"内脏脂肪面积"/"BMR"等）
   → value=数值；unit=单位；referenceRange=参考范围；abnormal=是否异常
   → orderName="人体成分"

② 综合描述与结论（itemType="imaging"，一条）：
   → name="人体成分分析"（统一用此名，不论报告写"InBody检测"/"体成分分析"等）
   → findings = 所有检测数据及描述完整原文
   → diagnosis = 综合评估/结论原文（完整原文，禁止加解读）
   → conclusion = 同 diagnosis 原文

【15. 无创性动脉硬化检测 / PWV / ABI / 动脉弹性检测】
→ itemType="imaging"，name=检测完整名称
→ findings = 测量数值描述完整原文（如有）
→ diagnosis = 诊断结论完整原文（含比较语句务必完整保留）
→ conclusion = 同 diagnosis 原文

【16. 其他 CT/MRI/放射检查/骨密度】
→ itemType="imaging"，每个部位单独一条
→ name=完整检查名称；bodyPart=检查部位
→ findings=检查所见完整原文（禁止截断）；diagnosis=诊断意见/印象完整原文
→ conclusion = 同 diagnosis 原文

【跳过不提取】
→ 报告开头的检查项目汇总清单/目录页
→ 简短总结页（有详细报告单时完全跳过）

══════════════════════════════════════════
【输出格式】
══════════════════════════════════════════

以 JSON 格式返回，只输出 JSON，不要额外文字：
{
  "institution": "体检机构名称",
  "checkDate": "YYYY-MM-DD",
  "items": [
    {
      "name": "项目名称（完整准确，与报告原文一致）",
      "value": "检测值（data/lab类填写，严禁串值）",
      "unit": "单位（data/lab类填写）",
      "referenceRange": "从报告提取的参考范围（非默认值，无则留空）",
      "status": "normal/abnormal/attention/unknown",
      "itemType": "lab 或 imaging 或 data",
      "orderName": "所属检验医嘱组（lab类填写）",
      "bodyPart": "检查部位（imaging类可选）",
      "findings": "检查所见/超声所见/测量数据原文（完整原文禁止截断，禁止加入任何解读）",
      "diagnosis": "诊断意见/超声提示/诊断结论原文（完整原文禁止截断，禁止加入任何解读）",
      "conclusion": "主要结论（imaging/data类填写，内容与 diagnosis 相同；lab类留空）"
    }
  ]
}`;

    // 优先用 OSS URL（通义千问可直接读取公开 URL，PDF/图片均支持）
    const text = hasOssUrl
      ? await parseImage(report.fileUrl, prompt, { isUrl: true, maxTokens: 8000 })
      : await parseImage(report.content, prompt, { isUrl: false, maxTokens: 8000 });

    let parsed = null;
    try {
      parsed = JSON.parse(text.trim().replace(/^```json\n?|\n?```$/g, ''));
    } catch {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: 'AI 解析结果格式异常，已加入待人工审核队列' });
    }

    // 后处理：过滤掉患者基本信息字段和无意义条目
    const PATIENT_INFO_NAMES = new Set([
      '姓名', '性别', '年龄', '出生日期', '身份证号', '手机号', '电话', '联系电话',
      '单位', '工作单位', '体检日期', '体检编号', '报告编号', '科别', '部门',
      '一般情况', '主要阳性体征', '阳性体征', '体检结果汇总', '异常结果汇总',
    ]);
    const filteredItems = (parsed.items || []).filter(item => {
      const name = (item.name || '').trim();
      // 过滤患者信息字段
      if (PATIENT_INFO_NAMES.has(name)) return false;
      // 过滤空name
      if (!name) return false;
      // 过滤纯数字或纯符号name（序号类）
      if (/^[\d、。，,.\s]+$/.test(name)) return false;
      return true;
    });

    // 清理 name 字段：去除首尾的【】[]《》及序号前缀
    filteredItems.forEach(item => {
      item.name = (item.name || '').replace(/^[【\[《〔\s\d、.、]+|[】\]》〕\s]+$/g, '').trim();
    });

    await MedicalReport.findByIdAndUpdate(report._id, {
      reportItems: filteredItems,
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
