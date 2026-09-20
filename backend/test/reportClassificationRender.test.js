const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

test('classification cell renders search and selection for unmatched and matched report items', async () => {
  const staffRequire = createRequire(path.resolve(__dirname, '../../staff/package.json'));
  const React = staffRequire('react');
  const { renderToStaticMarkup } = staffRequire('react-dom/server');
  const { transformSync } = require('esbuild');
  const helpers = await import('../../staff/src/utils/reportReviewQuality.js');
  const source = fs.readFileSync(path.resolve(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
  const start = source.indexOf('        const classifyCell =');
  const end = source.indexOf('\n        return (', start);
  assert.ok(start > 0 && end > start);
  const code = transformSync(source.slice(start, end) + '\nclassifyCell;', { loader: 'jsx', format: 'cjs' }).code;
  const key = 'root|超声|肝脏超声';
  const option = { value: key, label: '超声 / 肝脏超声', groupLabel: '检查', path: ['检查', '超声', '肝脏超声'] };
  const renderCell = vm.runInNewContext(code, {
    React, ...helpers, screeningCatalog: [{ label: '检查', opts: [option] }],
    ocrReviewReport: { reportItems: [] }, ocrClassifySearch: {}, allClassifyOpts: [option],
    setOcrClassifySearch: () => {}, setClassify: () => {},
  });
  for (const item of [{ name: '彩超' }, { name: '肝脏彩超', screeningKey: key, screeningKeys: [key] }]) {
    const html = renderToStaticMarkup(renderCell(item, 0));
    assert.match(html, /选择 \/ 修改归类/);
    assert.match(html, /搜索 Admin 分类或项目别名/);
    assert.match(html, /type="checkbox"/);
  }
});
