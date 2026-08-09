const assert = require('assert');
const { isShaoyifuReport, pageMode, promptForPage, needsCoverageAudit, normalizeShaoyifuItems } = require('../src/utils/shaoyifuReportTemplate');
const { classificationName } = require('../src/utils/screeningMatch');

assert(isShaoyifuReport({ title: '2026-07-15邵逸夫体检报告LZM' }));
assert.equal(pageMode(2), 'skip');
assert.equal(pageMode(10), 'extract');
assert.equal(pageMode(19), 'duplicate');
assert.equal(pageMode(20), 'ecg_enrichment');
assert.match(promptForPage(10), /本页不得跳过/);
assert.match(promptForPage(11), /左右栏/);
assert(needsCoverageAudit(10, []));
assert(needsCoverageAudit(11, [{ _page: 11, name: 'HPV16' }]));

const normalized = normalizeShaoyifuItems([
  { _page: 5, name: '家族史', value: '高血压 母', itemType: 'data' },
  { _page: 5, name: '心脏', findings: '未见明显异常', itemType: 'imaging' },
  { _page: 6, name: '双侧乳房彩超检查', itemType: 'imaging' },
  { _page: 7, name: '双侧乳房彩超检查', findings: '双乳内未见异常扩张', diagnosis: '双乳多发低回声结节', itemType: 'imaging' },
  { _page: 7, name: '肺部CT', findings: '两肺纹理清晰', itemType: 'imaging' },
  { _page: 19, name: '低剂量胸部CT平扫', findings: '重复报告', itemType: 'imaging' },
  { _page: 8, name: '心电图', diagnosis: '正常心电图', itemType: 'imaging' },
  { _page: 20, name: '常规十二导心电图', findings: '心率65bpm；P-R间期140ms', itemType: 'imaging' },
  { _page: 21, name: '头颅MRA', diagnosis: '重复报告', itemType: 'imaging' },
]);

const generalMedicine = normalized.filter(i => i.name === '全科医学检查');
assert.equal(generalMedicine.length, 1);
assert.match(generalMedicine[0].findings, /家族史：高血压 母/);
assert.match(generalMedicine[0].findings, /心脏：未见明显异常/);
assert.equal(normalized.filter(i => i.name === '乳房超声').length, 1);
assert.match(normalized.find(i => i.name === '乳房超声').diagnosis, /双乳多发低回声结节/);
assert.equal(normalized.filter(i => /肺部CT|胸部CT/.test(i.name)).length, 1);
assert.equal(normalized.filter(i => /心电图/.test(i.name)).length, 1);
assert.match(normalized.find(i => /心电图/.test(i.name)).findings, /P-R间期140ms/);
assert.equal(normalized.some(i => Number(i._page) >= 12 && Number(i._page) !== 20), false);

assert.equal(classificationName({ itemType: 'lab', name: '中性粒百分数', orderName: '血常规' }), '血常规');
assert.equal(classificationName({ itemType: 'lab', name: '红细胞沉降率(ESR)', orderName: '红细胞沉降率(ESR)' }), '血沉+抗O+类风湿因子');
assert.equal(classificationName({ itemType: 'lab', name: '细菌', orderName: '尿液干化学分析' }), '尿常规');
assert.equal(classificationName({ itemType: 'lab', name: '尿肌酐测定', orderName: '微量尿白蛋白/尿肌酐比值' }), '尿微量白蛋白/尿肌酐');
assert.equal(classificationName({ itemType: 'lab', name: '乙型肝炎病毒e抗体', orderName: '乙肝三系' }), '乙肝三系');
assert.equal(classificationName({ itemType: 'lab', name: '胃蛋白酶原I', orderName: 'EB病毒/胃功能' }), '胃功能3项');
assert.equal(classificationName({ itemType: 'lab', name: 'VCA-IgA', orderName: 'EB病毒/胃功能' }), 'EB病毒抗体');
assert.equal(classificationName({ itemType: 'lab', name: 'HPV51(高危亚型)', orderName: 'HPV24型' }), 'HPV24型');

console.log('shaoyifu template regression: ok');
