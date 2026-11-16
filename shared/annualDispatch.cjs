function isExecution(task) { return ['annual_service', 'report_followup'].includes(task?.sourceType) && task.workflowKey === 'assistance_execute'; }
function isRequest(task) { return ['annual_service', 'report_followup'].includes(task?.sourceType) && ['service_request', 'report_followup:service_request'].includes(task.workflowKey) && task.formData?.serviceRequest?.mode === 'single' && require('./annualServiceItem.cjs').isBookingRequest(task); }
function dedicated(task) { return !!task?.careFlowId || require('./careFlow.cjs').isTask(task) || isExecution(task) || isRequest(task); }
const labels = { proxy_booking: '代办预约', proxy_visit: '代诊服务', escort_visit: '陪同就医', escort_exam: '陪同检查', consult_coordination: '会诊协调' };
module.exports = { isExecution, isRequest, dedicated, labels };
