const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('appointment insurance survives editing and backend handoff for all three choices', () => {
  const form = read('staff/src/components/MedicalProxyStageForm.jsx');
  const pure = form.slice(form.indexOf('const parseAppointmentRequirement'), form.indexOf('export function validateMedicalProxyStage'));
  const context = {};
  vm.runInNewContext(pure + '\nthis.parse = parseAppointmentRequirement; this.format = formatAppointmentRequirement;', context);
  const workflow = read('backend/src/utils/medicalProxyWorkflow.js');
  const insuranceLine = workflow.split('\n').find(line => line.includes('`费用与保险：'));
  for (const [value, label] of [['self_pay', '自费'], ['medical_insurance', '医保'], ['high_end', '使用高端医疗险']]) {
    const data = { baseContent: '测试医院；测试科室', clinicType: 'general', insuranceUse: value };
    const text = context.format(data);
    assert.ok(text.includes('费用与保险：' + label));
    assert.equal(context.parse(text).insuranceUse, value);
    assert.equal(context.format(context.parse(text)), text);
    assert.equal(vm.runInNewContext(insuranceLine.trim().replace(/,$/, ''), { plan: data }), '费用与保险：' + label);
    if (value !== 'high_end') assert.ok(!text.includes('结算方式：'));
  }
});

test('both staff selectors and backend request validation support medical insurance', () => {
  for (const file of ['staff/src/pages/PlansPage.jsx', 'staff/src/components/MedicalProxyStageForm.jsx']) {
    const line = read(file).split('\n').find(line => line.includes('费用与保险 *'));
    assert.ok(line.includes('<option value="medical_insurance">医保</option>'));
  }
  const route = read('backend/src/routes/staff.js').split('\n').find(line => line.includes('includes(req.body.insuranceUse)'));
  assert.ok(route.includes("['self_pay', 'medical_insurance', 'high_end']"));
});
