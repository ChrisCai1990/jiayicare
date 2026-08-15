// 年度专项筛查小结的确定性输入整理。
// 不把去重和器官归属交给 AI，避免同一项目输出多行或把脾脏结果写进肝癌早筛。

const ORGAN_PROJECTS = [
  { pattern: /脾脏|脾彩超|脾超声/, project: '胰腺-胆囊-脾脏癌早筛' },
  { pattern: /胆囊|胆囊彩超|胆囊超声/, project: '胰腺-胆囊-脾脏癌早筛' },
  { pattern: /胰腺|胰腺彩超|胰腺超声/, project: '胰腺-胆囊-脾脏癌早筛' },
  { pattern: /肝脏|肝彩超|肝超声/, project: '肝癌早筛' },
];

function projectNameForItem(item, report) {
  const key = String(item?.screeningKey || '');
  const keyParent = key.split('|')[1];
  let projectName = keyParent || item?.screeningParent || report?.screeningL2 || report?.title || '其他项目';
  if (item?.itemType === 'imaging') {
    const identity = `${item.name || ''} ${item.bodyPart || ''} ${item.sourceSection || ''}`;
    const matches = ORGAN_PROJECTS.filter(rule => rule.pattern.test(identity));
    if (matches.length === 1) projectName = matches[0].project;
  }
  return projectName;
}

function resolveConfiguredProjectName(projectName, projectOrder) {
  if (projectOrder.has(projectName)) return projectName;
  if (projectName === '胰腺-胆囊-脾脏癌早筛') {
    return [...projectOrder.keys()].find(name => /胰腺.*胆囊.*(?:脾|癌早筛)/.test(name)) || projectName;
  }
  return projectName;
}

function isNormalOnlyConclusion(value) {
  const text = String(value || '')
    .trim()
    .replace(/^(?:主要)?结论\s*[：:]\s*(?:\d+\s*[、.．]\s*)?/i, '')
    .replace(/[。；;，,\s]+$/g, '');
  if (!text) return true;
  // 先移除明确的正常语义，再检查剩余内容是否含异常证据。
  // 这样可以排除“胸部CT平扫未见明显病变”，但保留“肺结节，其余未见异常”。
  const withoutNormalPhrases = text
    .replace(/未见(?:明显)?(?:异常(?:声像)?|病变|占位(?:性病变)?)/g, '')
    .replace(/无(?:明显)?异常/g, '')
    .replace(/大致正常|基本正常|阴性|正常/g, '');
  const abnormalEvidence = /结节|斑块|囊肿|钙化|增生|肥大|反流|异常|增高|升高|降低|减低|阳性|强回声|低回声|高回声|占位|病变|增粗|增厚|狭窄|扩张|积液|硬化|脂肪肝|纤维化|息肉|炎症|癌|瘤/i;
  if (abnormalEvidence.test(withoutNormalPhrases)) return false;
  return /(?:未见(?:明显)?(?:异常(?:声像)?|病变|占位(?:性病变)?)|无(?:明显)?异常|大致正常|基本正常|阴性|正常)/.test(text);
}

function buildSummaryInputGroups(reports, bucketKey, categoryBucket, projectOrder = new Map()) {
  const grouped = new Map();
  (reports || []).forEach(report => {
    const reportItems = [...(report.reportItems || [])];
    // 人工录入的检查单主要结论单独保存在 examMainConclusions，
    // 必须和 OCR 检查项的 conclusion 一起纳入年度小结。
    Object.entries(report.examMainConclusions || {}).forEach(([name, conclusion]) => {
      if (!String(conclusion || '').trim()) return;
      const duplicated = reportItems.some(item =>
        item.itemType === 'imaging'
        && item.name === name
        && String(item.conclusion || '').trim() === String(conclusion).trim());
      if (!duplicated) reportItems.push({
        name,
        itemType: 'imaging',
        status: 'unknown',
        conclusion,
        screeningCategory: report.screeningCategory,
        screeningParent: report.screeningL2,
      });
    });

    reportItems.forEach(item => {
      const isImaging = item.itemType === 'imaging';
      const mainConclusion = String(item.conclusion || '').trim();
      // 检验项目按 abnormal/attention 筛选；检查项目只按审核后的“主要结论”纳入，不依赖 status。
      if (isImaging ? isNormalOnlyConclusion(mainConclusion) : !['abnormal', 'attention'].includes(item.status)) return;
      const projectName = resolveConfiguredProjectName(projectNameForItem(item, report), projectOrder);
      if (categoryBucket(item.screeningCategory || report.screeningCategory, report.screeningL1 || '', projectName) !== bucketKey) return;
      if (!grouped.has(projectName)) grouped.set(projectName, {
        projectName, reportIds: [], sourceMaterials: [], conclusions: [],
      });
      const group = grouped.get(projectName);
      const reportId = String(report._id);
      if (!group.reportIds.includes(reportId)) group.reportIds.push(reportId);
      let material = group.sourceMaterials.find(entry => entry.reportId === reportId);
      if (!material) {
        material = { reportId, itemNames: [] };
        group.sourceMaterials.push(material);
      }
      if (item.name && !material.itemNames.includes(item.name)) material.itemNames.push(item.name);
      group.conclusions.push({
        name: item.name, value: item.value, status: item.status, itemType: item.itemType || 'lab',
        conclusion: isImaging ? mainConclusion : '',
      });
    });
  });
  return [...grouped.values()].sort((a, b) =>
    (projectOrder.get(a.projectName) ?? 99999) - (projectOrder.get(b.projectName) ?? 99999));
}

function ensureLpla2InCardiovascularSummary(summary, groups) {
  const text = String(summary || '');
  if (/Lp[-\s]?PLA2|脂蛋白(?:相关)?磷脂酶A2/i.test(text)) return text;

  const group = (groups || []).find(entry =>
    (entry.conclusions || []).some(item =>
      ['abnormal', 'attention'].includes(item.status)
      && /Lp[-\s]?PLA2|脂蛋白(?:相关)?磷脂酶A2/i.test(String(item.name || ''))));
  if (!group) return text;

  const item = group.conclusions.find(entry =>
    ['abnormal', 'attention'].includes(entry.status)
    && /Lp[-\s]?PLA2|脂蛋白(?:相关)?磷脂酶A2/i.test(String(entry.name || '')));
  const value = String(item.value || '').trim();
  const conclusion = String(item.conclusion || '').trim();
  let detail;
  if (conclusion) {
    detail = /Lp[-\s]?PLA2|脂蛋白(?:相关)?磷脂酶A2/i.test(conclusion)
      ? conclusion
      : `脂蛋白磷脂酶A2：${conclusion}`;
  } else {
    const statusText = { normal: '正常', abnormal: '异常', attention: '需关注' }[item.status] || '已检查';
    detail = `脂蛋白磷脂酶A2${statusText}${value ? `（${value}）` : ''}`;
  }

  const lines = text.split(/\n+/).filter(Boolean);
  const lineIndex = lines.findIndex(line => line.trim().startsWith(`${group.projectName}：`) || line.trim().startsWith(`${group.projectName}:`));
  if (lineIndex >= 0) {
    lines[lineIndex] = `${lines[lineIndex].replace(/[。；;\s]+$/, '')}；${detail}。`;
  } else {
    lines.push(`${group.projectName}：${detail}。`);
  }
  return lines.join('\n');
}

function conclusionTextForItem(item) {
  const name = String(item?.name || '').trim();
  const value = String(item?.value || '').trim();
  const conclusion = String(item?.conclusion || '').trim();
  if (item?.itemType === 'imaging' && conclusion) {
    return name && !conclusion.includes(name) ? `${name}：${conclusion}` : conclusion;
  }
  const statusText = item?.status === 'attention' ? '需关注' : '异常';
  return `${name || '检查项目'}${statusText}${value ? `（${value}）` : ''}`;
}

// 最终小结由已审核的异常项确定性生成，不能让模型选择性省略检查。
// 同一项目合并成一行，并按目录顺序保留每一条异常/需关注结论。
function buildDeterministicSummary(groups) {
  return (groups || []).map(group => {
    const details = [];
    (group.conclusions || []).forEach(item => {
      if (item.itemType === 'imaging' ? isNormalOnlyConclusion(item.conclusion) : !['abnormal', 'attention'].includes(item.status)) return;
      const detail = conclusionTextForItem(item);
      if (detail && !details.includes(detail)) details.push(detail);
    });
    return details.length ? `${group.projectName}：${details.join('；')}。` : '';
  }).filter(Boolean).join('\n');
}

module.exports = {
  buildSummaryInputGroups,
  projectNameForItem,
  resolveConfiguredProjectName,
  isNormalOnlyConclusion,
  ensureLpla2InCardiovascularSummary,
  buildDeterministicSummary,
};
