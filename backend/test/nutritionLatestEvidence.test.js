const test = require('node:test');
const assert = require('node:assert/strict');
const { latestNutritionEvidence } = require('../src/utils/nutritionLatestEvidence');
const now = new Date('2026-10-22T12:00:00Z');
test('按测量日期逐项选择，不按上传时间、不使用未审核及未来日期记录', () => {
  const patient = { chronicDiseases: ['高尿酸', '脂肪肝'], bodyComposition: { measuredAt: '2026-01-01', skelMuscle: 20 }, bodyCompHistory: [{ measuredAt: '2026-10-20', skelMuscle: 22 }] };
  const reports = [
    { _id: 'old', audit_status: 'audited', checkDate: '2026-02-01', reportItems: [{ name: '血尿酸', value: '480', unit: 'μmol/L' }] },
    { _id: 'new', audit_status: 'audited', title: '复查', checkDate: '2026-10-20', reportItems: [{ name: '尿酸', value: '420', unit: 'μmol/L', status: 'abnormal', referenceRange: '208–428 μmol/L' }, { name: '肝脏彩超', diagnosis: '轻度脂肪肝', status: 'abnormal' }] },
    { audit_status: 'pending', checkDate: '2026-10-21', reportItems: [{ name: '尿酸', value: '300' }] },
    { audit_status: 'audited', checkDate: '2027-01-01', reportItems: [{ name: '尿酸', value: '200' }] },
  ];
  const { latest, metrics } = latestNutritionEvidence(patient, [], reports, now);
  assert.equal(latest['尿酸'].value, '420');
  assert.equal(latest['尿酸'].sourceId, 'new');
  assert.equal(latest['骨骼肌'].value, '22');
  assert.match(latest['肝脏超声'].baseline, /轻度脂肪肝/);
  assert(metrics.includes('尿酸') && metrics.includes('肝脏超声'));
});
test('同日不同值留空供核实，原单位保留，不将泛血糖当空腹血糖', () => {
  const rows = [
    { label: '尿酸', value: '420', unit: 'μmol/L', recordedAt: '2026-10-20' },
    { label: '尿酸', value: '7', unit: 'mg/dL', recordedAt: '2026-10-20' },
    { label: '血糖', type: 'bloodSugar', value: '6', unit: 'mmol/L', recordedAt: '2026-10-20' },
    { label: '体重', value: '70', unit: 'kg', recordedAt: '2026-10-20', deletedAt: now },
  ];
  const { latest } = latestNutritionEvidence({}, rows, [], now);
  assert.equal(latest['尿酸'].baseline, '');
  assert.equal(latest['尿酸'].conflict, true);
  assert.equal(latest['空腹血糖'], undefined);
  assert.equal(latest['体重'], undefined);
});
test('病史仅推荐追踪项目，无测量结果不填基线；报告项目日期优先', () => {
  const result = latestNutritionEvidence({ chronicDiseases: ['脂肪肝', '高尿酸'] }, [], [], now);
  assert.deepEqual(result.metrics, []);
  assert.deepEqual(result.latest, {});
  const data = latestNutritionEvidence({}, [], [{ audit_status: 'audited', checkDate: '2026-10-20', reportItems: [{ name: '尿酸', value: '420', unit: 'μmol/L', status: 'abnormal', referenceRange: '208–428 μmol/L', examDate: '2026-05-01' }] }], now);
  assert.equal(data.latest['尿酸'].date, '2026-05-01');
});


test('仅最新异常入选，最新正常覆盖历史异常，保留同报告参考范围', () => {
  const report = (date, status, value, range) => ({ audit_status: 'audited', checkDate: date, reportItems: [{ name: '尿酸', value, unit: 'μmol/L', status, referenceRange: range }] });
  const normal = latestNutritionEvidence({}, [], [report('2026-01-01', 'abnormal', '500', '200–420'), report('2026-10-21', 'normal', '350', '210–430')], now);
  assert.deepEqual(normal.metrics, []);
  assert.equal(normal.latest['尿酸'].referenceRange, '210–430');
  const abnormal = latestNutritionEvidence({}, [], [report('2026-10-21', 'abnormal', '500', '210–430')], now);
  assert.deepEqual(abnormal.metrics, ['尿酸']);
  assert.equal(abnormal.latest['尿酸'].referenceRange, '210–430');
  const unknown = latestNutritionEvidence({}, [], [report('2026-10-21', 'unknown', '500', '')], now);
  assert.deepEqual(unknown.metrics, []);
  assert.equal(unknown.latest['尿酸'].referenceRange, '');
});


test('营养指标复用体检关键指标名称映射，排除尿酸结晶和尿肌酐误匹配', () => {
  const data = latestNutritionEvidence({}, [], [{ audit_status: 'audited', checkDate: '2026-10-21', reportItems: [
    { name: '血清尿酸（SUA）', value: '500', unit: 'μmol/L', status: 'abnormal', referenceRange: '210–420' },
    { name: '尿酸结晶', value: '阳性', status: 'abnormal' },
    { name: '尿液肌酐', value: '100', status: 'abnormal' },
    { name: '血清肌酐', value: '120', unit: 'μmol/L', status: 'abnormal', referenceRange: '62–106' },
    { name: '高密度脂蛋白胆固醇', value: '1.8', unit: 'mmol/L', status: 'normal' },
  ] }], now);
  assert.equal(data.latest['尿酸'].value, '500');
  assert.equal(data.latest['血肌酐'].value, '120');
  assert.equal(data.latest['总胆固醇'], undefined);
  assert.deepEqual(data.metrics, ['尿酸','血肌酐']);
});
