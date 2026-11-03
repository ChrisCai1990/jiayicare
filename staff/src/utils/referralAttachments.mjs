export function currentRecords(records, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) {
  return records.filter(r => !r.stopped && r.active !== false && !['pending', 'rejected'].includes(r.aiStatus)
    && (!r.startDate || String(r.startDate).slice(0, 10) <= today)
    && (!r.endDate || String(r.endDate).slice(0, 10) >= today));
}

const resultText = item => [item.name, item.value, item.unit,
  item.referenceRange ? `参考范围：${item.referenceRange}` : '', item.findings, item.diagnosis, item.conclusion]
  .filter(value => value !== undefined && value !== null && value !== '').join(' ');

export function screeningAttachments(items = [], reports = []) {
  const covered = new Set(items.map(item => String(item.reportId?._id || item.reportId || '')).filter(Boolean));
  const result = items.map(item => ({
    key: `item:${item._id}`,
    项目: item.itemLabel || item.name || '专项筛查',
    日期: item.checkDate || '未记录',
    机构: item.institution || '',
    报告: item.reportTitle || '',
    结果: (item.matchedItems?.length ? item.matchedItems : [item]).map(resultText).filter(Boolean).join('；') || '暂无结果',
    结果明细: (item.matchedItems?.length ? item.matchedItems : [item]).map(r => ({ name:r.name || item.itemLabel || '', value:r.value ?? '', unit:r.unit || '', referenceRange:r.referenceRange || '', status:r.status || 'unknown', findings:r.findings || '', conclusion:r.conclusion || r.diagnosis || '' })),
    备注: item.note || '',
  }));
  reports.filter(r => !covered.has(String(r._id)) && (r.screeningL1 || r.screeningCategory || r.screeningL2 || r.screeningL3))
    .forEach(r => result.push({ key: `report:${r._id}`, 项目: r.screeningL3 || r.title || '专项筛查',
      结果明细: (r.reportItems || []).map(i => ({ name:i.name || '', value:i.value ?? '', unit:i.unit || '', referenceRange:i.referenceRange || '', status:i.status || 'unknown', findings:i.findings || '', conclusion:i.conclusion || i.diagnosis || '' })), 检查所见:r.examDescription || '', 报告结论:r.examConclusion || '',
      日期: r.checkDate || '未记录', 机构: r.institution || r.hospital || '', 报告: r.title || '',
      结果: [r.examDescription, r.examConclusion, ...(r.reportItems || []).map(resultText)].filter(Boolean).join('；') || '暂无结果' }));
  return result;
}

export function diseaseHistoryAttachments(user = {}) {
  const section = user.coreHealthArchive?.disease;
  if (section?.records?.length) return section.records.map(r => ({
    疾病: r.disease || '未命名疾病', 确诊时间: r.diagnosedAt || '未记录', 诊断机构: r.institution || '',
    当前状态: r.status || '未记录', 状态变化时间: r.statusAt || '', 判断依据: r.evidence || '',
    治疗经过: r.treatment || '', 治疗效果: r.effect || '', 来源: r.source || '', 备注: r.note || '',
  }));
  if (section?.presence === 'none') return [{记录:'未报告已知相关疾病情况'}];
  if (section?.presence === 'unknown') return [{记录:'疾病史不详，需进一步核实'}];
  return [];
}
