const test = require('node:test');
test('specific ultrasound name refines broad body context while generic names retain combined organs', () => {
  const { contextualNames, compatibleNode } = require('../src/utils/reportMatchContext');
  assert.deepEqual(contextualNames({ name: '彩超', bodyPart: '心脏' }), ['心脏超声', '心脏彩超']);
  assert.deepEqual(contextualNames({ name: '彩超', bodyPart: '肝胆脾胰' }), ['肝胆脾胰超声', '肝胆脾胰彩超']);
  assert.equal(compatibleNode({ name: '肝脏彩超', bodyPart: '肝胆脾胰' }, { label: '肝脏超声' }), true);
  assert.equal(compatibleNode({ name: '胆囊超声', bodyPart: '肝胆脾胰' }, { label: '胆囊超声' }), true);
  assert.equal(compatibleNode({ name: '胆囊超声', bodyPart: '胰腺' }, { label: '胆囊超声' }), false);
  assert.equal(compatibleNode({ name: '肝胆脾胰彩超' }, { label: '肝脏超声' }), false);
});
const assert = require('node:assert/strict');
const { selectMatchesForItem, norm } = require('../src/utils/screeningMatch');
const { reviewMetadataError, REPORT_PARSE_PROMPT } = require('../src/utils/reportExtractionPolicy');
const { filterMissingReportItems, mergeSupplementItems } = require('../src/utils/reportPageSupplement');
const { createBudgetRunner } = require('../src/utils/aiBudget');
const { DEFAULT_POLICY, rethrowAiControl } = require('../src/utils/aiBudgetPolicy');
const entry = (label, aliases = [], confirmedRules = []) => ({ node: { id: label, label, parent: label, confirmedRules }, cands: [label, ...aliases].map(raw => ({ raw, n: norm(raw) })) });

test('ultrasound anatomy context excludes general medicine and conflicting organ aliases', () => {
  const index = [entry('全科', ['肝脏']), entry('肝脏超声', ['肝脏']), entry('胰腺超声', ['胆囊超声']), entry('胆囊超声')];
  assert.equal(selectMatchesForItem({ name: '肝脏', itemType: 'imaging', sourceSection: '腹部超声' }, index)[0]?.node.id, '肝脏超声');
  assert.equal(selectMatchesForItem({ name: '胆囊超声', itemType: 'imaging' }, index)[0]?.node.id, '胆囊超声');
  assert.deepEqual(selectMatchesForItem({ name: '肝脏', sourceSection: '超声' }, [index[0]]), []);
  assert.equal(selectMatchesForItem({ name: '肝脏', sourceSection: '超声' }, [entry('肝脏超声')])[0]?.node.id, '肝脏超声');
});

test('same lab name uses its own panel, never falls into blood when urine panel is missing', () => {
  const index = [entry('血常规', ['白细胞']), entry('尿常规'), entry('粪便常规')];
  for (const panel of ['血常规', '尿常规', '粪便常规']) assert.equal(selectMatchesForItem({ name: '白细胞', sourceSection: panel, itemType: 'lab' }, index)[0]?.node.id, panel);
  assert.deepEqual(selectMatchesForItem({ name: '白细胞', sourceSection: '尿常规' }, [index[0]]), []);
});

test('confirmed Admin rules reuse exact clinical context; conflicts remain unclassified', () => {
  const item = { name: '院内名称', sourceSection: '血液', unit: 'mg/L' };
  const a = entry('标准项目', [], [item]);
  assert.equal(selectMatchesForItem(item, [a])[0]?.node.id, '标准项目');
  assert.deepEqual(selectMatchesForItem({ ...item, sourceSection: '尿液' }, [a]), []);
  assert.deepEqual(selectMatchesForItem(item, [a, entry('另一项目', [], [item])]), []);
});

test('supplement context omission cannot duplicate a reviewed value; distinct specimen/date survives', () => {
  const item = { name: '白细胞', itemType: 'lab', sourceSection: '血常规', value: '5', manualReviewStatus: 'reviewed' };
  assert.deepEqual(filterMissingReportItems([item], [{ name: '白细胞', itemType: 'lab', value: '8' }]), []);
  assert.equal(mergeSupplementItems([item], [{ ...item, sourceSection: '', value: '8' }]).items[0].value, '5');
  assert.equal(filterMissingReportItems([{ ...item, specimen: '血', examDate: '2026-01-01' }], [{ ...item, specimen: '尿', examDate: '2026-01-02' }]).length, 1);
  assert.equal(filterMissingReportItems([{ ...item, name: '中性粒细胞', unit: '%' }], [{ ...item, name: '中性粒细胞', unit: '10^9/L' }]).length, 1);
});

test('metadata completion requires actual calendar date and explicitly resolved institution', () => {
  for (const date of ['', '2026', '2026-02-30', '2026-13-01']) assert.ok(reviewMetadataError({ checkDate: date, institution: '机构' }));
  assert.ok(reviewMetadataError({ checkDate: '2026-02-28' }));
  assert.equal(reviewMetadataError({ checkDate: '2026-02-28', institutionStatus: 'unknown' }), '');
  assert.equal(reviewMetadataError({ date: '2026-02-28', hospital: '机构' }), '');
});

test('duplicate suggestions retain dates and do not mutate report content', async () => {
  const { reportReviewConcerns } = await import('../../staff/src/utils/reportReviewQuality.js');
  const items = [{ name: '胆囊超声', findings: '原文', sourcePage: 2 }, { name: '胆囊超声', findings: '不同原文', sourcePage: 8 }, { name: '胆囊超声', examDate: '2026-01-01' }];
  const snapshot = JSON.stringify(items);
  assert.deepEqual(reportReviewConcerns(items).filter(issue => issue.other !== undefined).map(issue => [issue.other, issue.index]), [[0, 1]]);
  assert.equal(JSON.stringify(items), snapshot);
  assert.ok(REPORT_PARSE_PROMPT.length < 2000);
});

function fakeBudget() {
  const circuits = new Map();
  return { circuits, policy: async () => ({ ...DEFAULT_POLICY, failureThreshold: 2 }),
    circuit: async key => circuits.get(key), reserve: async () => true, adjust: async () => {}, insert: async () => {}, finish: async () => {},
    outcome: async (key, failed, threshold) => { const old = circuits.get(key) || { failures: 0 }; const failures = failed ? old.failures + 1 : 0; circuits.set(key, { failures, paused: old.paused || failures >= threshold }); },
  };
}
const request = reportId => ({ provider: 'qwen', model: 'test', messages: [], maxTokens: 100, context: { business: 'ocr', reportId, page: 1, stopState: {} } });
const response = () => ({ usage: { prompt_tokens: 10, completion_tokens: 10 }, choices: [{ message: { content: '{"items":[]}' }, finish_reason: 'stop' }] });
test('report failures cannot trip another report or global model; truncation never trips service circuit', async () => {
  const db = fakeBudget(), run = createBudgetRunner(db);
  for (let i = 0; i < 4; i++) await assert.rejects(run(request('truncated'), async () => ({ ...response(), choices: [{ message: { content: '{' }, finish_reason: 'length' }] })));
  await run(request('truncated'), async () => response());
  for (let i = 0; i < 2; i++) await assert.rejects(run(request('failed'), async () => { throw new Error('timeout'); }));
  await assert.rejects(run(request('failed'), async () => response()), error => error.code === 'AI_CIRCUIT_PAUSED');
  await run(request('other'), async () => response());
  assert.equal(db.circuits.has('qwen:test'), false);
});
test('page quota refusal refunds preflight reservations and does not poison the report context', async () => {
  const db = fakeBudget(), refunds = [];
  db.reserve = async scope => !scope.id.startsWith('page:');
  db.adjust = async (...args) => refunds.push(args);
  const options = request('quota');
  await assert.rejects(createBudgetRunner(db)(options, async () => { assert.fail('provider must not be called'); }), error => {
    assert.equal(error.code, 'AI_PAGE_BUDGET_PAUSED');
    assert.doesNotThrow(() => rethrowAiControl(error)); return true;
  });
  assert.equal(options.context.stopState.error, undefined);
  assert.equal(refunds.length, 4);
});

test('model output cannot claim Admin taxonomy or human review', () => {
  const { tagReportPageItems } = require('../src/utils/reportSourceOrder');
  const [item] = tagReportPageItems([{ name: '项目', value: '1', screeningKey: 'invented', screeningKeys: ['invented'], manualReviewStatus: 'reviewed', itemId: 'forged' }], 2);
  assert.equal(item.screeningKey, undefined); assert.equal(item.manualReviewStatus, undefined); assert.equal(item.itemId, undefined);
  assert.equal(item.sourcePage, 2);
});

test('review timing ignores duplicate packets, idle gaps and overlapping windows', () => {
  const { reviewActivityEntry } = require('../src/utils/reportReviewActivity');
  const start = 100000;
  const a = reviewActivityEntry({}, 'a', 'staff', '审核员', 1, start);
  const b = reviewActivityEntry({ a }, 'a', 'staff', '审核员', 2, start + 15000);
  assert.equal(b.durationMs, 15000);
  assert.equal(reviewActivityEntry({ a: b }, 'a', 'staff', '审核员', 2, start + 16000), null);
  const otherWindow = reviewActivityEntry({ a: b }, 'b', 'staff', '审核员', 1, start + 16000);
  const c = reviewActivityEntry({ a: b, b: otherWindow }, 'a', 'staff', '审核员', 3, start + 17000);
  assert.equal(c.durationMs, 16000);
  assert.equal(reviewActivityEntry({ a: c }, 'a', 'staff', '审核员', 4, start + 600000).durationMs, 16000);
});
