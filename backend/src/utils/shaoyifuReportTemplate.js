const text = value => String(value || '').trim();

function isShaoyifuReport(report) {
  const haystack = [report?.title, report?.institution, report?.hospital].map(text).join(' ');
  return /邵逸夫|Sir\s*Run\s*Run\s*Shaw/i.test(haystack);
}

function pageMode(pageNum) {
  if (pageNum >= 1 && pageNum <= 3) return 'skip';
  if (pageNum >= 4 && pageNum <= 11) return 'extract';
  if (pageNum === 20) return 'ecg_enrichment';
  if (pageNum >= 12 && pageNum <= 21) return 'duplicate';
  return 'extract';
}

const PAGE_RULES = {
  4: '一般项目每行单独输出；体重、体重指数、脉搏、跌倒评分不得遗漏。眼科、耳鼻喉科、妇科分别各输出一条imaging，科室内全部“项目：描述”合并写入findings，不得拆成多个检验项。页面底部各科建议写入对应科室findings；不得读取小结页内容。',
  5: '全科医学检查只输出一条imaging，name固定为“全科医学检查”。家族史、慢病史、手术史、是否吸烟、是否饮酒、心脏、胸部、腹部其他、神经系统、皮肤、浅表淋巴结、甲状腺、乳房、脊柱、四肢关节、痔疮等全部按“项目：原文结果”依次合并进findings，禁止逐条输出。',
  6: '腹部超声必须严格按原报告行序拆成肝脏超声、胆囊超声、胰腺超声、脾脏超声、双肾超声五条；项目名称必须取该器官标题，findings只能写同一器官所见，严禁把“脾脏彩超”改名为“胰腺超声”或串入胰腺内容。子宫附件超声、甲状腺超声必须提取。双侧乳房彩超若本页只有标题、结果在下一页，本页不要输出空壳，留待下一页提取。',
  7: '提取上一页延续的双侧乳房彩超为一条完整乳房超声；继续提取颈动脉超声、心脏超声、肺部CT。肺部CT只生成一条。',
  8: '必须提取常规十二导心电图、C13呼气试验、头颅MRA、宫颈液基细胞学检查(TCT)，每个项目一条。',
  9: '逐栏逐行读取血常规、红细胞沉降率(ESR)、尿常规。每个表格均先完整读取左栏，再完整读取右栏；右栏是独立项目，绝不继承左栏名称。血常规和尿常规所有印刷子项都必须输出。',
  10: '本页不得跳过。逐栏逐行提取生化、甲状腺功能、25-羟基维生素D、空腹胰岛素、肿瘤标志物；先完整左栏再完整右栏，项目名称、结果、单位、参考范围严格同行对应。',
  11: '逐栏逐行提取尿微量白蛋白/尿肌酐比值、乙肝三系、EB病毒、胃功能、EB-VCA IgM、HPV24型。每个检验单必须先完整读取左栏从上到下，再读取右栏从上到下，禁止从右到左。尿微量必须包含右栏“尿肌酐测定”，且不得归入乙肝三系；乙肝三系左栏依次为表面抗原、核心抗体、表面抗体，之后才是右栏e抗原、e抗体。EB病毒与胃蛋白酶原/胃泌素是不同项目；HPV左右两栏24型全部逐条输出；大便常规标记未检，不输出。',
  20: '本页仅用于补充常规十二导心电图的心率、P-R间期、QRS时限、QT/QTc、电轴、RV5、SV1、RV5+SV1及诊断。只输出一条心电图，不生成其他条目。',
};

function promptForPage(pageNum) {
  const rule = PAGE_RULES[pageNum] || '';
  return `\n\n【浙江大学医学院附属邵逸夫医院完整模板·第${pageNum}页，最高优先级】\n${rule}\n输出前必须逐项自查本页规则，禁止用体检小结补充。`;
}

function needsCoverageAudit(pageNum, items) {
  const pageItems = (items || []).filter(item => Number(item?._page) === pageNum);
  const names = pageItems.map(item => `${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`).join(' ');
  const hasAll = patterns => patterns.every(pattern => pattern.test(names));
  if (pageNum === 4) return !hasAll([/体重/, /体重指数|BMI/i, /脉搏/, /跌倒/, /眼科/, /耳鼻喉|ENT/i, /妇科/]);
  if (pageNum === 5) return pageItems.length < 10 || !/家族史/.test(names);
  if (pageNum === 6) {
    const semanticItem = (namePattern, contentPattern, minFindings = 1) => pageItems.some(item => {
      if (!namePattern.test(`${text(item.name)} ${text(item.sourceSection)}`)) return false;
      const findings = text(item.findings || item.value);
      return findings.length >= minFindings && contentPattern.test(findings);
    });
    return !semanticItem(/肝/, /肝/)
      || !semanticItem(/胆/, /胆/)
      || !semanticItem(/胰/, /胰/)
      || !semanticItem(/脾/, /脾/)
      || !semanticItem(/肾/, /肾/)
      || !semanticItem(/子宫|附件/, /子宫|宫颈|附件/, 20)
      || !semanticItem(/甲状腺/, /甲状腺/, 20);
  }
  if (pageNum === 7) return !hasAll([/乳房|乳腺/, /颈动脉/, /心脏/, /肺.*CT|胸部.*CT/]);
  if (pageNum === 8) return !hasAll([/心电图/, /C13|碳13/i, /MRA/i, /宫颈液基|TCT/i]);
  if (pageNum === 9) return pageItems.length < 35 || !hasAll([/红细胞计数/, /血小板压积/, /红细胞沉降|ESR/i, /细菌/]);
  if (pageNum === 10) return pageItems.length < 25 || !hasAll([/甘油三酯/, /脂蛋白磷脂酶A2/, /促甲状腺/, /25.*维生素D/i, /胰岛素/, /糖链抗原125/]);
  if (pageNum === 11) return pageItems.length < 34 || !hasAll([/尿肌酐测定/, /乙型肝炎病毒e抗体/, /VCA[-－]?IgA/i, /胃蛋白酶原II/, /HPV51/i, /HPV81/i]);
  if (pageNum === 20) return !/心电图/.test(names);
  return false;
}

function content(item) {
  return [item?.value, item?.findings, item?.diagnosis, item?.conclusion].map(text).filter(Boolean).join('；');
}

function isNamed(item, pattern) {
  return pattern.test(`${text(item?.name)} ${text(item?.sourceSection)} ${text(item?.orderName)}`);
}

function mergeText(...parts) {
  return [...new Set(parts.map(text).filter(Boolean))].join('；');
}

const matchIndex = (value, rules) => {
  const haystack = text(value);
  const index = rules.findIndex(rule => rule.test(haystack));
  return index < 0 ? rules.length : index;
};

const PAGE6_ORDER = [/肝/, /胆囊/, /胰/, /脾/, /肾/, /子宫|附件/, /甲状腺/, /乳房|乳腺/];
const PAGE9_ORDER = [
  /白细胞计数/, /血红蛋白/, /平均红细胞体积/, /平均红细胞血红蛋白浓度/, /中性.*百分/, /单核.*百分/, /嗜碱.*百分/, /淋巴.*绝对/, /嗜酸.*绝对/, /红细胞分布宽度/, /平均血小板体积/, /糖化血红蛋白|HbA1c/i,
  /^红细胞计数$/, /红细胞比积/, /平均红细胞血红蛋白量/, /血小板计数/, /淋巴.*百分/, /嗜酸.*百分/, /中性.*绝对/, /单核.*绝对/, /嗜碱.*绝对/, /血小板分布宽度/, /血小板压积/,
  /红细胞沉降率|ESR/i,
  /浊度|清亮/, /胆红素/, /比重/, /^pH$/i, /尿胆原/, /白细胞酯酶/, /^红细胞$/, /上皮细胞/, /^管型$/, /^细菌$/,
  /颜色/, /葡萄糖/, /酮体/, /潜血/, /蛋白质/, /亚硝酸盐/, /有形成分/, /^白细胞$/, /小圆上皮/, /病理管型/, /结晶/,
];
const PAGE11_ORDER = [
  /^微量尿蛋白$|^微量尿白蛋白$/, /尿肌酐计算/, /微量尿.*尿肌酐比值/, /尿肌酐测定/,
  /乙型肝炎病毒表面抗原/, /乙型肝炎病毒核心抗体/, /乙型肝炎病毒表面抗体/, /乙型肝炎病毒e抗原/, /乙型肝炎病毒e抗体/,
  /胃泌素/, /胃蛋白酶原I(?!I)/, /VCA[-－]?IgA/i, /胃蛋白酶原II/, /EB.*IgM|VCA.*IgM/i,
  /HPV16\D/i, /HPV31\D/i, /HPV35\D/i, /HPV45\D/i, /HPV52\D/i, /HPV56\D/i, /HPV59\D/i, /HPV68\D/i, /HPV82\D/i, /HPV06\D/i, /HPV42\D/i, /HPV44\D/i,
  /HPV18\D/i, /HPV33\D/i, /HPV39\D/i, /HPV51\D/i, /HPV53\D/i, /HPV58\D/i, /HPV66\D/i, /HPV73\D/i, /HPV83\D/i, /HPV11\D/i, /HPV43\D/i, /HPV81\D/i,
];

function applyShaoyifuOrderAndGroups(inputItems) {
  return (inputItems || []).map((item, originalIndex) => {
    const page = Number(item?._page || 0);
    const name = text(item.name);
    const next = { ...item };
    if (/眼科|耳鼻喉|妇科/.test(`${name} ${text(item.sourceSection)}`)) next.itemType = 'imaging';
    if (/肝脏|胆囊|胰腺|脾脏|双肾|肾脏|子宫.*附件|附件.*子宫|甲状腺.*(?:超声|彩超)/.test(`${name} ${text(item.sourceSection)}`)) next.itemType = 'imaging';
    let order = originalIndex;
    if (page === 9) {
      if (/红细胞沉降率|ESR/i.test(name)) next.orderName = '红细胞沉降率(ESR)';
      else if (/尿|浊度|胆红素|比重|尿胆原|白细胞酯酶|上皮细胞|管型|细菌|颜色|葡萄糖|酮体|潜血|蛋白质|亚硝酸盐|有形成分|结晶/.test(`${name} ${text(item.orderName)}`)) next.orderName = '尿液干化学分析';
      else next.orderName = '血常规';
      order = matchIndex(name, PAGE9_ORDER);
    } else if (page === 11) {
      if (/微量尿|尿肌酐/.test(name)) next.orderName = '微量尿蛋白/尿肌酐比值';
      else if (/乙型肝炎|HB[sebc]A/i.test(name)) next.orderName = '乙肝三系';
      else if (/HPV\d+/i.test(name)) next.orderName = '人乳头状瘤病毒基因分型(HPV24型)';
      else if (/胃蛋白酶原|胃泌素/.test(name)) next.orderName = '胃功能3项';
      else if (/EB|VCA/i.test(name)) next.orderName = 'EB病毒抗体';
      order = matchIndex(name, PAGE11_ORDER);
    } else if (page === 6) order = matchIndex(name, PAGE6_ORDER);
    next._order = order;
    return next;
  }).sort((a, b) => Number(a._page || 0) - Number(b._page || 0) || Number(a._order || 0) - Number(b._order || 0));
}

function normalizeShaoyifuItems(inputItems) {
  let items = (inputItems || []).filter(item => {
    const page = Number(item?._page || 0);
    return pageMode(page) === 'extract' || pageMode(page) === 'ecg_enrichment';
  });

  // P5必须是一条完整全科医学检查，避免内部项目被当作化验/影像散落。
  const internal = items.filter(item => Number(item._page) === 5);
  if (internal.length) {
    const findings = internal.map(item => {
      const label = text(item.name);
      const value = content(item);
      return label && value ? `${label}：${value}` : value || label;
    }).filter(Boolean).join('；');
    const base = internal.find(item => isNamed(item, /全科医学检查|全科|内科|外科/)) || internal[0];
    items = items.filter(item => Number(item._page) !== 5);
    items.push({ ...base, _page: 5, name: '全科医学检查', sourceSection: '全科医学检查', itemType: 'imaging', value: '', unit: '', referenceRange: '', findings, diagnosis: '', conclusion: '' });
  }

  // P6标题+P7正文只保留一条完整乳房超声。
  const breast = items.filter(item => isNamed(item, /乳房|乳腺/) && [6, 7].includes(Number(item._page)));
  if (breast.length) {
    const preferred = [...breast].sort((a, b) => content(b).length - content(a).length)[0];
    const merged = {
      ...preferred,
      _page: 7,
      name: '乳房超声',
      sourceSection: '双侧乳房彩超检查',
      itemType: 'imaging',
      findings: mergeText(...breast.map(i => i.findings || i.value)),
      diagnosis: mergeText(...breast.map(i => i.diagnosis || i.conclusion)),
    };
    merged.conclusion = merged.diagnosis;
    items = items.filter(item => !breast.includes(item));
    items.push(merged);
  }

  // P20只补充P8心电图，不产生第二条。
  const ecg = items.filter(item => isNamed(item, /心电图/) && [8, 20].includes(Number(item._page)));
  if (ecg.length) {
    const page8 = ecg.find(item => Number(item._page) === 8) || ecg[0];
    const merged = {
      ...page8,
      _page: 8,
      name: '常规十二导心电图',
      itemType: 'imaging',
      findings: mergeText(...ecg.map(i => i.findings || i.value)),
      diagnosis: mergeText(...ecg.map(i => i.diagnosis || i.conclusion)),
    };
    merged.conclusion = merged.diagnosis;
    items = items.filter(item => !ecg.includes(item));
    items.push(merged);
  }

  // 同一检查仅保留信息最完整的一条；P12之后已在入口剔除，不参与重复竞争。
  const imagingBest = new Map();
  const passthrough = [];
  for (const item of items) {
    if (item.itemType !== 'imaging') { passthrough.push(item); continue; }
    let key = text(item.name).replace(/双侧|检查|检测|彩色多普勒|彩超/g, '').replace(/\s+/g, '');
    if (/肺.*CT|胸部.*CT/.test(key)) key = '肺部CT';
    if (/头颅.*MRA/.test(key)) key = '头颅MRA';
    const old = imagingBest.get(key);
    const semanticScore = candidate => {
      const organ = [/肝/, /胆囊/, /胰腺/, /脾脏/, /肾/, /子宫|附件/, /甲状腺/]
        .find(pattern => pattern.test(text(candidate?.name)));
      return (organ && organ.test(text(candidate?.findings || candidate?.value)) ? 100000 : 0) + content(candidate).length;
    };
    if (!old || semanticScore(item) > semanticScore(old)) imagingBest.set(key, item);
  }
  items = passthrough.concat([...imagingBest.values()]);
  return applyShaoyifuOrderAndGroups(items);
}

module.exports = { isShaoyifuReport, pageMode, promptForPage, needsCoverageAudit, normalizeShaoyifuItems, applyShaoyifuOrderAndGroups };
