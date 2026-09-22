// Build one executable example from the same template/source identifiers validated at runtime.
function annualGenerationExample(catalog, evidence, allowedKeys) {
  const sourceIds = evidence.length ? [evidence[0].id] : [];
  const example = { templateNodes: [] };
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup']) {
    const template = catalog.find(item => item.category === key);
    const row = { standardPlanId: template?.id, basisSummary: '必须引用输入中明确的原建议，不得虚构', sourceIds, timingBaseDate: '', timingIntervalMonths: null, timingReason: '根据来源检查日期评估间隔及具体建议日期，交顾问审核', hospital: '' };
    if (key === 'annual_checkup') {
      example[key] = template ? { ...row, focus: '仅填写有来源的体检重点，无依据返回空对象', date: '待确认', escort: false } : {};
    } else {
      const details = key === 'medical_treatment' ? { reason: '来源明确的本次就医建议', department: '来源科室', visit_time: '待确认' }
        : key === 'vaccine' ? { name: '来源明确的疫苗名称', reason: '来源原建议', time: '待确认' }
          : { items: '来源明确的本次项目', reason: '来源原建议', time: '待确认', department: '建议检查科室，交顾问审核', order_dept: '建议开单科室，交顾问审核' };
      example[key] = template ? [{ ...row, ...details, frequency: '单次', precautions: '待检查机构确认', customerAction: '按审核后安排执行', ownerRole: '健管专员' }] : [];
    }
  }
  const personalized = catalog.find(item => item.category === 'personalized');
  if (personalized) example.templateNodes = [{ standardPlanId: personalized.id, standardPlanName: personalized.name, basisSummary: '来源原建议', sourceIds, matchReason: '适用依据', personalization: '', executionDate: '待确认' }];
  if (allowedKeys.includes('specialist_collab')) example.specialist_collab = [];
  if (allowedKeys.includes('lifestyle')) example.lifestyle = {};
  const linked = Object.values(example).flatMap(value => Array.isArray(value) ? value : [value]).some(row => row.sourceIds?.length);
  example.evidenceCoverage = evidence.map((item, index) => ({ sourceId: item.id, status: index === 0 && linked ? 'included' : 'deferred', reason: '示例占位：必须逐项填写真实处理原因，不得照抄' }));
  return example;
}
function annualGenerationPrompt(prompt, catalog, evidence, allowedKeys) {
  const marker = '请严格按以下JSON格式输出，仅输出JSON：';
  const start = prompt.indexOf(marker);
  if (start < 0) throw new Error('年度输出协议缺失');
  return prompt.slice(0, start) + marker + '\n' + JSON.stringify(annualGenerationExample(catalog, evidence, allowedKeys), null, 2)
    + '\n以上是字段结构示例，不是客户建议。无依据的类别返回空数组，年度体检返回空对象；不要为填满示例而新增事项。每条事项（包括年度体检和个性化事项）都必须包含basisSummary及非空sourceIds，且来源ID必须来自下方清单。不得输出未允许模块，包括monitoring。'
    + '\n【必须逐项核对的来源】' + JSON.stringify(evidence)
    + '\n每个来源在evidenceCoverage中恰好出现一次，status仅限included/deferred/not_applicable；reason必须具体。included必须有事项的sourceIds引用；存在矛盾或信息不足时deferred交顾问确认，不自行编造。项目名称简短。'
    + '\n日期为AI建议就医/复查日期，不是已预约：以原检查日期timingBaseDate（YYYY-MM-DD）起算，根据已审来源及风险评估间隔timingIntervalMonths，换算具体visit_time/time/date（YYYY-MM-DD）；timingReason解释依据及不确定性，供健康顾问审核。已有明确医嘱优先。不能因尚未预约就全部填待确认；无法可靠确定基准或间隔才留空并说明，不得捏造检查日期。预约安排日期由系统提前7天计算，不由AI重复生成。科室可给初步建议；医院和专家不确定留空，不把偏好当已预约。focus必须为逐行文本，不得为对象。';
}
function annualGenerationError(message) {
  let result = String(message || '生成未完成，请稍后重试');
  for (const [key, label] of Object.entries({ annual_checkup: '年度体检', medical_treatment: '就医安排', checkup_completion: '完善检查', abnormal_followup: '异常复查', vaccine: '疫苗接种', templateNodes: '个性化事项', monitoring: '监测' })) result = result.split(key).join(label);
  return result;
}
module.exports = { annualGenerationExample, annualGenerationPrompt, annualGenerationError };
