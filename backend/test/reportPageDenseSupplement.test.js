const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('dense annual page checks four bands and does not stop after a partial local table scan', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
  const start = source.indexOf('async function runReportPageParse(');
  const end = source.indexOf('// POST /api/staff/medical-reports/:id/parse-ai', start);
  let requiredCalls = 0;
  let bandsRendered = 0;
  let modelCalls = 0;
  let localOcrCalls = 0;
  const report = { _id: 'synthetic', user: 'synthetic', type: 'annual', title: '合成体检', reportItems: [] };
  const modules = {
    '../utils/ai': { parseImage: async () => {
      modelCalls++;
      throw Object.assign(new Error('AI 输出达到长度上限'), { code: 'AI_OUTPUT_LENGTH' });
    } },
    '../utils/reportImageEvidence': {
      createReportImageParser: parseImage => parseImage,
      recordPageEvidence: () => {},
      findUncoveredPrintedRows: () => ({ rows: [] }),
    },
    '../utils/pdf': {
      isPdfReport: () => true,
      fetchReportBuffer: async () => Buffer.from('fixture'),
      renderSinglePageBands: async () => { bandsRendered++; return ['a', 'b', 'c', 'd']; },
      renderSinglePage: async () => Buffer.from('page').toString('base64'),
    },
    '../utils/reportPageSupplement': require('../src/utils/reportPageSupplement'),
    '../utils/aiBudget': { assertSupplementCallCapacity: async (_, __, count) => { requiredCalls = count; } },
    '../utils/reportOcrWords': { readPdfPageLayout: async () => '含零散文字层的扫描页', parseLayoutResultPairs: () => Array(14).fill({}) },
    '../utils/reportTextLabTable': { parseTextLabTable: () => ({ supported: false, items: [] }) },
    '../utils/reportScanOcr': { extractScannedLabTable: async () => { localOcrCalls++; return { supported: true, items: [
      { name: '本地识别项目', itemType: 'lab', value: '1', sourcePage: 9 },
    ] }; } },
    '../utils/reportTextUrineTable': { parseTextUrineTable: () => ({ supported: false, items: [] }) },
    '../utils/reportTextPhysicalExam': { parseTextPhysicalExam: () => ({ supported: false, items: [] }) },
    '../utils/reportTextAikangExam': { parseTextAikangExam: () => ({ supported: false, items: [] }) },
    '../utils/reportTextUltrasoundTable': { parseTextUltrasoundTable: () => ({ supported: false, items: [] }) },
    '../utils/shaoyifuReportTemplate': { isShaoyifuReport: () => false },
    '../utils/zheyiReportTemplate': { isZheyiReport: () => false },
    '../utils/screeningMatch': { classifyItemsAsync: () => { throw new Error('Unexpected classification'); } },
    '../models/MedicalReport': { findById: async () => report },
  };
  const run = vm.runInNewContext(`${source.slice(start, end)};runReportPageParse`, {
    require: name => { assert.ok(modules[name], name); return modules[name]; },
    withAiContext: (_, action) => action(),
    rethrowAiControl: () => {},
    User: { findById: () => ({ select: () => ({ lean: async () => ({ age: 40 }) }) }) },
    isPediatricAge: () => false,
    UPLOADS_DIR: '',
    reportParsePromptForCategory: () => 'extract',
    isManualOnlyReport: () => false,
    Buffer,
    console,
  });
  await assert.rejects(run('synthetic', 9), /输出上限/);
  assert.equal(bandsRendered, 1);
  assert.equal(localOcrCalls, 1);
  assert.equal(requiredCalls, 8);
  assert.equal(modelCalls, 1);
});
