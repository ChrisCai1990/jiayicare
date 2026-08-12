const text = value => String(value || '').trim();

const URINE_ROUTINE = /尿常规|尿液(?:综合|干化学|有形成分|沉渣)?分析|尿干化学|尿沉渣/;
const STOOL_ROUTINE = /粪便常规|大便常规|便常规|粪便检查|大便检查/;
const URINE_SPECIAL = /尿生化|尿肾功能|尿微量白蛋白|微量尿(?:白)?蛋白|尿肌酐|尿白蛋白.*肌酐|尿肌酐比值|尿蛋白定量|\b(?:mALB|MAU|UCr|ACR)\b/i;
const STOOL_OCCULT_ONLY = /^(?:粪便|大便|便)?(?:隐血|潜血)(?:试验|检测)?$|^FIT$/i;

function panelKind(item) {
  if (item?.itemType !== 'lab') return '';
  const name = text(item.name);
  const group = `${text(item.orderName)} ${text(item.sourceSection)}`;
  const context = `${name} ${group}`;
  if (URINE_SPECIAL.test(context)) return '';
  if (URINE_ROUTINE.test(group) || /^(?:尿常规|尿液分析)$/.test(name)) return 'urine';
  if (STOOL_ROUTINE.test(group) || /^(?:粪便常规|大便常规|便常规|粪便检查)$/.test(name)) return 'stool';
  return '';
}

function panelStatus(rows) {
  const statuses = rows.map(row => text(row.status));
  if (statuses.includes('abnormal')) return 'abnormal';
  if (statuses.includes('attention')) return 'attention';
  return statuses.length && statuses.every(status => status === 'normal') ? 'normal' : 'unknown';
}

function findingLine(row) {
  const name = text(row.name);
  if (/^(?:尿常规|粪便常规|大便常规|便常规|粪便检查)$/.test(name) && text(row.findings)) return text(row.findings);
  const value = text(row.value || row.findings || row.diagnosis || row.conclusion);
  if (!name || !value) return '';
  const unit = text(row.unit);
  return `${name}：${value}${unit && !value.endsWith(unit) ? unit : ''}`;
}

function aggregateUrineStoolPanels(items) {
  const list = items || [];
  const groups = new Map();
  list.forEach((item, index) => {
    const kind = panelKind(item);
    if (!kind) return;
    const name = text(item.name);
    const group = `${text(item.orderName)} ${text(item.sourceSection)}`;
    if (kind === 'stool' && STOOL_OCCULT_ONLY.test(name) && !STOOL_ROUTINE.test(group)) return;
    if (!groups.has(kind)) groups.set(kind, { firstIndex: index, rows: [] });
    groups.get(kind).rows.push(item);
  });
  if (!groups.size) return list;

  const output = [];
  list.forEach((item, index) => {
    const kind = panelKind(item);
    const group = kind && groups.get(kind);
    if (!group || !group.rows.includes(item)) { output.push(item); return; }
    if (index !== group.firstIndex) return;
    const label = kind === 'urine' ? '尿常规' : '粪便常规';
    output.push({
      ...group.rows[0], name: label, itemType: 'lab', orderName: label,
      sourceSection: text(group.rows[0].sourceSection || group.rows[0].orderName) || label,
      value: '', unit: '', referenceRange: '',
      findings: group.rows.map(findingLine).filter(Boolean).join('\n'),
      diagnosis: '', conclusion: '', status: panelStatus(group.rows),
    });
  });
  return output;
}

module.exports = { aggregateUrineStoolPanels, panelKind };
