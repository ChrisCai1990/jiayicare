const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateUrineStoolPanels } = require('../src/utils/urineStoolPanel');

test('尿常规聚合为一条lab且不保留参考范围', () => {
  const out = aggregateUrineStoolPanels([
    { name: '颜色', value: '淡黄色', referenceRange: '淡黄色', orderName: '尿液综合分析', sourceSection: '尿液综合分析', itemType: 'lab', status: 'normal', _page: 12 },
    { name: '尿蛋白', value: '阴性', referenceRange: '阴性', orderName: '尿液综合分析', sourceSection: '尿液综合分析', itemType: 'lab', status: 'normal', _page: 13 },
    { name: '尿潜血', value: '1+', referenceRange: '阴性', orderName: '尿液综合分析', sourceSection: '尿液综合分析', itemType: 'lab', status: 'abnormal', _page: 13 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '尿常规');
  assert.equal(out[0].itemType, 'lab');
  assert.equal(out[0].referenceRange, '');
  assert.equal(out[0].status, 'abnormal');
  assert.match(out[0].findings, /颜色：淡黄色/);
  assert.match(out[0].findings, /尿潜血：1\+/);
});

test('粪便常规聚合，但独立FIT和尿肾功能保持独立', () => {
  const fit = { name: '便潜血试验', value: '阴性', orderName: '便潜血检测', sourceSection: '便潜血检测', itemType: 'lab', status: 'normal' };
  const urineAlbumin = { name: '尿微量白蛋白', value: '10', orderName: '尿生化', sourceSection: '尿生化', itemType: 'lab', status: 'normal' };
  const out = aggregateUrineStoolPanels([
    { name: '颜色', value: '黄褐色', referenceRange: '黄褐色', orderName: '粪便常规', itemType: 'lab', status: 'normal' },
    { name: '白细胞', value: '未见', referenceRange: '未见', orderName: '粪便常规', itemType: 'lab', status: 'normal' }, fit, urineAlbumin,
  ]);
  assert.equal(out.filter(item => item.name === '粪便常规').length, 1);
  assert.ok(out.includes(fit));
  assert.ok(out.includes(urineAlbumin));
});

test('已聚合记录再次处理保持稳定', () => {
  const once = aggregateUrineStoolPanels([{ name: '尿常规', findings: '尿蛋白：阴性\n尿潜血：阴性', orderName: '尿常规', sourceSection: '尿常规', itemType: 'lab', status: 'normal' }]);
  assert.deepEqual(aggregateUrineStoolPanels(once), once);
});
