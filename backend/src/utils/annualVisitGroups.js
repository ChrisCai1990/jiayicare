const MODULE_DATES = { medical_treatment: 'visit_time', checkup_completion: 'time', abnormal_followup: 'time' };
const text = value => typeof value === 'string' ? value.trim() : '';
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const hospitalIdentity = value => {
  const name = text(value).replace(/[\s（）()·・]/g, '');
  return /^(?:浙二医院|浙大二院|浙江大学医学院附属二院|浙江大学医学院附属第二医院)$/.test(name)
    ? '浙江大学医学院附属第二医院' : name;
};
const title = (row, moduleKey) => text(row.items || row.name || row.reason || row.standardPlanName) || ({ medical_treatment: '就医安排', checkup_completion: '体检完善', abnormal_followup: '异常复查' }[moduleKey]);

function visitGroups(data = {}) {
  const groups = new Map();
  for (const [moduleKey, dateKey] of Object.entries(MODULE_DATES)) {
    if (data[moduleKey]?.enabled === false) continue;
    (data[moduleKey]?.records || []).forEach((row, index) => {
      const id = text(row.visitGroupId);
      if (!id) return;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ moduleKey, index, row, date: text(row[dateKey]), hospital: hospitalIdentity(row.hospital), title: title(row, moduleKey) });
    });
  }
  return groups;
}

function validateVisitGroups(data = {}) {
  for (const [moduleKey, dateKey] of Object.entries(MODULE_DATES)) {
    if (data[moduleKey]?.enabled === false) continue;
    for (const row of data[moduleKey]?.records || []) {
      if (row.serviceMode === 'shared' && !text(row.visitGroupId)) return '随同本次就诊的事项请填写同次就诊名称';
      if (text(row.visitGroupId) && !/^[^\r\n]{1,80}$/.test(text(row.visitGroupId))) return '同次就诊名称须为80字以内的单行文字';
      if (row.serviceMode === 'shared' && !text(row[dateKey])) return '随同本次就诊的事项请填写日期';
    }
  }
  for (const [id, entries] of visitGroups(data)) {
    const leaders = entries.filter(e => e.row.serviceMode === 'single');
    if (leaders.length !== 1 || entries.some(e => !['single', 'shared'].includes(e.row.serviceMode))) return `“${id}”须恰好有一项单项服务，其余选择随同本次就诊`;
    if (entries.some(e => !validDay(e.date) || e.date !== leaders[0].date)) return `“${id}”的就诊日期须一致且有效`;
    if (entries.some(e => !e.hospital || e.hospital !== leaders[0].hospital)) return `“${id}”的就诊医院须一致；不同医院请分别派单`;
  }
  return '';
}

function sharedVisitItems(data, id) {
  return (visitGroups(data).get(text(id)) || []).map(({ moduleKey, index, row, title }) => ({
    moduleKey, recordIndex: index, title, reason: text(row.reason || row.purpose),
    basisSummary: text(row.basisSummary), goal: text(row.goal), completionStandard: text(row.completionStandard),
    communicationContent: text(row.communicationContent), customerAction: text(row.customerAction),
    precautions: text(row.precautions || row.notes), issueId: row.issueId || null, issueIds: row.issueIds || [],
  }));
}

module.exports = { MODULE_DATES, visitGroups, validateVisitGroups, sharedVisitItems };
