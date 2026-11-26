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
    const reminders = entries.every(e => e.row.serviceMode === 'reminder');
    const leaders = entries.filter(e => ['single', 'managed'].includes(e.row.serviceMode));
    if (!reminders && (leaders.length !== 1 || entries.some(e => !['single', 'managed', 'shared'].includes(e.row.serviceMode)))) return `“${id}”须全部为仅提醒，或恰好有一项单项或一站式服务、其余随同办理`;
    if (entries.some(e => !validDay(e.date) || e.date !== entries[0].date)) return `“${id}”的就诊日期须一致且有效`;
    if ((!reminders && entries.some(e => !e.hospital)) || entries.some(e => e.hospital !== entries[0].hospital)) return `“${id}”的就诊医院须一致；不同医院请分别安排`;
  }
  const byDateAndHospital = new Map();
  for (const [moduleKey, dateKey] of Object.entries(MODULE_DATES)) {
    if (data[moduleKey]?.enabled === false) continue;
    for (const row of data[moduleKey]?.records || []) {
      const date = text(row[dateKey]), hospital = hospitalIdentity(row.hospital);
      if (!validDay(date) || !hospital || /待定|待确认|待核|或|就近/.test(hospital)) continue;
      const key = JSON.stringify([date, hospital]);
      if (!byDateAndHospital.has(key)) byDateAndHospital.set(key, []);
      byDateAndHospital.get(key).push(row);
    }
  }
  for (const [key, rows] of byDateAndHospital) {
    if (rows.length < 2) continue;
    const assisted = rows.some(row => ['single', 'managed', 'shared'].includes(row.serviceMode));
    if (assisted && rows.some(row => !row.visitGroupId || row.visitGroupId !== rows[0].visitGroupId)) {
      const [date, hospital] = JSON.parse(key);
      return `${date} ${hospital}：请归为同次就诊，生成一条就医协助任务，各项目保留各自科室`;
    }
    const unresolved = rows.some((row, index) => rows.slice(index + 1).some(other =>
      (!row.visitGroupId || row.visitGroupId !== other.visitGroupId)
      && !(row.visitMergeConfirmed && other.visitMergeConfirmed && row.visitGroupId && other.visitGroupId)
      && !text(row.scheduleSeparationReason) && !text(other.scheduleSeparationReason)));
    if (unresolved) {
      const [date, hospital] = JSON.parse(key);
      return `${date} ${hospital}有同日就医和检查尚未核对：请归为同次就诊，确需分开则写明实际原因`;
    }
  }
  return '';
}

function sharedVisitItems(data, id) {
  return (visitGroups(data).get(text(id)) || []).map(({ moduleKey, index, row, title }) => {
    const examExpert = text(row.expert || (row.expertSnapshots || []).map(item => item.name).join('、'));
    const orderExpert = text(row.order_expert || (row.orderExpertSnapshots || []).map(item => item.name).join('、'));
    return {
    moduleKey, recordIndex: index, requestedService: row.requestedVisitService || row.serviceType || row.managedServiceType || '', title: row.reviewItems?.join('、') || title,
    department: text(moduleKey === 'abnormal_followup' && row.reviewGroupVersion === 1
      ? row.order_dept || row.department : row.department || row.order_dept),
    expert: text(moduleKey === 'abnormal_followup' && row.reviewGroupVersion === 1
      ? orderExpert || examExpert : examExpert || orderExpert),
    orderDepartment: text(row.order_dept), orderExpert,
    examDepartment: text(row.department), examExpert,
    reason: text(row.reason || row.purpose),
    basisSummary: text(row.basisSummary), goal: text(row.goal), completionStandard: text(row.completionStandard),
    communicationContent: text(row.communicationContent), customerAction: text(row.customerAction),
    precautions: text(row.precautions || row.notes), issueId: row.issueId || null, issueIds: row.issueIds || [],
  };
  });
}

module.exports = { MODULE_DATES, visitGroups, validateVisitGroups, sharedVisitItems, hospitalIdentity };
