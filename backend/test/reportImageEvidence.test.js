const test = require('node:test');
const assert = require('node:assert/strict');
const { guardImageEvidence, createReportImageParser, IMAGE_EVIDENCE_PROMPT, recordPageEvidence } = require('../src/utils/reportImageEvidence');

const imageOnly = { hasMedicalImages: true, readability: 'clear', clinicalText: '' };
const narrative = { name: '乳腺', itemType: 'imaging', findings: '左侧乳腺内见低回声结节，大小约0.482cm×0.282cm。', diagnosis: '' };

test('pure images reject invented findings and caliper values regardless of candidate type or skip flag', () => {
  const candidates = [narrative, { itemType: 'imaging', name: '泌尿系统', findings: '双肾形态正常。' },
    { itemType: 'lab', name: '距离', value: '0.482', unit: 'cm' }];
  const result = guardImageEvidence({ pageType: 'detail', skipPage: false, summary: '全部正常', items: candidates }, imageOnly);
  assert.deepEqual(result.items, []);
  assert.equal(result.pageType, 'image_only');
  assert.equal(result.skipPage, true);
  assert.equal(result.summary, '');
  assert.equal(result.imageEvidence.blockedCount, 3);
  assert.equal(candidates.length, 3); // Never mutate existing/raw arrays.
});

test('mixed image/text pages keep printed findings and reject added interpretation, wrong side or changed measurement', () => {
  const findings = '左侧乳腺内见低回声结节，大小约0.5*0.3cm。';
  const good = { ...narrative, findings, diagnosis: '双乳多发结节 BI-RADS 3类', conclusion: '双乳多发结节 BI-RADS 3类' };
  const evidence = { ...imageOnly, clinicalText: `${findings}\n双乳多发结节 BI-RADS 3类\n血糖 5.1 mmol/L` };
  const lab = { name: '血糖', itemType: 'lab', value: '5.1', unit: 'mmol/L' };
  const result = guardImageEvidence({ items: [good, narrative, { ...good, findings: findings.replace('左侧', '右侧') },
    { ...good, diagnosis: '考虑恶性' }, lab] }, evidence);
  assert.deepEqual(result.items, [good, lab]);
  assert.equal(result.imageEvidence.status, 'needs_review');
});

test('unreadable text is never called image-only or normal; invalid verifier response fails closed', () => {
  const result = guardImageEvidence({ items: [narrative] }, { ...imageOnly, readability: 'unreadable' });
  assert.equal(result.imageEvidence.status, 'needs_review');
  assert.deepEqual(result.items, []);
  assert.throws(() => guardImageEvidence({ items: [narrative] }, {}), /校验/);
});

test('dropping a negation or laterality cannot pass by matching a substring of the source', () => {
  const result = guardImageEvidence({ items: [
    { ...narrative, findings: '见明显异常。' },
    { ...narrative, findings: '乳腺内见低回声结节。' },
  ] }, { ...imageOnly, clinicalText: '未见明显异常。左侧乳腺内见低回声结节。' });
  assert.deepEqual(result.items, []);
});

test('metadata, footer and machine measurements do not count as clinical findings', () => {
  const result = guardImageEvidence({ items: [narrative] }, { ...imageOnly,
    clinicalText: '检查项目：乳腺超声\n此报告仅供临床医生参考，签名有效\n距离 0.482 cm\nMI 0.6\n仅用于软件测试，不对应真实患者' });
  assert.equal(result.imageEvidence.status, 'image_only');
  const findings = '左侧乳腺未见明显异常。';
  const mixed = guardImageEvidence({ items: [{ ...narrative, findings }] }, { ...imageOnly,
    clinicalText: `检查项目：${findings}` });
  assert.equal(mixed.items.length, 1);
});

test('pure text reports and ordinary lab pages keep existing extraction behavior', async () => {
  const parsed = { items: [narrative] };
  assert.equal(guardImageEvidence(parsed, { ...imageOnly, hasMedicalImages: false, clinicalText: narrative.findings }), parsed);
  let calls = 0;
  const lab = { items: [{ itemType: 'lab', name: '血糖', value: '5.1' }] };
  const parse = createReportImageParser(async () => {
    calls++;
    return JSON.stringify({ ...lab, imageEvidence: { status: 'verified', message: 'untrusted model flag' } });
  });
  assert.deepEqual(JSON.parse(await parse('lab-page', 'extract')), lab);
  assert.equal(calls, 1);
});

test('full extraction and repeated supplement candidates use one independent transcript per source', async () => {
  let reads = 0;
  const statuses = [];
  const parse = createReportImageParser(async (source, prompt, options) => {
    assert.equal(options.sourcePage, undefined);
    if (prompt === IMAGE_EVIDENCE_PROMPT) {
      reads++;
      assert.ok(!prompt.includes(narrative.findings));
      return JSON.stringify(imageOnly);
    }
    return JSON.stringify({ items: [narrative] });
  }, { onEvidence: (page, evidence) => statuses.push([page, evidence.status]) });
  for (const prompt of ['full', 'supplement', 'coverage retry']) {
    assert.deepEqual(JSON.parse(await parse('page-1', prompt, { sourcePage: 1 })).items, []);
  }
  assert.equal(reads, 1);
  assert.deepEqual(statuses, [[1, 'image_only'], [1, 'image_only'], [1, 'image_only']]);
  await parse('page-2', 'full', { sourcePage: 2 });
  assert.equal(reads, 2);
});

test('verifier failure cannot return unchecked candidates and is retriable', async () => {
  let attempts = 0;
  const statuses = [];
  const parse = createReportImageParser(async (_, prompt) => {
    if (prompt === IMAGE_EVIDENCE_PROMPT) {
      if (++attempts === 1) throw new Error('timeout');
      return JSON.stringify(imageOnly);
    }
    return JSON.stringify({ items: [narrative] });
  }, { onEvidence: (_, evidence) => statuses.push(evidence.status) });
  await assert.rejects(parse('p', 'full', { sourcePage: 1 }), /timeout/);
  assert.deepEqual(JSON.parse(await parse('p', 'retry', { sourcePage: 1 })).items, []);
  assert.deepEqual(statuses, ['needs_review', 'image_only']);
});

test('later coverage cannot erase an evidence rejection warning', () => {
  const pages = {};
  recordPageEvidence(pages, 1, { status: 'needs_review', blockedCount: 2 });
  recordPageEvidence(pages, 1, { status: 'verified', blockedCount: 0 });
  assert.equal(pages[1].status, 'needs_review');
  recordPageEvidence(pages, 2, { status: 'image_only', blockedCount: 0 });
  assert.equal(pages[2].status, 'image_only');
});

test('single-page route stops before coverage/classification and preserves existing records on image-only pages', async () => {
  const fs = require('fs');
  const vm = require('vm');
  const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const start = source.indexOf('async function runReportPageParse(');
  const end = source.indexOf('// POST /api/staff/medical-reports/:id/parse-ai', start);
  const oldItem = { ...narrative, sourcePage: 1, manualReviewStatus: 'reviewed' };
  const report = { _id: 'fixture', user: 'synthetic', type: 'ultrasound', title: '测试超声', reportItems: [oldItem] };
  const writes = [];
  let calls = 0;
  const db = { findById: async () => report, findByIdAndUpdate: async (_, update) => writes.push(update) };
  const modules = {
    '../utils/ai': { parseImage: async (_, prompt) => { calls++; return JSON.stringify(prompt === IMAGE_EVIDENCE_PROMPT ? imageOnly : { items: [narrative] }); } },
    '../utils/reportImageEvidence': require('../src/utils/reportImageEvidence'),
    '../utils/reportPageSupplement': require('../src/utils/reportPageSupplement'),
    '../models/MedicalReport': db,
    '../utils/pdf': { isPdfReport: () => true, fetchReportBuffer: async () => Buffer.from('fixture'), renderSinglePage: async () => 'synthetic-image' },
    '../utils/screeningMatch': { classifyItemsAsync: () => { throw new Error('Must not reclassify existing records'); } },
    '../utils/shaoyifuReportTemplate': { isShaoyifuReport: () => false },
    '../utils/zheyiReportTemplate': { isZheyiReport: () => false },
  };
  const run = vm.runInNewContext(`${source.slice(start, end)};runReportPageParse`, {
    require: name => { assert.ok(modules[name], name); return modules[name]; },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ age: 30 }) }) }) },
    isPediatricAge: () => false, UPLOADS_DIR: '', REPORT_PARSE_PROMPT: 'extract',
    safeParseJSON: JSON.parse, shouldSkipParsedReportPage: parsed => parsed.skipPage === true, console,
  });
  await run('fixture', 1);
  assert.equal(calls, 2); // Initial extraction plus independent transcription; no coverage retry.
  assert.equal(writes.length, 1);
  assert.equal(writes[0].$set.pageParseStatus.status, 'image_only');
  assert.equal(writes[0].$set.reportItems, undefined);
  assert.equal(writes[0].$set.aiStatus, undefined);
  assert.equal(report.reportItems[0], oldItem);
});

for (const pdf of [true, false]) test(`full ${pdf ? 'PDF' : 'photo'} OCR records image-only success without fabricated results or retries`, async () => {
  const fs = require('fs');
  const vm = require('vm');
  const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const start = source.indexOf('async function runReportParse(');
  const end = source.indexOf('// 只补提指定PDF页', start);
  const report = { _id: 'fixture', user: 'synthetic', type: 'ultrasound', title: '测试超声', reportItems: [], reviewRevision: 0 };
  const writes = [];
  const errors = [];
  let calls = 0;
  const db = {
    findById: () => ({ then: resolve => resolve(report), select: () => ({ lean: async () => report }) }),
    findByIdAndUpdate: async (_, update) => writes.push(update),
  };
  const modules = {
    '../utils/ai': { parseImage: async (_, prompt) => { calls++; return JSON.stringify(prompt === IMAGE_EVIDENCE_PROMPT ? imageOnly : { items: [narrative] }); } },
    '../utils/reportImageEvidence': require('../src/utils/reportImageEvidence'),
    '../utils/reportPageSupplement': require('../src/utils/reportPageSupplement'),
    '../models/MedicalReport': db,
    '../utils/pdf': { isPdfReport: () => pdf, fetchReportBuffer: async () => Buffer.from('synthetic-image'),
      getPdfPageCountFromBuffer: async () => 1,
      pdfBufferToImages: async (_, options) => options.onBatch(['synthetic-image'], 0),
      renderSinglePage: () => { throw new Error('Pure image page must not enter a coverage retry'); } },
    '../utils/screeningMatch': { classifyItemsAsync: async items => items },
    '../utils/shaoyifuReportTemplate': { isShaoyifuReport: () => false },
    '../utils/zheyiReportTemplate': { isZheyiReport: () => false },
  };
  const sandbox = {
    require: name => { assert.ok(modules[name], name); return modules[name]; },
    User: { findById: () => ({ select: () => ({ lean: async () => ({ age: 30 }) }) }) },
    isManualOnlyReport: () => false, isPediatricAge: () => false, UPLOADS_DIR: '',
    REPORT_PARSE_PROMPT: 'extract', BODY_COMPOSITION_RETRY_PROMPT: 'body composition',
    safeParseJSON: JSON.parse, shouldSkipParsedReportPage: parsed => parsed.skipPage === true,
    findUnderExtractedPages: () => ({ pagesToRetry: [], underOrders: [] }),
    findUnderExtractedCBC: () => ({ pagesToRetry: [], missingGroups: [] }),
    str: value => String(value || ''), sanitizeInstitution: value => value || '',
    console: { log: () => {}, error: (...args) => errors.push(args.join(' ')) },
  };
  // Post-processing is out of scope here; the integration contract is that no candidate reaches it.
  for (const name of ['sanitizeBodyCompositionItems', 'sortReportItemsBySource', 'dropAdvisoryEcho', 'filterPatientInfoItems',
    'collapseBreathTestItems', 'dropDepartmentSummaryEcho', 'cleanupExtractedItems', 'splitEndoscopyPathology',
    'dropNonResultAndSummaryItems', 'dropNumberedSummaryEcho', 'normalizeSingleExamReportItems', 'normalizeDepartmentExamItems',
    'mergeInternalMedicineSubparts', 'fillEmptyDiagnosisFromFindings', 'realignUpperAbdomenConclusions', 'cleanupUltrasoundOverlap',
    'forceBodyCompositionClassification', 'stripReportSourceOrder', 'dropGenericLabelEcho', 'dropResultCommentEcho',
    'dropDiagnosisPhraseEcho', 'dropExerciseGuideEcho', 'dropUnclassifiedNameEcho', 'normalizeBreathTestItems']) {
    sandbox[name] = items => { assert.equal(items.length, 0); return items; };
  }
  const run = vm.runInNewContext(`${source.slice(start, end)};runReportParse`, sandbox);
  await run('fixture');
  assert.deepEqual(errors, []);
  const final = writes.at(-1).$set || writes.at(-1);
  assert.equal(final.aiStatus, 'pending');
  assert.equal(final.parseJob.status, 'completed');
  assert.equal(final.imagePageEvidence[1].status, 'image_only');
  assert.match(final.aiSummary, /影像资料页/);
  assert.equal(calls, 2);
  assert.equal((final.reportItems || []).length, 0);
});
