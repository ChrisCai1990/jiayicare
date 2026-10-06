const test = require('node:test');
const assert = require('node:assert/strict');
const { compileArchiveEvidence, reconcileMissingAgainstEvidence } = require('../src/utils/annualCaseReviewEvidence');

test('annual review retrieves a relevant audited result beyond the latest 30 reports', () => {
  const recent = Array.from({ length: 110 }, (_, index) => ({ _id: `recent-${index}`, checkDate: '2026-09-01', title: `其他检查${index}`, reportItems: [] }));
  const old = { _id: 'old', checkDate: '2024-03-01', title: '生化+TRF饱和度', reportItems: [
    { name: '铁蛋白Fer', value: '659.10', unit: 'μg/L', referenceRange: '30-400', status: 'abnormal' },
    { name: '血红蛋白量', value: '120', unit: 'g/L', referenceRange: '130-175', status: 'abnormal' },
  ] };
  const evidence = compileArchiveEvidence([...recent, old], '地中海贫血？请核对2024-03-01铁蛋白和血红蛋白');
  assert.equal(evidence.auditedReportCount, 111);
  assert.equal(evidence.reportIndex.at(-1).reportId, 'old');
  assert.equal(evidence.relevantReports[0].reportId, 'old');
  assert.deepEqual(evidence.relevantReports[0].items.map(item => item.value), ['659.10', '120']);
});

test('annual review keeps imaging and pathology reports in the archive index', () => {
  const reports = [
    { _id: 'carotid', checkDate: '2026-09-04', title: '颈动脉椎动脉超声', reportItems: [{ name: '双侧颈动脉超声', findings: '多发斑块，狭窄率<50%' }] },
    { _id: 'pathology', checkDate: '2026-06-11', title: '结肠病理', reportItems: [{ name: '肠镜病理', diagnosis: '管状腺瘤伴低级别上皮内瘤变' }] },
    { _id: 'chest', checkDate: '2022-05-30', title: '肺CT', reportItems: [{ name: '胸部CT', findings: '肺结节' }] },
  ];
  const evidence = compileArchiveEvidence(reports, '颈动脉斑块、肠镜病理切缘和肺结节基线');
  assert.deepEqual(evidence.reportIndex.map(item => item.reportId), ['carotid', 'pathology', 'chest']);
  assert.equal(evidence.relevantReports.length, 3);
});

test('locally moves already archived reports out of missing while preserving absent blood pressure', () => {
  const reports = [
    { _id: 'lab', checkDate: '2024-03-01', title: '生化+TRF饱和度', reportItems: [{ name: '铁蛋白Fer', value: '659.10', referenceRange: '30-400' }] },
    { _id: 'chest', checkDate: '2022-05-30', title: '肺CT', reportItems: [] },
  ];
  const missing = ['2024-03-01血红蛋白与铁蛋白原始结果', '2022–2025年全部胸部影像报告', '近7日家庭血压记录'];
  const evidence = compileArchiveEvidence(reports, missing.join('\n'));
  const result = reconcileMissingAgainstEvidence(missing, evidence);
  assert.match(result.missing[0], /近7日家庭血压记录/);
  assert.equal(result.found.length, 2);
  assert.equal(result.actions.length, 2);
});

test('repeated conclusion checks archived BP, carotid, lung and lipid fields separately', () => {
  const today = new Date().toISOString().slice(0, 10);
  const reports = [
    { _id: 'carotid', checkDate: '2026-09-04', title: '颈动脉椎动脉超声', fileUrl: '/uploads/carotid', reportItems: [
      { name: '双侧颈动脉超声', findings: '分叉处多发斑块，血流充填良好' },
    ] },
    { _id: 'lung2026', checkDate: '2026-06-01', title: '肺CT', reportItems: [{ name: 'CT检查', findings: '左肺磨玻璃结节6*5mm' }] },
    { _id: 'lung2022', checkDate: '2022-05-30', title: '肺CT', reportItems: [{ name: '肺部CT', findings: '左肺结节约5mm' }] },
    { _id: 'lipids', checkDate: today, title: '生化', reportItems: [
      { name: '总胆固醇', value: '2.92' }, { name: '高密度脂蛋白胆固醇', value: '1.27' },
      { name: '低密度脂蛋白胆固醇', value: '1.36' }, { name: '载脂蛋白B', value: '1.12' },
      { name: '脂蛋白(a)', value: '92' },
    ] },
  ];
  const missing = [
    '家庭自测血压原始记录（近30天）',
    '最新颈部血管超声报告全文（含斑块性质描述、血流动力学参数）',
    '肺部影像学随访记录（含首次发现时间、最大径、实性成分占比、2026年是否复查）',
    '近一年完整血脂谱（含LDL-C、non-HDL-C、ApoB、Lp(a)）及hs-CRP检测结果',
  ];
  const bp = [{ recordedAt: new Date(Date.now() - 5 * 86400000), value: '141/89' }];
  const evidence = compileArchiveEvidence(reports, missing.join('\n'), bp);
  const result = reconcileMissingAgainstEvidence(missing, evidence, reports);
  assert.equal(result.found.length, 4);
  assert.equal(result.missing.length, 1);
  assert.match(result.missing[0], /hs-CRP/);
  assert.match(result.actions.join(' '), /non-HDL-C/);
  assert.doesNotMatch(result.missing.join(' '), /颈部血管超声报告全文|肺部影像学随访记录|家庭自测血压原始记录/);
});
