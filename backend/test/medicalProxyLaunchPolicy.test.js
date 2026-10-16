const test = require('node:test');
const assert = require('node:assert/strict');
const { directExpertAppointment } = require('../src/utils/medicalProxyLaunchPolicy');

test('assigned health advisor can submit expert appointment without a manual entitlement order', () => {
  assert.equal(directExpertAppointment({ role: 'familyDoctor' }, { appointmentOnly: true }), true);
  assert.equal(directExpertAppointment({ role: 'healthPlanner' }, { appointmentOnly: true }), false);
  assert.equal(directExpertAppointment({ role: 'familyDoctor' }, { appointmentOnly: false }), false);
  assert.equal(directExpertAppointment({ role: 'familyDoctor' }, { appointmentOnly: true, medicationProxy: true }), false);
});
