// ── 专项筛查分类树（前后端单一数据源）──────────────────────────────
// 与 app/src/screens/records/SpecialScreeningScreen.js 的 CATALOG 完全对齐。
// screeningKey(id) 格式：`<短码>|<二级parent>|<检查项label>`，短码：tumor/cardio/chronic/hp/other。
// 每个叶子节点附 aliases（OCR/报告常见别名），用于自动归类匹配；按需求文档与真实报告样本持续补充。
// 归类映射来源：《体检报告提取规则梳理与专项筛查归集需求》2026-06

const NODES = [
  // ── 肿瘤风险筛查（tumor）──────────────────────────────────────────
  // 肺癌早筛
  { id: 'tumor|肺癌早筛|肺CT', category: 'tumor', categoryKey: 'tumor', parent: '肺癌早筛', label: '肺CT', itemType: 'imaging', gender: null,
    aliases: ['胸部CT', '肺部CT', '低剂量螺旋CT', '低剂量胸部CT', '胸部低剂量CT', '胸部低剂量螺旋CT', '肺部螺旋CT', '胸部平扫CT', '胸部CT平扫', '肺CT平扫', '低剂量肺CT'] },

  // 胃癌/食管癌早筛
  { id: 'tumor|胃-食管癌早筛|胃镜', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '胃镜', itemType: 'imaging', gender: null,
    aliases: ['电子胃镜', '上消化道内镜', '胃十二指肠镜', '无痛胃镜'] },
  { id: 'tumor|胃-食管癌早筛|胃镜病理', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '胃镜病理', itemType: 'imaging', gender: null,
    aliases: ['胃镜活检', '胃黏膜病理', '胃镜活检病理'] },
  { id: 'tumor|胃-食管癌早筛|碳13呼气试验', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '碳13呼气试验', itemType: 'lab', gender: null,
    aliases: ['C13呼气试验', '13C尿素呼气试验', '幽门螺杆菌呼气试验', '幽门螺旋杆菌呼气试验', 'HP呼气试验', 'C-13呼气试验'] },
  { id: 'tumor|胃-食管癌早筛|碳14呼气试验', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '碳14呼气试验', itemType: 'lab', gender: null,
    aliases: ['C14呼气试验', '14C尿素呼气试验', 'C-14呼气试验'] },
  { id: 'tumor|胃-食管癌早筛|胃蛋白酶原', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '胃蛋白酶原', itemType: 'lab', gender: null,
    aliases: ['胃蛋白酶原I', '胃蛋白酶原II', 'PGI', 'PGII', 'PG', '胃蛋白酶原比值', 'PGR', 'PG1', 'PG2', '胃功能', '胃功能检测'] },
  { id: 'tumor|胃-食管癌早筛|胃泌素17', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '胃泌素17', itemType: 'lab', gender: null,
    aliases: ['胃泌素', 'G-17', 'G17', '血清胃泌素17'] },
  { id: 'tumor|胃-食管癌早筛|食管镜', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '食管镜', itemType: 'imaging', gender: null,
    aliases: ['食道镜', '胃食管镜', '食管内镜'] },
  { id: 'tumor|胃-食管癌早筛|食管镜病理', category: 'tumor', categoryKey: 'tumor', parent: '胃-食管癌早筛', label: '食管镜病理', itemType: 'imaging', gender: null,
    aliases: ['食管活检', '食道病理', '食管镜活检病理'] },

  // 肠癌早筛
  { id: 'tumor|肠癌早筛|肠镜', category: 'tumor', categoryKey: 'tumor', parent: '肠癌早筛', label: '肠镜', itemType: 'imaging', gender: null,
    aliases: ['结肠镜', '电子肠镜', '纤维结肠镜', '电子结肠镜', '全结肠镜', '无痛肠镜', '结直肠镜'] },
  { id: 'tumor|肠癌早筛|肠镜病理', category: 'tumor', categoryKey: 'tumor', parent: '肠癌早筛', label: '肠镜病理', itemType: 'imaging', gender: null,
    aliases: ['肠镜活检', '结肠镜病理', '肠道病理', '肠镜活检病理'] },
  { id: 'tumor|肠癌早筛|粪便基因检测', category: 'tumor', categoryKey: 'tumor', parent: '肠癌早筛', label: '粪便基因检测', itemType: 'lab', gender: null,
    aliases: ['肠癌基因检测', '粪便DNA检测', '便基因检测', '粪便多靶点基因检测'] },
  { id: 'tumor|肠癌早筛|粪便隐血', category: 'tumor', categoryKey: 'tumor', parent: '肠癌早筛', label: '粪便隐血', itemType: 'lab', gender: null,
    aliases: ['便潜血', '大便隐血', '粪便潜血', 'OB', '便隐血', '粪便潜血试验'] },

  // 肝癌早筛
  { id: 'tumor|肝癌早筛|肝脏超声', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: '肝脏超声', itemType: 'imaging', gender: null,
    aliases: ['肝脏彩超', '肝脏B超', '肝超声'] },
  { id: 'tumor|肝癌早筛|肝脏磁共振', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: '肝脏磁共振', itemType: 'imaging', gender: null,
    aliases: ['肝脏MRI', '上腹部MRI', '肝脏核磁', '肝MRI'] },
  { id: 'tumor|肝癌早筛|肝纤维弹性超声', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: '肝纤维弹性超声', itemType: 'imaging', gender: null,
    aliases: ['肝脏弹性成像', 'FibroScan', '肝纤维化扫描', '肝脏硬度检测', '肝脏纤维弹性超声', '肝弹性成像'] },
  { id: 'tumor|肝癌早筛|乙肝三系', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: '乙肝三系', itemType: 'lab', gender: null,
    aliases: ['乙肝两对半', '乙型肝炎表面抗原', '乙肝五项', 'HBsAg', '乙肝表面抗原', '乙型肝炎血清学'] },
  { id: 'tumor|肝癌早筛|HBV-DNA', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: 'HBV-DNA', itemType: 'lab', gender: null,
    aliases: ['乙肝病毒DNA', '乙肝DNA', 'HBVDNA', 'HBV定量'] },
  { id: 'tumor|肝癌早筛|丙肝抗体', category: 'tumor', categoryKey: 'tumor', parent: '肝癌早筛', label: '丙肝抗体', itemType: 'lab', gender: null,
    aliases: ['丙肝两项', '丙型肝炎抗体', 'HCV', '抗HCV', '丙肝'] },

  // 胰腺/胆囊/脾脏癌早筛
  { id: 'tumor|胰腺-胆囊-脾脏癌早筛|胆囊超声', category: 'tumor', categoryKey: 'tumor', parent: '胰腺-胆囊-脾脏癌早筛', label: '胆囊超声', itemType: 'imaging', gender: null,
    aliases: ['胆囊彩超', '胆囊B超', '胆囊检查'] },
  { id: 'tumor|胰腺-胆囊-脾脏癌早筛|胰腺超声', category: 'tumor', categoryKey: 'tumor', parent: '胰腺-胆囊-脾脏癌早筛', label: '胰腺超声', itemType: 'imaging', gender: null,
    aliases: ['胰腺彩超', '胰腺B超'] },
  { id: 'tumor|胰腺-胆囊-脾脏癌早筛|脾脏超声', category: 'tumor', categoryKey: 'tumor', parent: '胰腺-胆囊-脾脏癌早筛', label: '脾脏超声', itemType: 'imaging', gender: null,
    aliases: ['脾脏彩超', '脾脏B超', '脾超声'] },
  { id: 'tumor|胰腺-胆囊-脾脏癌早筛|胰腺MRI', category: 'tumor', categoryKey: 'tumor', parent: '胰腺-胆囊-脾脏癌早筛', label: '胰腺MRI', itemType: 'imaging', gender: null,
    aliases: ['胰腺磁共振', '胰腺核磁', 'MRCP', '胰胆管水成像'] },

  // 甲状腺癌早筛
  { id: 'tumor|甲状腺癌早筛|甲状腺超声', category: 'tumor', categoryKey: 'tumor', parent: '甲状腺癌早筛', label: '甲状腺超声', itemType: 'imaging', gender: null,
    aliases: ['甲状腺彩超', '甲状腺及颈部淋巴结超声', '甲状腺及周围淋巴结超声', '甲状腺周围淋巴结超声', '甲状腺B超'] },
  // 注：甲状腺穿刺为有创操作，仅在确有穿刺活检报告时才归类，不由普通体检报告自动归入

  // 乳腺癌早筛
  { id: 'tumor|乳腺癌早筛|乳腺超声', category: 'tumor', categoryKey: 'tumor', parent: '乳腺癌早筛', label: '乳腺超声', itemType: 'imaging', gender: '女',
    aliases: ['乳腺彩超', '双侧乳腺超声', '乳房超声', '乳腺B超'] },
  { id: 'tumor|乳腺癌早筛|乳腺钼靶', category: 'tumor', categoryKey: 'tumor', parent: '乳腺癌早筛', label: '乳腺钼靶', itemType: 'imaging', gender: '女',
    aliases: ['钼靶', '乳腺X线', '乳腺X线摄影', '乳腺钼钯', '乳房X光'] },
  { id: 'tumor|乳腺癌早筛|乳腺磁共振', category: 'tumor', categoryKey: 'tumor', parent: '乳腺癌早筛', label: '乳腺磁共振', itemType: 'imaging', gender: '女',
    aliases: ['乳腺MRI', '乳腺核磁'] },

  // 宫颈癌早筛
  { id: 'tumor|宫颈癌早筛|HPV', category: 'tumor', categoryKey: 'tumor', parent: '宫颈癌早筛', label: 'HPV', itemType: 'lab', gender: '女',
    aliases: ['人乳头瘤病毒', 'HPV分型', 'HPV-DNA', '人乳头状瘤病毒', 'HPV检测'] },
  { id: 'tumor|宫颈癌早筛|TCT', category: 'tumor', categoryKey: 'tumor', parent: '宫颈癌早筛', label: 'TCT', itemType: 'lab', gender: '女',
    aliases: ['宫颈液基细胞学', '液基薄层细胞学', 'LCT', '宫颈细胞学', '宫颈刮片'] },

  // 子宫内膜/卵巢癌早筛
  { id: 'tumor|子宫内膜-卵巢癌早筛|阴道超声', category: 'tumor', categoryKey: 'tumor', parent: '子宫内膜-卵巢癌早筛', label: '阴道超声', itemType: 'imaging', gender: '女',
    aliases: ['经阴道超声', '阴超', '妇科超声', '子宫附件超声', '盆腔超声', '阴道彩超'] },

  // 前列腺癌早筛
  { id: 'tumor|前列腺癌早筛|总PSA', category: 'tumor', categoryKey: 'tumor', parent: '前列腺癌早筛', label: '总PSA', itemType: 'lab', gender: '男',
    aliases: ['PSA', 'T-PSA', 'tPSA', '总PSA', '前列腺特异抗原', '前列腺特异性抗原', '前列腺特异性抗原PSA'] },
  { id: 'tumor|前列腺癌早筛|游离PSA', category: 'tumor', categoryKey: 'tumor', parent: '前列腺癌早筛', label: '游离PSA', itemType: 'lab', gender: '男',
    aliases: ['F-PSA', 'fPSA', '游离前列腺特异性抗原'] },
  { id: 'tumor|前列腺癌早筛|PSA比值', category: 'tumor', categoryKey: 'tumor', parent: '前列腺癌早筛', label: 'PSA比值', itemType: 'lab', gender: '男',
    aliases: ['fPSA/tPSA', 'F/T PSA', '游离/总PSA比'] },
  { id: 'tumor|前列腺癌早筛|前列腺超声', category: 'tumor', categoryKey: 'tumor', parent: '前列腺癌早筛', label: '前列腺超声', itemType: 'imaging', gender: '男',
    aliases: ['前列腺彩超', '经直肠前列腺超声', '前列腺B超'] },
  { id: 'tumor|前列腺癌早筛|前列腺磁共振', category: 'tumor', categoryKey: 'tumor', parent: '前列腺癌早筛', label: '前列腺磁共振', itemType: 'imaging', gender: '男',
    aliases: ['前列腺MRI', '前列腺核磁'] },

  // 泌尿系统肿瘤早筛
  { id: 'tumor|泌尿系统肿瘤早筛|双肾输尿管膀胱超声', category: 'tumor', categoryKey: 'tumor', parent: '泌尿系统肿瘤早筛', label: '双肾输尿管膀胱超声', itemType: 'imaging', gender: null,
    aliases: ['双肾超声', '肾脏超声', '肾脏彩超', '双肾彩超', '肾彩超', '泌尿系彩超', '泌尿系超声', '双肾输尿管膀胱彩超', '肾B超', '泌尿系B超', '膀胱超声', '膀胱彩超'] },

  // 鼻咽癌早筛
  { id: 'tumor|鼻咽癌早筛|EB病毒检查', category: 'tumor', categoryKey: 'tumor', parent: '鼻咽癌早筛', label: 'EB病毒检查', itemType: 'lab', gender: null,
    aliases: ['EB病毒抗体', 'EBV抗体', 'EB病毒IgA', 'EBV-IgA', 'VCA-IgA', 'EB病毒衣壳抗原IgA', 'EB病毒IgM', 'EBV-IgM', 'EB病毒IgG', 'EBV-IgG', 'Rta-IgG', 'EB病毒Rta蛋白IgG抗体'] },
  { id: 'tumor|鼻咽癌早筛|鼻咽镜', category: 'tumor', categoryKey: 'tumor', parent: '鼻咽癌早筛', label: '鼻咽镜', itemType: 'imaging', gender: null,
    aliases: ['电子鼻咽镜', '鼻内镜', '鼻咽镜检查'] },

  // 淋巴瘤早筛（注：含甲状腺描述的淋巴结超声应归甲状腺癌早筛，此处仅保留纯淋巴结超声别名）
  { id: 'tumor|淋巴瘤早筛|淋巴结超声', category: 'tumor', categoryKey: 'tumor', parent: '淋巴瘤早筛', label: '淋巴结超声', itemType: 'imaging', gender: null,
    aliases: ['淋巴结彩超', '浅表淋巴结超声', '双侧腋窝淋巴结超声'] },
  { id: 'tumor|淋巴瘤早筛|淋巴结磁共振', category: 'tumor', categoryKey: 'tumor', parent: '淋巴瘤早筛', label: '淋巴结磁共振', itemType: 'imaging', gender: null,
    aliases: ['淋巴结MRI'] },

  // 肿瘤标志物
  { id: 'tumor|肿瘤标志物|甲胎蛋白', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: '甲胎蛋白', itemType: 'lab', gender: null,
    aliases: ['AFP', 'α-甲胎蛋白'] },
  { id: 'tumor|肿瘤标志物|癌胚抗原', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: '癌胚抗原', itemType: 'lab', gender: null,
    aliases: ['CEA'] },
  { id: 'tumor|肿瘤标志物|CA19-9', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'CA19-9', itemType: 'lab', gender: null,
    aliases: ['CA199', '糖类抗原199', 'CA-199', '糖类抗原19-9'] },
  { id: 'tumor|肿瘤标志物|CA125', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'CA125', itemType: 'lab', gender: '女',
    aliases: ['糖类抗原125', 'CA-125'] },
  { id: 'tumor|肿瘤标志物|CA724', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'CA724', itemType: 'lab', gender: null,
    aliases: ['CA72-4', '糖类抗原724', 'CA-724'] },
  { id: 'tumor|肿瘤标志物|SCC', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'SCC', itemType: 'lab', gender: null,
    aliases: ['鳞状细胞癌抗原', '鳞癌抗原', 'SCCA'] },
  { id: 'tumor|肿瘤标志物|NSE', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'NSE', itemType: 'lab', gender: null,
    aliases: ['神经元特异性烯醇化酶'] },
  { id: 'tumor|肿瘤标志物|CYFRA21-1', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'CYFRA21-1', itemType: 'lab', gender: null,
    aliases: ['细胞角蛋白19片段', '细胞角蛋白片段', 'CYFRA211'] },
  { id: 'tumor|肿瘤标志物|ProGRP', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'ProGRP', itemType: 'lab', gender: null,
    aliases: ['胃泌素释放肽前体'] },
  { id: 'tumor|肿瘤标志物|TSGF', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'TSGF', itemType: 'lab', gender: null,
    aliases: ['恶性肿瘤特异性生长因子'] },
  { id: 'tumor|肿瘤标志物|HCG', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: 'HCG', itemType: 'lab', gender: null,
    aliases: ['人绒毛膜促性腺激素', 'β-HCG', 'βHCG'] },
  { id: 'tumor|肿瘤标志物|铁蛋白', category: 'tumor', categoryKey: 'tumor', parent: '肿瘤标志物', label: '铁蛋白', itemType: 'lab', gender: null,
    aliases: ['血清铁蛋白', 'SF', 'Ferritin'] },

  // ── 心脑血管病风险筛查（cardio）──────────────────────────────────
  // 心血管病早筛
  { id: 'cardio|心血管病早筛|常规心电图', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '常规心电图', itemType: 'imaging', gender: null,
    aliases: ['心电图', 'ECG', 'EKG', '十二导联心电图', '12导联心电图', '静息心电图'] },
  { id: 'cardio|心血管病早筛|动态心电图', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '动态心电图', itemType: 'imaging', gender: null,
    aliases: ['Holter', '24小时动态心电图', '霍尔特'] },
  { id: 'cardio|心血管病早筛|心脏超声', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '心脏超声', itemType: 'imaging', gender: null,
    aliases: ['心脏彩超', '超声心动图', '心脏彩色多普勒', '心动超声', '心脏多普勒超声'] },
  { id: 'cardio|心血管病早筛|心脏磁共振', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '心脏磁共振', itemType: 'imaging', gender: null,
    aliases: ['心脏MRI', '心脏核磁'] },
  { id: 'cardio|心血管病早筛|同型半胱氨酸', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '同型半胱氨酸', itemType: 'lab', gender: null,
    aliases: ['Hcy', '同型半胱胺酸', '血同型半胱氨酸'] },
  { id: 'cardio|心血管病早筛|冠脉CTA', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '冠脉CTA', itemType: 'imaging', gender: null,
    aliases: ['冠状动脉CTA', '冠脉CT', '冠状动脉CT血管成像'] },
  { id: 'cardio|心血管病早筛|运动平板', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '运动平板', itemType: 'imaging', gender: null,
    aliases: ['运动平板试验', '平板运动试验', '运动负荷试验'] },
  { id: 'cardio|心血管病早筛|动脉硬化测定', category: 'cardio', categoryKey: 'cardiovascular', parent: '心血管病早筛', label: '动脉硬化测定', itemType: 'imaging', gender: null,
    aliases: ['动脉硬化检测', 'PWV', 'ABI', '脉搏波传导速度', '踝臂指数'] },

  // 脑血管病早筛（注：Lp(a)/脂蛋白a 属于高血脂早筛，不在此处；脂蛋白磷脂酶A2是完全不同的指标）
  { id: 'cardio|脑血管病早筛|脂蛋白磷脂酶A2', category: 'cardio', categoryKey: 'cardiovascular', parent: '脑血管病早筛', label: '脂蛋白磷脂酶A2', itemType: 'lab', gender: null,
    aliases: ['Lp-PLA2', 'LpPLA2', '脂蛋白相关磷脂酶A2', '脂蛋白磷脂酶'] },
  { id: 'cardio|脑血管病早筛|颈动脉超声', category: 'cardio', categoryKey: 'cardiovascular', parent: '脑血管病早筛', label: '颈动脉超声', itemType: 'imaging', gender: null,
    aliases: ['颈动脉彩超', '双侧颈动脉超声', '颈部血管超声', '颈动脉血管彩超'] },
  { id: 'cardio|脑血管病早筛|头颅MRI', category: 'cardio', categoryKey: 'cardiovascular', parent: '脑血管病早筛', label: '头颅MRI', itemType: 'imaging', gender: null,
    aliases: ['颅脑MRI', '头颅磁共振', '脑MRI', '头部核磁', '颅脑核磁'] },
  { id: 'cardio|脑血管病早筛|头颅MRA', category: 'cardio', categoryKey: 'cardiovascular', parent: '脑血管病早筛', label: '头颅MRA', itemType: 'imaging', gender: null,
    aliases: ['颅脑MRA', '脑血管MRA', '颅内动脉MRA', '头颅血管MRA'] },

  // ── 慢性病筛查（chronic）─────────────────────────────────────────
  // 高血压早筛（注：血压脉搏在一般检查里，这里仅记录专项血压评估）
  { id: 'chronic|高血压早筛|血压', category: 'chronic', categoryKey: 'chronic', parent: '高血压早筛', label: '血压', itemType: 'data', gender: null,
    aliases: ['血压测量', '诊室血压', '收缩压', '舒张压', '血压(mmHg)', '血压mmHg', '左上肢血压', '右上肢血压'] },
  { id: 'chronic|高血压早筛|动态血压', category: 'chronic', categoryKey: 'chronic', parent: '高血压早筛', label: '动态血压', itemType: 'imaging', gender: null,
    aliases: ['24小时动态血压', '动态血压监测', 'ABPM'] },

  // 糖尿病早筛
  { id: 'chronic|糖尿病早筛|空腹血糖', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '空腹血糖', itemType: 'lab', gender: null,
    aliases: ['葡萄糖', 'GLU', 'FPG', '空腹葡萄糖', '血糖', '空腹血浆葡萄糖', '血清葡萄糖'] },
  { id: 'chronic|糖尿病早筛|糖化血红蛋白', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '糖化血红蛋白', itemType: 'lab', gender: null,
    aliases: ['HbA1c', '糖化血红蛋白A1c', 'A1C', '糖化'] },
  { id: 'chronic|糖尿病早筛|葡萄糖耐量试验', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '葡萄糖耐量试验', itemType: 'lab', gender: null,
    aliases: ['OGTT', '糖耐量试验', '口服糖耐量', '糖耐量', '餐后血糖', '餐后2小时血糖', '糖耐量葡萄糖', '口服葡萄糖耐量'] },
  // 注：空腹胰岛素/C肽及各时间点胰岛素C肽仅在做OGTT+胰岛素释放试验时存在，普通体检报告无此项目
  { id: 'chronic|糖尿病早筛|空腹胰岛素', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '空腹胰岛素', itemType: 'lab', gender: null,
    aliases: ['FINS', '空腹INS', '空腹血清胰岛素'] },
  { id: 'chronic|糖尿病早筛|空腹C肽', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '空腹C肽', itemType: 'lab', gender: null,
    aliases: ['C肽空腹', '空腹C-P', 'C-peptide空腹'] },
  { id: 'chronic|糖尿病早筛|30分钟胰岛素C肽', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '30分钟胰岛素/C肽', itemType: 'lab', gender: null,
    aliases: ['0.5小时胰岛素C肽', '30min胰岛素C肽', '胰岛素30min'] },
  { id: 'chronic|糖尿病早筛|1小时胰岛素C肽', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '1小时胰岛素/C肽', itemType: 'lab', gender: null,
    aliases: ['1h胰岛素C肽', '胰岛素1h'] },
  { id: 'chronic|糖尿病早筛|2小时胰岛素C肽', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '2小时胰岛素/C肽', itemType: 'lab', gender: null,
    aliases: ['2h胰岛素C肽', '餐后2小时胰岛素C肽'] },
  { id: 'chronic|糖尿病早筛|3小时胰岛素C肽', category: 'chronic', categoryKey: 'chronic', parent: '糖尿病早筛', label: '3小时胰岛素/C肽', itemType: 'lab', gender: null,
    aliases: ['3h胰岛素C肽', '胰岛素3h'] },

  // 高血脂早筛 — 每个子项独立节点，避免多条检验只写一条记录
  { id: 'chronic|高血脂早筛|总胆固醇', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '总胆固醇', itemType: 'lab', gender: null,
    aliases: ['胆固醇', 'TC', 'CHOL', '血清总胆固醇', '总胆固醇TC'] },
  { id: 'chronic|高血脂早筛|甘油三酯', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '甘油三酯', itemType: 'lab', gender: null,
    aliases: ['TG', 'TRIG', '血清甘油三酯', '甘油三酯TG'] },
  { id: 'chronic|高血脂早筛|LDL-C', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: 'LDL-C', itemType: 'lab', gender: null,
    aliases: ['低密度脂蛋白胆固醇', '低密度脂蛋白', 'LDL', '低密度脂蛋白胆固醇LDL-C'] },
  { id: 'chronic|高血脂早筛|HDL-C', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: 'HDL-C', itemType: 'lab', gender: null,
    aliases: ['高密度脂蛋白胆固醇', '高密度脂蛋白', 'HDL', '高密度脂蛋白胆固醇HDL-C'] },
  { id: 'chronic|高血脂早筛|脂蛋白a', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '脂蛋白a', itemType: 'lab', gender: null,
    aliases: ['Lp(a)', 'LP(A)', '脂蛋白(a)', '脂蛋白A'] },
  { id: 'chronic|高血脂早筛|非高密度脂蛋白胆固醇', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '非高密度脂蛋白胆固醇', itemType: 'lab', gender: null,
    aliases: ['非HDL-C', '非高密度脂蛋白', 'non-HDL', 'Non-HDL-C'] },
  { id: 'chronic|高血脂早筛|载脂蛋白A1', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '载脂蛋白A1', itemType: 'lab', gender: null,
    aliases: ['ApoA1', 'ApoA-1', 'APO-A1', 'APOA1', '脂蛋白A1', '载脂蛋白A-1'] },
  { id: 'chronic|高血脂早筛|载脂蛋白B', category: 'chronic', categoryKey: 'chronic', parent: '高血脂早筛', label: '载脂蛋白B', itemType: 'lab', gender: null,
    aliases: ['ApoB', 'ApoB-100', 'APO-B', 'APOB', '脂蛋白B', '载脂蛋白B-100'] },

  // 脏器功能筛查
  { id: 'chronic|脏器功能筛查|肝功能', category: 'chronic', categoryKey: 'chronic', parent: '脏器功能筛查', label: '肝功能', itemType: 'lab', gender: null,
    aliases: ['肝功', '肝功能全套', '肝功能检查', 'ALT', 'AST', '谷丙转氨酶', '谷草转氨酶', '肝功七项', '转氨酶',
      '丙氨酸氨基转移酶', '天门冬氨酸氨基转移酶', '碱性磷酸酶', 'ALP', 'γ-谷氨酰转肽酶', 'GGT', '谷氨酰转肽酶',
      '总胆红素', 'Tbil', 'TBIL', '直接胆红素', 'Dbil', 'DBIL', '间接胆红素',
      '总蛋白', 'TP', '白蛋白', 'ALB', '球蛋白', 'GLO', '前白蛋白',
      '乳酸脱氢酶', 'LDH', '总胆汁酸', 'TBA'] },
  { id: 'chronic|脏器功能筛查|肾功能', category: 'chronic', categoryKey: 'chronic', parent: '脏器功能筛查', label: '肾功能', itemType: 'lab', gender: null,
    aliases: ['肾功', '肾功能检查', '肌酐', '尿素氮', '血肌酐', 'Cr', 'CREA', 'BUN', '尿酸', 'UA',
      '尿素', 'UREA', '肾小球滤过率', 'GFR', 'eGFR', '肌酐清除率', '血尿酸'] },
  { id: 'chronic|脏器功能筛查|胱抑素C', category: 'chronic', categoryKey: 'chronic', parent: '脏器功能筛查', label: '胱抑素C', itemType: 'lab', gender: null,
    aliases: ['Cys-C', 'CysC', '血清胱抑素C'] },
  { id: 'chronic|脏器功能筛查|尿微量白蛋白-尿肌酐', category: 'chronic', categoryKey: 'chronic', parent: '脏器功能筛查', label: '尿微量白蛋白/尿肌酐', itemType: 'lab', gender: null,
    aliases: ['尿微量白蛋白', 'mALB', '尿白蛋白定量', 'UCr', 'ACR', '尿白蛋白肌酐比值', '尿微量白蛋白肌酐比', '尿白蛋白/肌酐'] },
  { id: 'chronic|脏器功能筛查|肺功能', category: 'chronic', categoryKey: 'chronic', parent: '脏器功能筛查', label: '肺功能', itemType: 'imaging', gender: null,
    aliases: ['肺功能检查', '肺通气功能', '肺弥散功能', 'FVC', 'FEV1'] },

  // 骨质疏松早筛
  { id: 'chronic|骨质疏松早筛|骨密度', category: 'chronic', categoryKey: 'chronic', parent: '骨质疏松早筛', label: '骨密度', itemType: 'imaging', gender: null,
    aliases: ['骨密度检测', '骨密度测定', 'BMD', '双能X线骨密度', '超声骨密度', 'DXA', 'DEXA'] },

  // 睡眠呼吸暂停早筛
  { id: 'chronic|睡眠呼吸暂停早筛|睡眠呼吸监测', category: 'chronic', categoryKey: 'chronic', parent: '睡眠呼吸暂停早筛', label: '睡眠呼吸监测', itemType: 'imaging', gender: null,
    aliases: ['多导睡眠监测', 'PSG', '睡眠监测', '呼吸睡眠监测'] },

  // 老年痴呆筛查
  { id: 'chronic|老年痴呆筛查|认知功能筛查', category: 'chronic', categoryKey: 'chronic', parent: '老年痴呆筛查', label: '认知功能筛查', itemType: 'lab', gender: null,
    aliases: ['MMSE', '阿尔茨海默筛查', '认知评估', 'MoCA'] },

  // 更年期筛查
  { id: 'chronic|更年期筛查|性激素', category: 'chronic', categoryKey: 'chronic', parent: '更年期筛查', label: '性激素', itemType: 'lab', gender: null,
    aliases: ['性激素六项', '性激素检测', 'FSH', 'LH', '雌二醇', 'E2', '促性腺激素'] },

  // ── 其他常规筛查（other）─────────────────────────────────────────
  // 一般检查
  { id: 'other|一般检查|身高', category: 'other', categoryKey: 'other', parent: '一般检查', label: '身高', itemType: 'data', gender: null,
    aliases: ['身高测量', '身高(cm)', '身高cm'] },
  { id: 'other|一般检查|体重', category: 'other', categoryKey: 'other', parent: '一般检查', label: '体重', itemType: 'data', gender: null,
    aliases: ['体重测量', '体重(kg)', '体重kg'] },
  { id: 'other|一般检查|BMI', category: 'other', categoryKey: 'other', parent: '一般检查', label: 'BMI', itemType: 'data', gender: null,
    aliases: ['体质指数', 'BMI体质指数', '体质量指数', '体重指数'] },
  { id: 'other|一般检查|脉搏', category: 'other', categoryKey: 'other', parent: '一般检查', label: '脉搏', itemType: 'data', gender: null,
    aliases: ['脉搏测量', '脉率', '心率脉搏', '脉搏(次/分)', '脉搏次/分'] },
  // 眼科检查（独立二级分类）
  { id: 'other|眼科检查|视力检查', category: 'other', categoryKey: 'other', parent: '眼科检查', label: '视力检查', itemType: 'imaging', gender: null,
    aliases: ['视力', '视力测查', '裸眼视力', '矫正视力', '左眼视力', '右眼视力'] },
  { id: 'other|眼科检查|眼压检查', category: 'other', categoryKey: 'other', parent: '眼科检查', label: '眼压检查', itemType: 'imaging', gender: null,
    aliases: ['眼压', '眼内压', 'IOP', '眼压测量'] },
  { id: 'other|眼科检查|眼科检查', category: 'other', categoryKey: 'other', parent: '眼科检查', label: '眼科检查', itemType: 'imaging', gender: null,
    aliases: ['眼科', '眼科综合检查', '眼科一般检查'] },
  { id: 'other|眼科检查|裂隙灯检查', category: 'other', categoryKey: 'other', parent: '眼科检查', label: '裂隙灯检查', itemType: 'imaging', gender: null,
    aliases: ['裂隙灯', '眼前节检查', '裂隙灯显微镜', '裂隙灯检查（双眼）'] },
  { id: 'other|眼科检查|眼底照相', category: 'other', categoryKey: 'other', parent: '眼科检查', label: '眼底照相', itemType: 'imaging', gender: null,
    aliases: ['双眼眼底照相', '眼底检查', '眼底摄影', '免散瞳眼底照相', '眼底镜检查', '数字化眼底照相', '眼底相片', '眼底照片'] },
  { id: 'other|一般检查|内科', category: 'other', categoryKey: 'other', parent: '一般检查', label: '内科', itemType: 'imaging', gender: null,
    aliases: ['内科查体', '内科检查', '内科体格检查', '内科医生查体'] },
  { id: 'other|一般检查|外科', category: 'other', categoryKey: 'other', parent: '一般检查', label: '外科', itemType: 'imaging', gender: null,
    aliases: ['外科查体', '外科检查', '外科体格检查', '外科医生查体'] },

  // 耳鼻喉检查（独立二级分类）
  { id: 'other|耳鼻喉检查|耳鼻喉', category: 'other', categoryKey: 'other', parent: '耳鼻喉检查', label: '耳鼻喉', itemType: 'imaging', gender: null,
    aliases: ['耳鼻喉检查', '电耳镜', '前鼻镜', '鼻腔检查', 'ENT检查', '耳科检查', '鼻科检查', '喉科检查'] },

  // 三大常规（注：粪便隐血/便潜血独立归入肠癌早筛，此处粪便常规仅用于描述完整粪便检查套餐）
  { id: 'other|三大常规|血常规', category: 'other', categoryKey: 'other', parent: '三大常规', label: '血常规', itemType: 'lab', gender: null,
    aliases: ['血细胞分析', '全血细胞计数', 'CBC', '血常规检查', '血液分析'] },
  { id: 'other|三大常规|尿常规', category: 'other', categoryKey: 'other', parent: '三大常规', label: '尿常规', itemType: 'lab', gender: null,
    aliases: ['尿液分析', '尿液常规', '尿检', '尿液检查'] },
  { id: 'other|三大常规|粪便常规', category: 'other', categoryKey: 'other', parent: '三大常规', label: '粪便常规', itemType: 'lab', gender: null,
    aliases: ['大便常规', '粪便常规+隐血', '便常规', '大便检查'] },

  // 激素类
  { id: 'other|激素类|甲状腺功能', category: 'other', categoryKey: 'other', parent: '激素类', label: '甲状腺功能', itemType: 'lab', gender: null,
    aliases: ['甲功', '甲功三项', '甲功五项', '甲功七项', '甲状腺功能3项', '甲状腺功能5项', '甲状腺功能7项', '甲状腺功能五项', 'TSH', 'FT3', 'FT4', 'T3', 'T4', '促甲状腺激素', '游离三碘甲状腺原氨酸', '游离甲状腺素', '三碘甲状腺原氨酸', '甲状腺素', 'TPOAb', 'TgAb', 'TRAb', '抗甲状腺过氧化物酶抗体', '促甲状腺素受体抗体', '抗甲状腺球蛋白抗体', '甲状腺过氧化物酶抗体'] },
  // 注：甲状腺球蛋白(Tg)是甲状腺癌术后随访指标，普通体检报告极少出现；甲状腺球蛋白抗体(TgAb)属于甲状腺功能检测
  { id: 'other|激素类|性激素', category: 'other', categoryKey: 'other', parent: '激素类', label: '性激素', itemType: 'lab', gender: null,
    aliases: ['性激素六项', 'FSH', 'LH', '雌二醇', 'E2', '孕酮', '睾酮'] },

  // 维生素及电解质类
  { id: 'other|维生素及电解质|25-羟基维生素D', category: 'other', categoryKey: 'other', parent: '维生素及电解质', label: '25-羟基维生素D', itemType: 'lab', gender: null,
    aliases: ['维生素D', '25(OH)D', '25羟维生素D', 'VitD', '25-羟维生素D3', '维生素D3', '25-OH-VD'] },
  { id: 'other|维生素及电解质|电解质', category: 'other', categoryKey: 'other', parent: '维生素及电解质', label: '电解质', itemType: 'lab', gender: null,
    aliases: ['电解质检查', '血钾', '血钠', '血氯', '钾钠氯', '血清电解质', '电解质组合'] },
  // 注：维生素B族仅在有对应检测报告时归类，普通体检报告无此项
  { id: 'other|维生素及电解质|维生素B族', category: 'other', categoryKey: 'other', parent: '维生素及电解质', label: '维生素B族', itemType: 'lab', gender: null,
    aliases: ['维生素B12', '叶酸检测', 'VitB12检测', 'B12检测'] },

  // 传染病筛查
  { id: 'other|传染病筛查|传染病4项', category: 'other', categoryKey: 'other', parent: '传染病筛查', label: '传染病4项', itemType: 'lab', gender: null,
    aliases: ['传染病四项', '术前八项', '感染四项', '乙肝丙肝梅毒艾滋', '乙肝', '丙肝', '梅毒', '艾滋', 'HIV', '梅毒螺旋体', 'RPR'] },

  // 风湿免疫
  { id: 'other|风湿免疫|免疫全套', category: 'other', categoryKey: 'other', parent: '风湿免疫', label: '免疫全套', itemType: 'lab', gender: null,
    aliases: ['免疫五项', '免疫球蛋白', 'IgG', 'IgM', 'IgA', '风湿免疫', '自身抗体', '类风湿因子', 'RF', 'CRP', 'C反应蛋白', '抗核抗体', 'ANA'] },

  // 凝血功能+D-二聚体
  { id: 'other|凝血功能|凝血功能', category: 'other', categoryKey: 'other', parent: '凝血功能', label: '凝血功能', itemType: 'lab', gender: null,
    aliases: ['凝血四项', '凝血五项', 'PT', 'APTT', '凝血常规', 'INR'] },
  { id: 'other|凝血功能|D-二聚体', category: 'other', categoryKey: 'other', parent: '凝血功能', label: 'D-二聚体', itemType: 'lab', gender: null,
    aliases: ['D二聚体', 'D-Dimer', 'DDimer'] },

  // 风湿免疫+补体
  { id: 'other|风湿+补体|风湿免疫+补体', category: 'other', categoryKey: 'other', parent: '风湿+补体', label: '风湿免疫+补体', itemType: 'lab', gender: null,
    aliases: ['补体C3', 'C3', '补体C4', 'C4', '抗双链DNA', '抗CCP抗体', '免疫补体', '补体检测'] },

  // ── 功能医学检测（hp）────────────────────────────────────────────
  { id: 'hp|功能医学检测|慢性食物过敏检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '慢性食物过敏检测', itemType: 'lab', gender: null,
    aliases: ['食物不耐受', '食物特异性IgG', '食物过敏原', '食物过敏检测'] },
  { id: 'hp|功能医学检测|肠道菌群基因测序', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '肠道菌群基因测序', itemType: 'lab', gender: null,
    aliases: ['肠道菌群检测', '肠道微生态', '菌群测序'] },
  { id: 'hp|功能医学检测|端粒长度检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '端粒长度检测', itemType: 'lab', gender: null,
    aliases: ['端粒检测'] },
  { id: 'hp|功能医学检测|精准基因检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '精准基因检测', itemType: 'lab', gender: null,
    aliases: ['基因检测', '遗传基因检测', '多基因检测'] },
  { id: 'hp|功能医学检测|性别荷尔蒙检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '性别荷尔蒙检测', itemType: 'lab', gender: null,
    aliases: ['性激素检测', '性荷尔蒙'] },
  { id: 'hp|功能医学检测|环境荷尔蒙检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '环境荷尔蒙检测', itemType: 'lab', gender: null,
    aliases: ['环境激素'] },
  { id: 'hp|功能医学检测|抗压力荷尔蒙检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '抗压力荷尔蒙检测', itemType: 'lab', gender: null,
    aliases: ['皮质醇', '压力激素', '抗压荷尔蒙', '肾上腺皮质激素'] },
  { id: 'hp|功能医学检测|抗氧化维生素检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '抗氧化维生素检测', itemType: 'lab', gender: null,
    aliases: ['抗氧化维生素', '维生素谱'] },
  { id: 'hp|功能医学检测|全套新陈代谢分析', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '全套新陈代谢分析', itemType: 'lab', gender: null,
    aliases: ['代谢分析', '新陈代谢检测'] },
  { id: 'hp|功能医学检测|营养与重金属元素', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '营养与重金属元素', itemType: 'lab', gender: null,
    aliases: ['重金属检测', '微量元素', '营养元素检测', '重金属元素'] },
  { id: 'hp|功能医学检测|生长因子分析', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '生长因子分析', itemType: 'lab', gender: null,
    aliases: ['IGF-1', '生长因子'] },
  { id: 'hp|功能医学检测|雌激素代谢分析', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '雌激素代谢分析', itemType: 'lab', gender: null,
    aliases: ['雌激素代谢'] },
  { id: 'hp|功能医学检测|氧化压力分析', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '氧化压力分析', itemType: 'lab', gender: null,
    aliases: ['氧化应激', '氧化压力检测'] },
  { id: 'hp|功能医学检测|尿碘检测', category: 'hp', categoryKey: 'health_promote', parent: '功能医学检测', label: '尿碘检测', itemType: 'lab', gender: null,
    aliases: ['尿碘'] },
];

// 按一级分类聚合成树（供前端 GET /staff/screening-tree 使用）
function buildTree() {
  const catOrder = ['tumor', 'cardio', 'chronic', 'other', 'hp'];
  const catLabel = { tumor: '肿瘤风险筛查', cardio: '心脑血管病风险筛查', chronic: '慢性病筛查', other: '其他常规筛查', hp: '功能医学检测' };
  const byCat = {};
  NODES.forEach(n => {
    if (!byCat[n.category]) byCat[n.category] = {};
    if (!byCat[n.category][n.parent]) byCat[n.category][n.parent] = [];
    byCat[n.category][n.parent].push({ id: n.id, label: n.label, itemType: n.itemType, gender: n.gender });
  });
  return catOrder.filter(c => byCat[c]).map(c => ({
    category: c, categoryKey: NODES.find(n => n.category === c).categoryKey, label: catLabel[c],
    parents: Object.entries(byCat[c]).map(([parent, items]) => ({ parent, items })),
  }));
}

module.exports = { NODES, buildTree };
