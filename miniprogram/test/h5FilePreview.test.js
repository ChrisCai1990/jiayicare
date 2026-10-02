const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('H5 report preview closes and releases authenticated blob URLs', () => {
  const source = fs.readFileSync(require.resolve('../src/utils/h5FilePreview.js'), 'utf8')
    .replace(/export /g, '').replace(/import\.meta\.url/g, "'https://example.test/app.js'");
  const released = [];
  const createElement = tag => ({ tag, style: {}, children: [],
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    addEventListener(_name, callback) { this.click = callback; },
    remove() { this.removed = true; } });
  const body = createElement('body');
  const ctx = { document: { createElement, body }, URL: { revokeObjectURL: url => released.push(url) } };
  vm.runInNewContext(`${source}\nthis.open = openH5FilePreview;`, ctx);
  const close = ctx.open(['blob:report-1', 'blob:report-2'], true);
  assert.equal(body.children[0].children[1].children.length, 2);
  close();
  assert.equal(body.children[0].removed, true);
  assert.deepEqual(released, ['blob:report-1', 'blob:report-2']);
});
