const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const page = fs.readFileSync(path.join(root, 'pages/records/ai-health/index.jsx'), 'utf8');
const legal = fs.readFileSync(path.join(root, 'pages/legal/index.jsx'), 'utf8');

test('mini program AI health page no longer offers the retired health attention feature', () => {
  assert.doesNotMatch(page, /const TABS|RiskAssessmentView|getAiRiskAssessment|postAiRiskAssessment/);
  assert.doesNotMatch(page, /['"]健康关注提示['"]/);
  assert.doesNotMatch(legal, /健康关注提示/);
  assert.match(page, /生成健康信息整理/);
  assert.match(page, /人工智能（AI）生成/);
});
