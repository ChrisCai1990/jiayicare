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

function buildSummaryInputGroups(reports, bucketKey, categoryBucket, projectOrder = new Map()) {
  const grouped = new Map();
  (reports || []).forEach(report => {
    (report.reportItems || []).forEach(item => {
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
        name: item.name, value: item.value, status: item.status,
        conclusion: item.conclusion || item.diagnosis || item.findings || '',
      });
    });
  });
  return [...grouped.values()].sort((a, b) =>
    (projectOrder.get(a.projectName) ?? 99999) - (projectOrder.get(b.projectName) ?? 99999));
}

module.exports = { buildSummaryInputGroups, projectNameForItem, resolveConfiguredProjectName };
