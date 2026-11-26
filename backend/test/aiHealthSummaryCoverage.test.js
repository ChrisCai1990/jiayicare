const test = require('node:test');
const assert = require('node:assert/strict');

const { reconcileGynecologicUltrasoundCoverage, reconcileCompletedExamMissing } = require('../src/utils/aiHealthSummary');

test('AI生成的待补清单按当年已审核胸部CT和碳13结果纠错', () => {
  const sections = { tumor_risk: { missing: ['低剂量胸部CT（LDCT）', '结肠镜'] },
    checkup_completeness: { missing: ['幽门螺杆菌年度复查', '胃镜（含食管）'] } };
  const reports = [
    { audit_status: 'audited', checkDate: '2026-10-23', reportItems: [{ name: '胸部CT平扫' }] },
    { audit_status: 'audited', checkDate: '2026-10-23', reportItems: [{ name: '碳-13呼气', value: '阴性' }] },
  ];
  reconcileCompletedExamMissing(sections, reports, 2026);
  assert.deepEqual(sections.tumor_risk.missing, ['结肠镜']);
  assert.deepEqual(sections.checkup_completeness.missing, ['胃镜（含食管）']);
});

test('子宫附件超声规则证据纠正AI生成的缺失结论和补做建议', () => {
  const sections = {
    tumor_risk: {
      completed: ['卵巢癌（附件超声）'],
      missing: ['子宫内膜癌（经阴道妇科超声）'],
      overview: { coveredCount: 0, attentionCount: 0, unknownCount: 1 },
      cancers: [{ name: '子宫体癌', status: 'unknown', latest: '暂无有效记录', trendStatus: 'no_data' }],
    },
    checkup_completeness: {
      covered: ['卵巢癌（附件超声）'],
      missing: ['子宫内膜癌（经阴道妇科超声）'],
      suggestion: '下年度重点补做肠镜、胃镜（含食管）、乳腺钼靶及经阴道妇科超声；延续随访。',
    },
  };
  const coverage = [{ key: 'endometrial', status: 'ok', doneItems: ['子宫附件/经阴道超声(2026-06-18)'] }];

  reconcileGynecologicUltrasoundCoverage(sections, coverage);

  assert.deepEqual(sections.tumor_risk.missing, []);
  assert.match(sections.tumor_risk.completed.at(-1), /子宫体癌/);
  assert.equal(sections.tumor_risk.cancers[0].status, 'covered');
  assert.deepEqual(sections.checkup_completeness.missing, []);
  assert.match(sections.checkup_completeness.covered.at(-1), /子宫附件/);
  assert.doesNotMatch(sections.checkup_completeness.suggestion, /经阴道/);
});

test('同年度报告标题、分字段CT与呼气试验别名在整理和年度方案中一致', () => {
  const { currentYearExam, approvedItems } = require('../src/utils/aiHealthCheckupItems');
  const { assessCancerCoverage } = require('../src/utils/cancerScreeningCoverage');
  const reports = [{ audit_status: 'audited', checkDate: '2026-05-01', title: '胸部ＣＴ平扫' },
    { audit_status: 'audited', checkDate: '2026-05-02', reportItems: [{ orderName: '¹³C尿素呼气试验', value: '阴性' }] }];
  const summary = { sections: { checkup_completeness: { missing: ['肺部低剂量螺旋CT', '幽门螺旋杆菌检测'] } }, approvedAt: '2026-06-01' };
  assert.deepEqual(approvedItems(summary, 2026, reports).items, []);
  const sections = { checkup_completeness: { missing: [...summary.sections.checkup_completeness.missing, '医嘱治疗后复查幽门螺杆菌'],
    suggestion: '建议补做低剂量胸部CT，仍需完善胃镜。' }, tumor_risk: { summary: '幽门螺旋杆菌检测未做。' } };
  reconcileCompletedExamMissing(sections, reports, 2026);
  assert.deepEqual(sections.checkup_completeness.missing, ['医嘱治疗后复查幽门螺杆菌']);
  assert.match(sections.checkup_completeness.suggestion, /本年度已.*仍需完善胃镜/);
  assert.doesNotMatch(sections.tumor_risk.summary, /未做/);
  const cover = assessCancerCoverage({gender:'男'}, reports, 2026);
  assert.equal(cover.find(row => row.label === '肺癌').status, 'ok');
  assert.ok(cover.find(row => row.label === '胃癌').notes.some(note => note.includes('本年度已完成检测')));
  const items = list => [{ checkDate: '2026-05-03', reportItems: list }];
  assert.ok(currentYearExam(items([{ bodyPart: '双肺', modality: 'CT' }]), 2026, 'chest_ct'));
  assert.ok(currentYearExam(items([{ name: '呼气试验', value: 'DOB 2.0 阴性' }]), 2026, 'h_pylori'));
  assert.equal(currentYearExam(items([{ name: '氢呼气试验', value: '阴性' }]), 2026, 'h_pylori'), false);
  assert.equal(currentYearExam(items([{ name: '胸部X光' }, {name:'腹部CT'}]), 2026, 'chest_ct'), false);
});
