const test = require('node:test');
const assert = require('node:assert/strict');
const { imageHash } = require('../src/utils/bloodPressurePhoto');
const bloodSugar = require('../src/utils/bloodSugarPhoto');
const weight = require('../src/utils/weightPhoto');

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('blood sugar photo draft requires confirmed mmol/L value, meal state and time', () => {
  process.env.JWT_SECRET = 'local-test-secret';
  assert.deepEqual(bloodSugar.parseResult('{"value":6.18}'), { value: 6.2 });
  assert.deepEqual(bloodSugar.parseResult('{"value":null}'), { value: null });
  const token = bloodSugar.issueDraft('user-1', imageHash(image), { value: 6.2 });
  const body = {
    type: 'bloodSugar', value: '6.2', unit: 'mmol/L', extra: { mealType: '空腹' }, imageUrl: image,
    recordedAt: '2026-01-01T08:00:00+08:00', photoRecognition: { token, confirmed: true },
  };
  assert.equal(bloodSugar.validateConfirmation(body, 'user-1').originalValues.value, 6.2);
  assert.throws(() => bloodSugar.validateConfirmation({ ...body, extra: {} }, 'user-1'), /测量状态/);
  assert.throws(() => bloodSugar.validateConfirmation({ ...body, unit: 'mg\/dL' }, 'user-1'), /单位/);
});

test('weight photo draft requires confirmed kg value and time', () => {
  process.env.JWT_SECRET = 'local-test-secret';
  assert.deepEqual(weight.parseResult('{"value":65.26,"unit":"kg"}'), { value: 65.3, unit: 'kg' });
  assert.deepEqual(weight.parseResult('{"value":130.5,"unit":"斤"}'), { value: 130.5, unit: '斤' });
  assert.deepEqual(weight.parseResult('{"value":65.26}'), { value: null, unit: null });
  assert.deepEqual(weight.parseResult('{"value":1000,"unit":"斤"}'), { value: null, unit: '斤' });
  const token = weight.issueDraft('user-1', imageHash(image), { value: 65.3 });
  const body = {
    type: 'weight', value: '65.3', unit: 'kg', imageUrl: image,
    recordedAt: '2026-01-01T08:00:00+08:00', photoRecognition: { token, confirmed: true },
  };
  assert.equal(weight.validateConfirmation(body, 'user-1').originalValues.value, 65.3);
  assert.throws(() => weight.validateConfirmation({ ...body, unit: '斤' }, 'user-1'), /单位/);
});
