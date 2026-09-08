const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

test('service checkout enforces date and requirements on the server', () => {
  const source = read('src/routes/services.js');
  assert.match(source, /requiresServiceConfirmation && !desiredServiceDate/);
  assert.match(source, /requiresServiceConfirmation && !confirmedServiceRequirements/);
});

test('unread count excludes completed questionnaire assignments and legacy answers', () => {
  const source = read('src/routes/messages.js');
  assert.match(source, /answeredPushIds/);
  assert.match(source, /legacyAnsweredQuestionnaireIds/);
  assert.match(source, /pendingQuestionnaireIds/);
});
