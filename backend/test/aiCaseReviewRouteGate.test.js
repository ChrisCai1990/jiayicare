const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');

test('阶段评估试点开关不再阻断专项研判接口', () => {
  const phaseCalls = source.match(/patientOr404\(req, res\)/g) || [];
  const specialtyBlock = source.slice(source.indexOf("router.get('/patients/:patientId/ai-case-reviews'"));
  assert.equal(phaseCalls.length, 4);
  assert.equal(specialtyBlock.includes('patientOr404(req, res)'), false);
  assert.equal((specialtyBlock.match(/caseReviewPatientOr404\(req, res\)/g) || []).length, 6);
});

test('专病分析模板具有医护读取接口且使用后台模板类型', () => {
  assert.match(source, /router\.get\('\/ai-case-review\/templates'/);
  assert.match(source, /type: 'ai_case_review'/);
});

test('专项研判全部主题由Admin模板提供且保留自定义主题开关', () => {
  const templates = fs.readFileSync(path.join(__dirname, '../src/utils/aiCaseReviewTemplates.js'), 'utf8');
  for (const key of ['checkup', 'nutrition', 'annual', 'medical', 'daily', 'specialty']) assert.match(templates, new RegExp(`'${key}'`));
  assert.match(templates, /allowCustomTopic: true/);
});
