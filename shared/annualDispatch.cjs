function isExecution(task) { return task?.sourceType === 'annual_service' && task.workflowKey === 'assistance_execute'; }
function isRequest(task) { return task?.sourceType === 'annual_service' && task.workflowKey === 'service_request' && require('./annualServiceItem.cjs').isBookingRequest(task); }
function dedicated(task) { return isExecution(task) || isRequest(task); }
const labels = { proxy_booking: '代办预约', proxy_visit: '代诊服务', escort_visit: '陪同就医', escort_exam: '陪同检查', consult_coordination: '会诊协调' };
module.exports = { isExecution, isRequest, dedicated, labels };
