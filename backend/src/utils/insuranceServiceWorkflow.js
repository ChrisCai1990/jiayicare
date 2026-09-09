const INSURANCE_CASE_STEPS = {
  outpatient: ['核对门诊保障与医院网络', '确认是否需要转诊或预授权', '向客户发送就诊与材料提示', '收集票据及病历资料', '提交理赔并跟踪结果'],
  inpatient: ['核对住院保障与医院网络', '确认入院安排及费用预估', '申请预授权或直付', '向客户发送住院准备事项', '跟踪住院期间关键变化', '收集出院及费用材料', '提交理赔并核对赔付'],
  emergency: ['确认客户安全并建议按急诊流程处理', '核对急诊保障和报案时限', '通知保险公司并记录受理号', '收集急诊病历及费用材料', '提交理赔并跟踪结果'],
  special_drug: ['核对特药保障条件', '收集诊断、处方及病理资料', '申请用药预授权', '确认购药渠道及直付方式', '跟踪审批、购药及理赔'],
  reimbursement: ['登记本次医疗费用与就诊情况', '核对保障责任及提交时限', '按清单收集和检查材料', '提交理赔并记录受理号', '跟踪补件与赔付结果'],
  dispute: ['登记拒赔或争议原因', '复核条款及原申请材料', '联系保险公司取得书面说明', '补充证据或发起复议', '向客户反馈最终结果'],
};

function stepsForInsuranceScenario(scene) {
  return [...(INSURANCE_CASE_STEPS[scene] || INSURANCE_CASE_STEPS.reimbursement)];
}

module.exports = { INSURANCE_CASE_STEPS, stepsForInsuranceScenario };
