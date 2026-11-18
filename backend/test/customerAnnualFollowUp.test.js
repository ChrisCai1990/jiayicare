const test = require('node:test');
const assert = require('node:assert/strict');
const { customerAnnualFollowUp } = require('../../shared/customerAnnualFollowUp.cjs');

test('annual follow-up exposes only customer arrangement fields', () => {
  const row = {
    sourceAnnualPlanId: 'plan', sourceScheduleKey: 'medical_treatment:2026-11-21',
    theme: '医疗问题解决·就医随访 · 医院',
    content: '预约安排日期：2026-11-21；建议就医/检查日期：2026-11-28。\n就医/会诊医院：眼科医院\n科室：眼科\n设置依据：内部审核 priority:0\n原因：内部病历\n执行人员：某专员',
  };
  const projected = customerAnnualFollowUp(row);
  assert.equal(projected.title, '眼科就医');
  assert.deepEqual(projected.details, ['建议就医：2026-11-28', '机构：眼科医院']);
  assert.doesNotMatch(JSON.stringify(projected), /设置依据|priority|内部病历|执行人员/);
  const repeated = customerAnnualFollowUp({ ...row, theme: projected.title, content: projected.details.join('\n') });
  assert.equal(repeated.title, projected.title);
});
