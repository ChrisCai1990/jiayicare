const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { imageHash, parseResult, issueDraft, validateConfirmation } = require('../src/utils/bloodPressurePhoto');
process.env.JWT_SECRET = 'test-only-bp-photo-secret';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const values = { sys: 126, dia: 82, pulse: 73 };
function payload() {
  return { type: 'bloodPressure', value: '126/82', unit: 'mmHg', extra: { ...values },
    imageUrl: image, recordedAt: '2026-01-01T08:30:00+08:00',
    photoRecognition: { token: issueDraft('user1', imageHash(image), values), confirmed: true } };
}
test('strict image validation rejects remote URLs, garbage and overlarge payloads', () => {
  assert.equal(imageHash(image).length, 64);
  for (const invalid of ['http://localhost/secret', 'data:image/png;base64,YWJj', '', 'x'.repeat(8 * 1024 * 1024 + 1)]) {
    assert.throws(() => imageHash(invalid));
  }
});
test('extracts only numeric fields, never guesses uncertain/reversed readings', () => {
  assert.deepEqual(parseResult(JSON.stringify(values)), values);
  assert.deepEqual(parseResult('```json\n{"sys":120,"dia":80,"pulse":null}\n```'), { sys: 120, dia: 80, pulse: null });
  assert.deepEqual(parseResult('not json'), { sys: null, dia: null, pulse: null });
  assert.deepEqual(parseResult('{"sys":"120?","dia":80,"pulse":72.5}'), { sys: null, dia: 80, pulse: null });
  assert.deepEqual(parseResult('{"sys":80,"dia":120}'), { sys: null, dia: null, pulse: null });
});
test('manual records unchanged and confirmed edits retain original AI values', () => {
  assert.equal(validateConfirmation({ type: 'bloodPressure' }, 'user1'), null);
  const body = payload(); body.extra.sys = 128; body.value = '128/82';
  const audit = validateConfirmation(body, 'user1');
  assert.deepEqual(audit.originalValues, values);
  assert.ok(audit.confirmedAt instanceof Date);
  assert.equal(jwt.decode(body.photoRecognition.token).id, undefined);
});
test('rejects unconfirmed, wrong user, swapped image, forged or expired draft', () => {
  const body = payload();
  assert.throws(() => validateConfirmation(body, 'other'));
  body.photoRecognition.confirmed = false;
  assert.throws(() => validateConfirmation(body, 'user1'));
  body.photoRecognition.confirmed = true; body.imageUrl = image.replace('AAAAASUV', 'AAABASUV');
  assert.throws(() => validateConfirmation(body, 'user1'));
  for (const token of ['forged', jwt.sign({ purpose: 'bp-photo', sub: 'user1' }, process.env.JWT_SECRET, { expiresIn: -1, audience: 'bp-photo-confirm' })]) {
    const p = payload(); p.photoRecognition.token = token;
    assert.throws(() => validateConfirmation(p, 'user1'));
  }
});
test('rejects invalid values, units, missing/future measurement times', () => {
  for (const patch of [
    { value: '125/82' }, { extra: { sys: 80, dia: 126 } }, { unit: 'kPa' },
    { extra: { ...values, pulse: -1 } }, { recordedAt: null }, { recordedAt: 'invalid' },
    { recordedAt: '2026-02-30T08:30:00+08:00' },
    { recordedAt: new Date(Date.now() + 3600000).toISOString() }, { type: 'heartRate' },
  ]) assert.throws(() => validateConfirmation({ ...payload(), ...patch }, 'user1'));
});
