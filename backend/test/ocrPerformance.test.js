const test = require('node:test');
const assert = require('node:assert/strict');
const { createOcrStageTimer } = require('../src/utils/ocrPerformance');

test('OCR performance timer accumulates repeated stages without storing report content', () => {
  let current = 1000;
  const timer = createOcrStageTimer(() => current);
  timer.transition('source');
  current += 120;
  timer.transition('text_primary');
  current += 300;
  timer.transition('visual_ocr');
  current += 80;
  timer.transition('text_primary');
  current += 50;

  assert.deepEqual(timer.snapshot({ textPrimaryPageCount: 20 }), {
    elapsedMs: 550,
    stageDurationsMs: { source: 120, text_primary: 350, visual_ocr: 80 },
    textPrimaryPageCount: 20,
  });
});
