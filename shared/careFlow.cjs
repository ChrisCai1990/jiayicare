const stages = ['advisor', 'booking', 'planner', 'execute', 'upload', 'audit', 'draft', 'review'];
const labels = { advisor: '顾问确认交接', booking: '健管预约', planner: '规划师派单', execute: '就医专员执行', upload: '报告及资料上传', audit: '健管审核资料', draft: '生成随访草稿', review: '顾问审核随访', closed: '服务结束' };
const roles = { advisor: 'familyDoctor', booking: 'healthManager', planner: 'healthPlanner', execute: 'medicalAssistant', upload: 'medicalAssistant', audit: 'healthManager', draft: 'healthManager', review: 'familyDoctor' };
const categories = { missing: '信息或资料遗漏', inaccurate: '内容不准确', handoff: '交接不清晰', system: '系统问题', customer: '客户需求变化', hospital: '医院安排变化', other: '其他（需说明）' };
const isTask = task => task?.sourceType === 'annual_service' && String(task.workflowKey || '').startsWith('care_flow:');
function targets(state) {
  return stages.slice(0, stages.indexOf(state.stage)).filter(s => s !== 'draft' && !(state.returns || []).some(r => r.from === s));
}
module.exports = { stages, labels, roles, categories, isTask, targets };
