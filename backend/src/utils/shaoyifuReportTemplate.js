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
  6: '腹部超声必须拆成肝脏超声、胆囊超声、胰腺超声、脾脏超声、双肾超声五条；子宫附件超声、甲状腺超声必须提取。双侧乳房彩超若本页只有标题、结果在下一页，本页不要输出空壳，留待下一页提取。',
  7: '提取上一页延续的双侧乳房彩超为一条完整乳房超声；继续提取颈动脉超声、心脏超声、肺部CT。肺部CT只生成一条。',
  8: '必须提取常规十二导心电图、C13呼气试验、头颅MRA、宫颈液基细胞学检查(TCT)，每个项目一条。',
  9: '逐栏逐行读取血常规、红细胞沉降率(ESR)、尿常规。每个表格均先完整读取左栏，再完整读取右栏；右栏是独立项目，绝不继承左栏名称。血常规和尿常规所有印刷子项都必须输出。',
  10: '本页不得跳过。逐栏逐行提取生化、甲状腺功能、25-羟基维生素D、空腹胰岛素、肿瘤标志物；先完整左栏再完整右栏，项目名称、结果、单位、参考范围严格同行对应。',
  11: '逐栏逐行提取尿微量白蛋白/尿肌酐比值、乙肝三系、EB病毒、胃功能、EB-VCA IgM、HPV24型。必须完整读取左右栏。EB病毒与胃蛋白酶原/胃泌素是不同项目；HPV左右两栏24型全部逐条输出；大便常规标记未检，不输出。',
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
  if (pageNum === 6) return !hasAll([/肝/, /胆/, /胰/, /脾/, /肾/, /子宫|附件/, /甲状腺/]);
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
    if (!old || content(item).length > content(old).length) imagingBest.set(key, item);
  }
  items = passthrough.concat([...imagingBest.values()]);
  return items.sort((a, b) => Number(a._page || 0) - Number(b._page || 0));
}

module.exports = { isShaoyifuReport, pageMode, promptForPage, needsCoverageAudit, normalizeShaoyifuItems };
