const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isLifestylePatientUpdate } = require('../src/utils/lifestylePatientUpdate');

test('nutritionist lifestyle updates accept change-record metadata', () => {
  assert.equal(isLifestylePatientUpdate({ lifestyle: { sleep: '22:00' } }), true);
  assert.equal(isLifestylePatientUpdate({ lifestyle_data: { diet: 'regular' } }), true);
  assert.equal(isLifestylePatientUpdate({
    lifestyle: { sleep: '22:00' },
    _lifestyleChangeMeta: { effectiveAt: '2026-10-23', healthStatusChange: 'Improved sleep' },
  }), true);
});

test('nutritionist lifestyle exception does not allow other patient edits', () => {
  assert.equal(isLifestylePatientUpdate({ _lifestyleChangeMeta: { effectiveAt: '2026-10-23' } }), false);
  assert.equal(isLifestylePatientUpdate({ lifestyle: { sleep: '22:00' }, name: 'Changed' }), false);
  assert.equal(isLifestylePatientUpdate({}), false);
});
