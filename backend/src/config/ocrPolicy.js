// OCR v2 policy metadata. The detailed, proven extraction rules remain in
// REPORT_PARSE_PROMPT in routes/staff.js for backward compatibility. New
// rules must be classified here before being appended to a model prompt.
const OCR_POLICY_VERSION = 'v2.0';

const OCR_POLICY_BUCKETS = Object.freeze({
  model: '模型抄录规则：只描述原件可见内容和结构化字段',
  validator: '程序校验规则：数值、参考范围、完整性和冲突',
  template: '模板规则：机构/版式的页面与栏目预期',
  review: '人工审核规则：异常、冲突、低置信和疑似重复',
});

const OCR_V2_EXTRACTION_CONTRACT = `【OCR v2 核心约束】只逐字抄录当前原件可见的项目、数值、单位、参考范围及检查原文；不得给出医学解释、不得猜测缺失值、不得自行判定正常/异常、不得把摘要页内容复制为明细项目。每条必须保留原报告页码和所属栏目。`;

module.exports = { OCR_POLICY_VERSION, OCR_POLICY_BUCKETS, OCR_V2_EXTRACTION_CONTRACT };
