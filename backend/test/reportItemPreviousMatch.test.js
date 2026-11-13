const test = require('node:test');
const assert = require('node:assert/strict');
const { previousReportItemsFor } = require('../src/utils/reportItemPreviousMatch');

test('legacy rows without itemId retain their own classification when identity is unchanged', () => {
  const old = [
    { itemId: 'hydrated-1', name: '钾', sourcePage: 3, unit: 'mmol/L', screeningKey: 'electrolytes' },
    { itemId: 'hydrated-2', name: '钠', sourcePage: 3, unit: 'mmol/L', screeningKey: 'electrolytes' },
    { itemId: 'hydrated-3', name: '氯', sourcePage: 3, unit: 'mmol/L', screeningKey: 'electrolytes' },
    { itemId: 'hydrated-4', name: '脂蛋白(a)', sourcePage: 3, screeningKey: 'lipid' },
  ];
  const next = old.map((item, index) => ({ ...item, itemId: `preview-${index + 1}` }));
  assert.deepEqual(previousReportItemsFor(next, old).map(item => item.screeningKey), ['electrolytes', 'electrolytes', 'electrolytes', 'lipid']);
  assert.equal(previousReportItemsFor([{ ...next[0], name: '血钾' }], old)[0], undefined);
});

test('duplicate legacy identity is never used to transfer a classification', () => {
  const old = [
    { itemId: 'hydrated-1', name: '钾', sourcePage: 3, screeningKey: 'a' },
    { itemId: 'hydrated-2', name: '钾', sourcePage: 3, screeningKey: 'b' },
  ];
  assert.equal(previousReportItemsFor([{ name: '钾', sourcePage: 3 }], old)[0], undefined);
  assert.equal(previousReportItemsFor([{ itemId: 'new', name: '钾', sourcePage: 3 }], old)[0], undefined);
});
