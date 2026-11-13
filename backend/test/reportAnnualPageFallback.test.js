const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAnnualPageBands } = require('../src/utils/reportAnnualPageFallback');

test('dense annual page retries each spatial band and retains distinct rows', async () => {
  const calls = [];
  const result = await parseAnnualPageBands({
    renderBands: async () => ['top', 'upper', 'lower', 'bottom'],
    parseImage: async (image, prompt, options) => {
      calls.push({ image, prompt, options });
      return JSON.stringify({ items: [{ name: image, value: '1', itemType: 'lab' }],
        ...(image === 'top' ? { institution: 'synthetic hospital' } : {}) });
    },
    parseJSON: JSON.parse,
    mergeItems: (left, right) => [...left, ...right],
    prompt: 'extract', pageNum: 9, model: 'qwen3-vl-plus',
  });
  assert.deepEqual(result.items.map(item => item.name), ['top', 'upper', 'lower', 'bottom']);
  assert.equal(result.institution, 'synthetic hospital');
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call, index) => call.prompt.includes(`第${index + 1}/4段`)
    && call.options.sourcePage === 9 && call.options.maxTokens === 5000));
});

test('a missing band fails the page instead of claiming partial success', async () => {
  await assert.rejects(parseAnnualPageBands({
    renderBands: async () => ['top', 'upper', 'lower', 'bottom'],
    parseImage: async image => image === 'lower' ? '{' : '{"items":[]}',
    parseJSON: raw => { try { return JSON.parse(raw); } catch { return null; } },
    mergeItems: (left, right) => [...left, ...right],
    prompt: 'extract', pageNum: 10, model: 'qwen3-vl-plus',
  }), /第10页第3段未返回有效项目列表/);
});
