const assert = require('assert');
const { isShaoyifuReport, pageMode, promptForPage, needsCoverageAudit, normalizeShaoyifuItems, applyShaoyifuOrderAndGroups } = require('../src/utils/shaoyifuReportTemplate');
const { classificationName } = require('../src/utils/screeningMatch');

assert(isShaoyifuReport({ title: '2026-07-15邵逸夫体检报告LZM' }));
assert.equal(pageMode(2), 'skip');
assert.equal(pageMode(10), 'extract');
assert.equal(pageMode(19), 'duplicate');
assert.equal(pageMode(20), 'ecg_enrichment');
assert.match(promptForPage(10), /本页不得跳过/);
assert.match(promptForPage(11), /左栏从上到下.*右栏从上到下/);
assert(needsCoverageAudit(10, []));
assert(needsCoverageAudit(11, [{ _page: 11, name: 'HPV16' }]));
assert(needsCoverageAudit(6, [
  { _page: 6, name: '脾脏彩超', findings: '胰腺形态正常' },
]));

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
assert.equal(classificationName({ itemType: 'lab', name: 'HPV51(高危亚型)', orderName: 'HPV24型' }), 'HPV');
assert.equal(classificationName({ itemType: 'data', name: '体重' }), '身高体重BMI');
assert.equal(classificationName({ itemType: 'data', name: '体重指数(BMI)' }), '身高体重BMI');
assert.equal(classificationName({ itemType: 'data', name: '脉搏' }), '脉搏呼吸');
assert.equal(classificationName({ itemType: 'data', name: '跌倒评分' }), '跌倒评估');
assert.equal(classificationName({ itemType: 'imaging', name: '全科医学检查' }), '内外科（全科）');
assert.equal(classificationName({ itemType: 'imaging', name: '胆囊彩超' }), '胆囊超声');
assert.equal(classificationName({ itemType: 'imaging', name: '脾脏彩超' }), '脾脏超声');
assert.equal(classificationName({ itemType: 'imaging', name: '子宫、附件彩超' }), '子宫附件/阴道超声');
assert.equal(classificationName({ itemType: 'imaging', name: '眼科体检' }), '眼科检查');
assert.equal(classificationName({ itemType: 'imaging', name: '耳鼻喉科体检' }), '耳鼻喉科检查');
assert.equal(classificationName({ itemType: 'imaging', name: '妇科体检' }), '妇科检查');
assert.equal(classificationName({ itemType: 'lab', name: '胰岛素0小时' }), '空腹胰岛素+C肽');
assert.equal(classificationName({ itemType: 'lab', name: '糖链抗原125' }), '泛肿瘤标志物');
assert.equal(classificationName({ itemType: 'lab', name: '糖链抗原15-3' }), '泛肿瘤标志物');
assert.equal(classificationName({ itemType: 'lab', name: '促甲状腺刺激激素' }), '甲状腺功能');

const ordered = applyShaoyifuOrderAndGroups([
  { _page: 6, itemType: 'imaging', name: '脾脏彩超', findings: '胰腺：形态大小正常' },
  { _page: 6, itemType: 'imaging', name: '胰腺彩超', findings: '脾脏：厚度正常' },
  { _page: 9, itemType: 'lab', name: '红细胞计数' },
  { _page: 9, itemType: 'lab', name: '白细胞计数' },
  { _page: 11, itemType: 'lab', name: '乙型肝炎病毒e抗体' },
  { _page: 11, itemType: 'lab', name: '尿肌酐测定' },
  { _page: 11, itemType: 'lab', name: 'HPV18(高危亚型)' },
  { _page: 11, itemType: 'lab', name: 'HPV16(高危亚型)' },
]);
assert.deepEqual(ordered.filter(i => i._page === 6).map(i => i.name), ['胰腺彩超', '脾脏彩超']);
assert.deepEqual(ordered.filter(i => i._page === 9).map(i => i.name), ['白细胞计数', '红细胞计数']);
assert.deepEqual(ordered.filter(i => i._page === 11).map(i => i.name), ['尿肌酐测定', '乙型肝炎病毒e抗体', 'HPV16(高危亚型)', 'HPV18(高危亚型)']);
assert.equal(ordered.find(i => i.name === '尿肌酐测定').orderName, '微量尿蛋白/尿肌酐比值');
assert.equal(ordered.find(i => i.name.startsWith('HPV16')).orderName, '人乳头状瘤病毒基因分型(HPV24型)');

console.log('shaoyifu template regression: ok');
