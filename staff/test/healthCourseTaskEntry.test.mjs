import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8');
const start = page.indexOf('  const openHealthCourseReview =');
const end = page.indexOf('\n  useEffect(', start);
function harness(getReport, save = async () => {}) {
  const calls = {};
  const ctx = { data:{user:{diseaseRecords:[]}}, archiveHelpers:{findReportArchive:()=>null}, setCourseArchivePreview:v=>{calls.archive=v}, setDiseaseReportPicker:()=>{}, id: 'patient', activePatientId: { current: 'patient' },
    staffAPI: { getReport, generateHealthCourseDraft: () => { throw new Error('Must not regenerate AI'); }, reviewHealthCourseDraft: save },
    setHealthCourseSaving: v => { calls.saving = v; }, setHealthCourseError: v => { calls.error = v; },
    setHealthCourseReview: v => { calls.review = v; }, toast: v => { calls.toast = v; },
    loadReports: async () => { calls.reports = true; }, load: async () => { calls.profile = true; },
    location: { pathname: '/patients/patient', search: '?tab=reports&reportId=report', state: { sourceTodo: { id: 'healthcourse_report' } } },
    nav: (...v) => { calls.nav = v; }, URLSearchParams,
  };
  const handlers = vm.runInNewContext(page.slice(start, end) + '; ({openHealthCourseReview, reviewHealthCourseDraft})', ctx);
  return { ...handlers, ctx, calls };
}
const pending = { _id: 'report', user: { _id: 'patient' }, title: '测试检查', healthCourseDraft: { status: 'pending_review', content: '已有草稿', recommendedDiseaseName: '已有专病' } };

test('task entry opens the exact saved draft without AI generation or marking report read', async () => {
  const h = harness(async id => { assert.equal(id, 'report'); return { data: pending }; });
  await h.openHealthCourseReview({ _id: 'report' }, { pendingOnly: true });
  assert.equal(h.calls.review.content, '已有草稿');
  assert.equal(h.calls.review.diseaseName, '已有专病');
  assert.equal(h.calls.review.report, pending);
  assert.equal(h.calls.reports, undefined);
  assert.equal(h.calls.saving, false);
});
test('stale tasks, wrong patients and load errors never open or regenerate a draft', async () => {
  for (const data of [null, { ...pending, user: 'other' }, { ...pending, healthCourseDraft: { status: 'approved' } }, { ...pending, healthCourseDraft: { status: 'dismissed' } }]) {
    const h = harness(async () => ({ data }));
    await h.openHealthCourseReview({ _id: 'report' }, { pendingOnly: true });
    assert.equal(h.calls.review, undefined);
    assert.ok(h.calls.toast);
    assert.equal(h.calls.saving, false);
  }
  const h = harness(async () => { throw new Error('network'); });
  await h.openHealthCourseReview({ _id: 'report' }, { pendingOnly: true });
  assert.equal(h.calls.toast, 'network');
});
test('late report responses cannot open a review for a different patient', async () => {
  let finish;
  const h = harness(() => new Promise(r => { finish = r; }));
  const p = h.openHealthCourseReview({ _id: 'report' }, { pendingOnly: true });
  h.ctx.activePatientId.current = 'other';
  finish({ data: pending }); await p;
  assert.equal(h.calls.review, undefined);
});
test('only a successful explicit decision clears the matching task context', async () => {
  for (const action of ['approve', 'dismiss']) {
    let saved;
    const h = harness(null, async (id, form) => { saved = { id, form }; });
    h.ctx.healthCourseReview = { report: pending, diseaseName: '已有专病', content: '核对内容' };
    await h.reviewHealthCourseDraft(action);
    assert.equal(saved.id, 'report'); assert.equal(saved.form.action, action);
    assert.equal(h.calls.nav[0], '/patients/patient?tab=reports');
    assert.equal(h.calls.review, null);
    assert.ok(h.calls.reports && h.calls.profile);
  }
  const h = harness(null, async () => { throw new Error('save failed'); });
  h.ctx.healthCourseReview = { report: pending, diseaseName: '已有专病', content: '核对内容' };
  await h.reviewHealthCourseDraft('approve');
  assert.equal(h.calls.nav, undefined); assert.equal(h.calls.error, 'save failed');
});

test('viewing an already archived report bypasses draft loading and AI',async()=>{const h=harness(async()=>{throw Error('should not load draft')});const archive={diseaseName:'专病',entry:{content:'已归档'}};h.ctx.archiveHelpers.findReportArchive=()=>archive;await h.openHealthCourseReview({_id:'report'});assert.equal(h.calls.archive,archive);assert.equal(h.calls.review,undefined)});
