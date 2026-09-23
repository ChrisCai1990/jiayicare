const stages = ['advisor', 'booking', 'planner', 'execute', 'upload', 'audit', 'draft', 'review'];
const labels = { advisor: '顾问确认交接', booking: '健管预约', planner: '规划师派单', execute: '就医专员执行', upload: '报告及资料上传', audit: '健管审核资料', draft: '生成随访草稿', review: '顾问审核随访', closed: '服务结束' };
const roles = { advisor: 'familyDoctor', booking: 'healthManager', planner: 'healthPlanner', execute: 'medicalAssistant', upload: 'healthManager', audit: 'healthManager', draft: 'healthManager', review: 'familyDoctor' };
const categories = { missing: '信息或资料遗漏', inaccurate: '内容不准确', handoff: '交接不清晰', system: '系统问题', customer: '客户需求变化', hospital: '医院安排变化', other: '其他（需说明）' };
function problemLabels(stage) {
  const common = { system: categories.system, customer: categories.customer, hospital: categories.hospital, other: categories.other };
  const specific = {
    advisor: { missing: '就医目的、检查项目或依据缺失', inaccurate: '项目、科室或专家要求需顾问核对', handoff: '需明确向专家沟通的问题' },
    booking: { missing: '预约日期、时间或预约结果缺失', inaccurate: '预约结果与顾问要求不一致', handoff: '现场预约条件或交接说明不清楚' },
    planner: { missing: '办理人员或派单安排未落实', inaccurate: '人员或服务安排不匹配', handoff: '派单任务或分工不清楚' },
    execute: { missing: '实际办理结果或专家反馈缺失', inaccurate: '办理结果与交接要求不一致', handoff: '未完成事项及后续安排不清楚' },
    upload: { missing: '报告、病历或医嘱资料缺失', inaccurate: '资料归属、日期或文件有误', handoff: '资料对应事项及完整性说明不清楚' },
    audit: { missing: '资料审核未完成或审核意见缺失', inaccurate: '报告内容或审核结论需核对', handoff: '审核后的待跟进事项不明确' },
  };
  return { ...(specific[stage] || {}), ...common };
}
const isTask = task => task?.sourceType === 'annual_service' && String(task.workflowKey || '').startsWith('care_flow:');
function targets(state) {
  return stages.slice(0, stages.indexOf(state.stage)).filter(s => s !== 'draft' && !(state.returns || []).some(r => r.from === s));
}
module.exports = { stages, labels, roles, categories, problemLabels, isTask, targets };
