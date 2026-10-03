const TOPICS = [
  '年度变化与资料来源：核对健康档案、报告、既往方案及执行反馈；逐项标注时间与来源。',
  '优先管理问题：区分已确认事实、风险提示和待补资料，明确排序依据。',
  '年度管理目标：逐项写明目标、可核对的完成标准与复评时间；缺少基线时先列待核实项，不推测数值。',
  '干预与服务分工：分别讨论健康顾问、营养师、健管专员及就医协助需要做的事、责任人和触发条件。',
  '客户行动与执行障碍：确认客户可执行的行动、意愿、限制和需要协调的资源。',
  '方案交接与复评：列明需要进入年度方案的事项、营养相关事项、待确认事项及下次复评节点。',
];

const titleForYear = year => `${year}年度综合研判`;
const descriptionForYear = year => `${year}年度方案制定前的综合研判。请围绕以下固定议题讨论，引用已审核资料和专业评估，不重复录入原始数据；结论由健康顾问逐项核实后确认。\n${TOPICS.map((topic, index) => `${index + 1}. ${topic}`).join('\n')}`;
const outputGuide = '按六项固定议题输出：事实及来源、优先问题、管理目标及完成标准、分岗干预重点、待补资料、年度方案交接与复评时间。区分已确认与待确认，不编造检查值或诊断。';

function annualReviewForYear(reviews = [], year) {
  return reviews.find(item => item.reviewType === 'annual' && item.annualPlanYear && Number(item.annualPlanYear) === Number(year));
}

module.exports = { TOPICS, titleForYear, descriptionForYear, outputGuide, annualReviewForYear };
