const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('all clinic and payment choices survive advisor editing and booking handoff', () => {
  const form = read('staff/src/components/MedicalProxyStageForm.jsx');
  const pure = form.slice(form.indexOf('const parseAppointmentRequirement'), form.indexOf('export function validateMedicalProxyStage'));
  const context = {};
  vm.runInNewContext(pure + '\nthis.parse = parseAppointmentRequirement; this.format = formatAppointmentRequirement;', context);
  const workflow = read('backend/src/utils/medicalProxyWorkflow.js');
  const insuranceLine = workflow.split('\n').find(line => line.includes('`费用与保险：'));
  const clinicLine = workflow.split('\n').find(line => line.includes('`门诊类型：'));
  for (const [clinicType, clinicLabel] of [['general', '普通门诊'], ['expert', '专家门诊'], ['special', '特需门诊'], ['international', '国际门诊']]) for (const [value, label] of [['self_pay', '自费'], ['medical_insurance', '医保'], ['commercial_insurance', '商保']]) {
    const data = { baseContent: '测试医院；测试科室', clinicType, insuranceUse: value };
    const text = context.format(data);
    assert.ok(text.includes('门诊类型：' + clinicLabel));
    assert.equal(context.parse(text).clinicType, clinicType);
    assert.ok(text.includes('费用与保险：' + label));
    assert.equal(context.parse(text).insuranceUse, value);
    assert.equal(context.format(context.parse(text)), text);
    assert.equal(vm.runInNewContext(insuranceLine.trim().replace(/,$/, ''), { plan: data }), '费用与保险：' + label);
    assert.equal(vm.runInNewContext(clinicLine.trim().replace(/,$/, ''), { plan: data }), '门诊类型：' + clinicLabel);
    if (value !== 'commercial_insurance') assert.ok(!text.includes('结算方式：'));
  }
  const legacy = '测试医院；门诊类型：国际门诊；费用与保险：使用高端医疗险；结算方式：直付';
  assert.equal(context.parse(legacy).insuranceUse, 'high_end');
  assert.equal(context.format(context.parse(legacy)), legacy);
});

test('both staff selectors and backend request validation support all new choices', () => {
  for (const file of ['staff/src/pages/PlansPage.jsx', 'staff/src/components/MedicalProxyStageForm.jsx']) {
    const line = read(file).split('\n').find(line => line.includes('费用与保险 *'));
    assert.ok(line.includes('<option value="medical_insurance">医保</option>'));
    assert.ok(line.includes('<option value="commercial_insurance">商保</option>'));
    const clinic = read(file).split('\n').find(line => line.includes('门诊类型 *'));
    for (const value of ['general', 'expert', 'special', 'international']) assert.ok(clinic.includes(`<option value="${value}">`));
  }
  const route = read('backend/src/routes/staff.js').split('\n').find(line => line.includes('includes(req.body.insuranceUse)'));
  assert.ok(route.includes("['self_pay', 'medical_insurance', 'commercial_insurance', 'high_end']"));
  assert.ok(route.includes("['general', 'expert', 'special', 'international']"));
});
