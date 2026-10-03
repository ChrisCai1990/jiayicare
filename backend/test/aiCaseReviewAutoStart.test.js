const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiCaseReviews.js'), 'utf8');
const start = source.indexOf("router.post('/patients/:patientId/ai-case-reviews/:topicId/messages'");
const end = source.indexOf("router.patch('/patients/:patientId/ai-case-reviews/:topicId/messages/:messageId'", start);
const automaticMessage = '【系统自动启动研判】测试';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

function route({ report, topic, replyContent = '目标：控制风险；干预重点：核实膳食\n研判分析：待核实' }) {
  let handler, accepted, generated;
  vm.runInNewContext(source.slice(start, end), {
    router: { post(_path, _auth, fn) { handler = fn; } }, staffAuth() {},
    caseReviewPatientOr404: async () => ({ _id: 'patient' }),
    AiCaseReview: { findOne: async () => topic },
    latestExam: async () => report, AUTO_REVIEW_MESSAGE: automaticMessage,
    ROLE_LABEL: { familyDoctor: '健康顾问' },
    acceptSend: async (_model, args) => {
      accepted = args;
      const message = { role: 'staff', requestId: args.requestId, content: args.content, attachments: [] };
      return { claimed: true, topic: { ...topic, messages: [message], generation: { status: 'running', requestId: args.requestId }, conclusion: { managementTargets: [] } } };
    },
    finishSend: async (_model, claimed, generate) => { generated = await generate(); return claimed; },
    buildContext: async () => ({ reports: [], sources: [] }),
    providerAdapter: { reply: async args => ({ content: replyContent, contextSnapshot: args.context }) },
    require: name => name === '../utils/caseReviewManagementTargets'
      ? { proposeTargetsFromActions: lines => lines.filter(line => line.startsWith('目标：')).map(() => ({ goal: '控制风险', focus: '核实膳食', nutritionRelevant: false })) }
      : require(name),
    forClient: item => item, console,
  });
  return { handler, accepted: () => accepted, generated: () => generated };
}

const topic = { _id: 'topic', reviewType: 'annual', messages: [], contextScopes: ['reports'], title: '年度管理研判', description: '' };
const request = { params: { topicId: 'topic' }, staff: { _id: 'staff', role: 'familyDoctor' }, body: { autoStart: true, requestId: 'auto_topic_1234567890' } };

test('automatic first round starts without a typed question and focuses the latest audited exam', async () => {
  const report = { _id: 'latest', title: '最近体检', checkDate: '2026-09-01', reportItems: [] };
  const harness = route({ report, topic });
  const res = response();
  await harness.handler(request, res);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(res.code, 202);
  assert.equal(harness.accepted().content, automaticMessage);
  assert.equal(harness.generated().snapshot.reports[0]._id, 'latest');
  assert.equal(harness.generated().result.managementTargets[0].goal, '控制风险');
});

test('automatic first round stops clearly when there is no audited exam', async () => {
  const harness = route({ report: null, topic });
  const res = response();
  await harness.handler(request, res);
  assert.equal(res.code, 409);
  assert.match(res.body.message, /已审核的体检报告/);
  assert.equal(harness.accepted(), undefined);
});
