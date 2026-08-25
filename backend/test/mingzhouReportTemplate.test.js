const test = require('node:test');
const assert = require('node:assert/strict');

const template = require('../src/utils/mingzhouReportTemplate');

test('杭州明州模板程序级跳过P3-P6', () => {
  assert.equal(template.isMingzhouReport({ hospital: '浙醫二院國際醫學中心 杭州明州醫院' }), true);
  assert.deepEqual([3, 4, 5, 6].map(template.pageMode), ['skip', 'skip', 'skip', 'skip']);
  assert.equal(template.pageMode(7), 'extract');
});

test('P8裸眼视力串入眼底时拆回独立眼底且裸眼记无', () => {
  const normalized = template.normalizeMingzhouItems([{
    _page: 8, _order: 1, name: '左眼裸视力', itemType: 'imaging', findings: '双眼视盘边界清，视网膜平伏，左眼可见激光斑', sourceSection: '眼科精英检查',
  }, {
    _page: 8, _order: 2, name: '右眼裸视力', itemType: 'imaging', findings: '4.3', sourceSection: '眼科精英检查',
  }]);

  assert.equal(normalized.find(item => item.name === '左眼裸视力').findings, '无');
  assert.equal(normalized.find(item => item.name === '右眼裸视力').findings, '无');
  assert.match(normalized.find(item => item.name === '眼底').findings, /视网膜/);
});

test('P7完整性必须有原始体重，P8必须有眼底和咽部', () => {
  assert.equal(template.pageIsComplete(7, [{ _page: 7, name: '体重指数' }]), false);
  assert.equal(template.pageIsComplete(7, [{ _page: 7, name: '体重' }]), false);
  assert.equal(template.pageIsComplete(7, [{ _page: 7, name: '体重' }, { _page: 7, name: '手术史(外科)' }]), true);
  assert.equal(template.pageIsComplete(8, [{ _page: 8, name: '眼底' }]), false);
  assert.equal(template.pageIsComplete(8, [{ _page: 8, name: '眼底' }, { _page: 8, name: '咽部' }]), true);
  assert.equal(template.pageIsComplete(9, []), false);
  assert.equal(template.pageIsComplete(13, [{ _page: 13, name: '检验项' }]), true);
  assert.deepEqual([7, 8, 9, 10, 11, 12, 13].map(template.needsCoverageAudit), Array(7).fill(true));
});

test('P7局部补提只接受带kg单位的原始体重行', () => {
  assert.equal(template.selectOriginalWeight([{ name: '体重指数', value: '28.3', unit: 'kg/m²' }]), null);
  assert.equal(template.selectOriginalWeight([{ name: '体重', value: '78.5', unit: '' }]), null);
  assert.equal(template.selectOriginalWeight([{ name: '体重', value: '78.5', unit: 'kg' }]).value, '78.5');
});

test('P8按原页外科眼科耳鼻喉顺序稳定排列', () => {
  const normalized = template.normalizeMingzhouItems([
    { _page: 8, _order: 1, name: '右眼裸视力', findings: '' },
    { _page: 8, _order: 2, name: '浅表淋巴结', findings: '未见异常' },
    { _page: 8, _order: 3, name: '咽部', findings: '咽腔稍狭小' },
    { _page: 8, _order: 4, name: '眼底（眼科）', findings: '双眼底视盘边界清' },
    { _page: 8, _order: 5, name: '左眼裸视力', findings: '' },
    { _page: 8, _order: 6, name: '鼻部', findings: '未见异常' },
  ]);
  assert.deepEqual(normalized.map(item => item.name), ['浅表淋巴结', '左眼裸视力', '眼底（眼科）', '右眼裸视力', '鼻部', '咽部']);
  assert.equal(normalized.find(item => item.name === '浅表淋巴结').sourceSection, '外科');
  assert.equal(normalized.find(item => item.name === '眼底（眼科）').sourceSection, '眼科');
  assert.equal(normalized.find(item => item.name === '咽部').sourceSection, '耳鼻喉科');
});

test('模板归一化兜底清除P3-P6条目', () => {
  const normalized = template.normalizeMingzhouItems([
    { _page: 3, name: '异常结果汇总' },
    { _page: 6, name: '健康建议' },
    { _page: 7, name: '体重' },
  ]);
  assert.deepEqual(normalized.map(item => item.name), ['体重']);
});
