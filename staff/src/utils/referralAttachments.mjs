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
    备注: item.note || '',
  }));
  reports.filter(r => !covered.has(String(r._id)) && (r.screeningL1 || r.screeningCategory || r.screeningL2 || r.screeningL3))
    .forEach(r => result.push({ key: `report:${r._id}`, 项目: r.screeningL3 || r.title || '专项筛查',
      日期: r.checkDate || '未记录', 机构: r.institution || r.hospital || '', 报告: r.title || '',
      结果: [r.examDescription, r.examConclusion, ...(r.reportItems || []).map(resultText)].filter(Boolean).join('；') || '暂无结果' }));
  return result;
}
