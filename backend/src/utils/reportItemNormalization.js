const text = value => String(value == null ? '' : value).trim();

const DEPARTMENT_EXAMS = [
  { name: '耳鼻喉科检查', section: /耳鼻喉/, detail: /^(?:耳部|鼻部|咽部|咽喉部|口咽部|喉部|听力)(?:检查)?$|^ENT建议$/i },
  { name: '眼科检查', section: /眼科/, detail: /^(?:初步印象|左矫正视力|右矫正视力|矫正方式|外眼|眼睑|结膜|角膜|前房(?:清)?|周边前房深度(?:左|右)|虹膜|左晶体|右晶体|晶状体|左玻璃体|右玻璃体|玻璃体|左杯盘比|右杯盘比|杯盘比|瞳孔|眼底|色觉)(?:检查)?$|^眼科建议$/ },
  { name: '内科检查', section: /内科/, detail: /^(?:心|肺|肝|脾|腹部|神经系统|淋巴结|甲状腺)(?:检查|触诊)?$/ },
  { name: '外科检查', section: /外科/, detail: /^(?:皮肤|浅表淋巴结|脊柱|四肢|肛门|外生殖器)(?:检查)?$/ },
  { name: '妇科检查', section: /妇科/, detail: /^(?:外阴|阴道|宫颈|子宫|附件|妇科内诊)(?:检查)?$/ },
  { name: '口腔科检查', section: /口腔|牙科/, detail: /^(?:龋齿|缺牙|义齿|牙齿|牙周|牙龈|口腔黏膜|舌|颞下颌关节)(?:检查)?$|^(?:口腔科|牙科)建议$/ },
];

function normalizeDepartmentExamItems(items) {
  return (items || []).map(item => {
    const exam = DEPARTMENT_EXAMS.find(candidate => {
      const context = `${text(item.name)} ${text(item.sourceSection)} ${text(item.orderName)}`;
      return candidate.section.test(context);
    });
    if (!exam) return item;

    const isDetail = exam.detail.test(text(item.name));
    const finding = text(item.findings) || text(item.value);
    return {
      ...item,
      // 科室体检也必须按原报告一行一项展示，不能再压成一个无法核对的大文本框。
      name: isDetail ? text(item.name) : (text(item.name) || exam.name),
      itemType: 'imaging',
      value: '', unit: '', referenceRange: '',
      sourceSection: text(item.sourceSection) || exam.name,
      findings: finding,
    };
  });
}

// 呼气试验报告常把“13”漏识别，甚至把“幽门螺杆菌”识别成相近文字。
// 报告标题用于确定C13/C14，项目内容只用于确认这是呼气试验，避免靠错误项目名进入通用别名匹配。
function normalizeBreathTestItems(items, report = {}) {
  const list = items || [];
  const reportText = `${text(report.title)} ${text(report.type)} ${text(report.institution)} ${text(report.hospital)}`;
  const explicitKind = value => {
    if (/(?:碳|C)\s*13|13\s*(?:碳|C)/i.test(value)) return '13';
    if (/(?:碳|C)\s*14|14\s*(?:碳|C)/i.test(value)) return '14';
    return '';
  };
  const reportKind = explicitKind(reportText);
  const breathEvidence = item => {
    const value = `${text(item.name)} ${text(item.orderName)} ${text(item.sourceSection)} ${text(item.findings)} ${text(item.diagnosis)} ${text(item.conclusion)}`;
    return /呼气|尿素.*(?:幽门|螺杆|杆菌)|(?:幽门|螺杆).*杆菌.*(?:结果|检测)/i.test(value);
  };
  const groups = new Map();
  list.forEach((item, index) => {
    if (!breathEvidence(item)) return;
    const itemText = `${text(item.name)} ${text(item.orderName)} ${text(item.sourceSection)}`;
    const kind = explicitKind(itemText) || reportKind;
    if (!kind) return;
    const key = `${Number(item._page || item.sourcePage || 0)}:${kind}`;
    if (!groups.has(key)) groups.set(key, { kind, firstIndex: index, rows: [] });
    groups.get(key).rows.push(item);
  });
  if (!groups.size) return list;

  const output = [];
  list.forEach((item, index) => {
    const group = [...groups.values()].find(entry => entry.rows.includes(item));
    if (!group) { output.push(item); return; }
    if (index !== group.firstIndex) return;
    const rows = group.rows;
    const richest = rows.slice().sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
    const measured = rows.map(row => text(row.value)).find(Boolean)
      || rows.map(row => text(row.findings).match(/(?:测定值|结果)\s*[：:]?\s*([<>]?\s*[\d.]+)/)?.[1]).find(Boolean) || '';
    const reference = rows.map(row => text(row.referenceRange)).find(Boolean)
      || rows.map(row => text(row.findings).match(/(?:正常值|参考值|参考范围)\s*[：:]?\s*([^\n；;]+)/)?.[1]).find(Boolean) || '';
    const conclusion = rows.map(row => text(row.diagnosis || row.conclusion)).find(Boolean)
      || (rows.some(row => row.status === 'abnormal') ? '阳性' : rows.some(row => row.status === 'normal') ? '阴性' : '');
    const findings = [measured && `测定值：${measured}`, reference && `正常值：${reference}`].filter(Boolean).join('\n')
      || rows.map(row => text(row.findings)).filter(Boolean).join('\n');
    output.push({
      ...richest,
      name: `碳${group.kind}呼气试验`,
      itemType: 'imaging',
      orderName: `碳${group.kind}呼气试验`,
      sourceSection: `碳${group.kind}呼气试验`,
      value: '', unit: '', referenceRange: '',
      findings,
      diagnosis: conclusion,
      conclusion,
      status: /阳性/.test(conclusion) ? 'abnormal' : /阴性/.test(conclusion) ? 'normal' : text(richest.status) || 'unknown',
    });
  });
  // 单项呼气试验报告只能形成一个检查项目；报告医生、开单医生、诊断结论等版面标签不是项目。
  return reportKind ? output : output;
}

const NON_EXAM_LABEL = /^(?:报告医生|开单医生|审核者|申请科室|检查医生|报告日期|检查日期|报告时间|检查时间|报告编号|检查报告号|诊断结论|检查描述|所见)$/;

// 单项报告按“检查项目”收敛。模型可以负责读字，但不能决定把版面标签拆成多少个检验项目。
function normalizeSingleExamReportItems(items, report = {}) {
  const list = items || [];
  const title = `${text(report.title)} ${text(report.screeningL2)} ${text(report.screeningL3)}`;
  if (/(?:碳|C)\s*1[34].{0,8}呼气/i.test(title)) {
    const normalized = normalizeBreathTestItems(list, report).filter(item => /呼气试验/.test(text(item.name)));
    return normalized.length ? [normalized[0]] : list.filter(item => !NON_EXAM_LABEL.test(text(item.name)));
  }
  if (/全科|内外科/.test(title)) {
    const rows = list.filter(item => !NON_EXAM_LABEL.test(text(item.name)));
    if (!rows.length) return list;
    return rows.map(item => ({
      ...item,
      itemType: 'imaging',
      value: '', unit: '', referenceRange: '',
      orderName: text(item.orderName) || '全科医学检查',
      sourceSection: text(item.sourceSection) || '全科医学检查',
      findings: text(item.findings) || text(item.value) || text(item.diagnosis) || text(item.conclusion),
    }));
  }
  return list;
}

const UPPER_ORGANS = [
  { pattern: /肝脏|肝/, name: /肝脏|肝/ },
  { pattern: /胆囊|胆总管|胆/, name: /胆囊|胆/ },
  { pattern: /胰腺|胰/, name: /胰腺|胰/ },
  { pattern: /脾脏|脾/, name: /脾脏|脾/ },
];

function upperOrganIndex(value) {
  const source = text(value);
  const hits = UPPER_ORGANS.map((organ, index) => organ.pattern.test(source) ? index : -1).filter(index => index >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

// 超声提示偶尔会顺移到上一器官；只在结论明确且唯一指向另一器官时搬回，避免猜测。
function realignUpperAbdomenConclusions(items) {
  const result = (items || []).map(item => ({ ...item }));
  const pageGroups = new Map();
  result.forEach(item => {
    if (item.itemType !== 'imaging' || !/超声|彩超/.test(text(item.name))) return;
    const nameOrgan = upperOrganIndex(item.name);
    if (nameOrgan < 0) return;
    const page = Number(item._page || 0);
    if (!pageGroups.has(page)) pageGroups.set(page, []);
    pageGroups.get(page).push({ item, nameOrgan });
  });
  for (const group of pageGroups.values()) {
    if (new Set(group.map(row => row.nameOrgan)).size < 2) continue;
    for (const row of group) {
      for (const field of ['diagnosis', 'conclusion']) {
        const value = text(row.item[field]);
        const targetOrgan = upperOrganIndex(value);
        if (!value || targetOrgan < 0 || targetOrgan === row.nameOrgan) continue;
        const target = group.find(candidate => candidate.nameOrgan === targetOrgan);
        if (!target) continue;
        target.item[field] = [...new Set([text(target.item[field]), value].filter(Boolean))].join('；');
        row.item[field] = '';
      }
    }
  }
  return result;
}

function upperAbdomenCoverage(items) {
  return new Set((items || []).map(item => upperOrganIndex(item.name)).filter(index => index >= 0)).size;
}

module.exports = { normalizeDepartmentExamItems, normalizeBreathTestItems, normalizeSingleExamReportItems, realignUpperAbdomenConclusions, upperAbdomenCoverage };

