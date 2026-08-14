const test = require('node:test');
const assert = require('node:assert/strict');
const { nextAnnualCheckupDate, hepatitisBAllNegative, conciseTitle } = require('../src/utils/annualPlanGeneration');

test('annual checkup is scheduled eleven months after the latest exam', () => {
  assert.equal(nextAnnualCheckupDate([{ checkDate: '2025-09-20' }, { checkDate: '2024-12-01' }]), '2026-08-20');
  assert.equal(nextAnnualCheckupDate([{ checkDate: '2025-03-31' }]), '2026-02-28');
});

test('detects all five hepatitis B markers as negative', () => {
  const names = ['乙肝表面抗原', '乙肝表面抗体', '乙肝e抗原', '乙肝e抗体', '乙肝核心抗体'];
  assert.equal(hepatitisBAllNegative([{ checkDate: '2025-08-01', reportItems: names.map(name => ({ name, value: '阴性' })) }]), true);
});

test('project titles keep only a short action phrase', () => {
  assert.equal(conciseTitle('肺部CT磨玻璃结节年度复查：预约低剂量胸部CT，重点对比'), '肺部CT磨玻璃结节年度复查');
});
