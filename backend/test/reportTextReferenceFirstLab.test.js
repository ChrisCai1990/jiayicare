const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTextReferenceFirstLab } = require('../src/utils/reportTextReferenceFirstLab');
const { filterMissingReportItems } = require('../src/utils/reportPageSupplement');

test('reference-first hepatitis table retains both raised antibody rows', () => {
  const layout = `【乙肝三系测定(体检)】                         检查医生:某某
                                                        本次结果                 上次结果
       项目名称              参考值                单位
    乙肝表面抗原1               <0.05            IU/mL          <0.05
    乙肝表面抗体               <10.00            mIU/mL         71.28 .
       乙肝E抗原              <0.10            IU/mL          <0.05
       乙肝E抗体              <0.15            IU/mL          <0.10
    乙肝核心抗体                <0.35            IU/mL          0.49 .
   乙肝核心IgM抗体              <1.00            S/CO           <0.10
小结 ：乙肝表面抗体: 71.28;乙肝核心抗体: 0.49`;
  const result = parseTextReferenceFirstLab(layout, 14);
  assert.equal(result.supported, true);
  assert.equal(result.items.length, 6);
  assert.deepEqual(result.items.filter(x => x.status === 'abnormal').map(x => [x.name, x.value, x.referenceRange]), [
    ['乙肝表面抗体', '71.28', '<10.00'], ['乙肝核心抗体', '0.49', '<0.35'],
  ]);
  assert.equal(result.items[0].status, 'unknown');
  assert.equal(result.items[1].manualReviewStatus, 'pending');
  const missing = filterMissingReportItems(result.items.filter(x => x.status !== 'abnormal'), result.items);
  assert.deepEqual(missing.map(x => x.name), ['乙肝表面抗体', '乙肝核心抗体']);
});

test('reference-first parser rejects unheaded free text', () => {
  const result = parseTextReferenceFirstLab('乙肝表面抗体  <10.00  mIU/mL  71.28', 14);
  assert.equal(result.supported, false);
  assert.equal(result.items.length, 0);
});
