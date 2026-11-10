const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePdfTextBoxes, parseTesseractTsv, readPdfPageTextBoxes, readScanImageWords } = require('../src/utils/reportOcrWords');

test('PDF text layer keeps words and page coordinates without joining table columns', () => {
  const words = parsePdfTextBoxes('<page><word xMin="10" yMin="20" xMax="40" yMax="32">白细胞</word>'
    + '<word xMin="110" yMin="20" xMax="133" yMax="32">5.7</word>'
    + '<word xMin="10" yMin="38" xMax="50" yMax="50">A&amp;B</word>'
    + '<word xMin="bad" yMin="1" xMax="2" yMax="3">invalid</word></page>');
  assert.deepEqual(words.map(word => [word.text, word.x, word.y, word.width, word.source]), [
    ['白细胞', 10, 20, 30, 'pdf_text'], ['5.7', 110, 20, 23, 'pdf_text'], ['A&B', 10, 38, 40, 'pdf_text'],
  ]);
});

test('scanned OCR keeps word boxes and line IDs while dropping nonword TSV records', () => {
  const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
  const result = parseTesseractTsv([header,
    '4\t1\t2\t1\t1\t0\t5\t8\t120\t20\t-1\t',
    '5\t1\t2\t1\t1\t1\t10\t20\t32\t12\t93.2\t葡萄糖',
    '5\t1\t2\t1\t1\t2\t150\t20\t18\t12\t88.4\t5.85',
    '5\t1\t2\t1\t2\t1\t10\t40\t32\t12\t-1\t模糊',
  ].join('\n'));
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(word => [word.text, word.line, word.confidence]), [
    ['葡萄糖', '2:1:1', 93.2], ['5.85', '2:1:1', 88.4],
  ]);
});

test('OCR adapters reject invalid input before invoking local binaries', async () => {
  await assert.rejects(readPdfPageTextBoxes(Buffer.from('pdf'), 0), /页码/);
  await assert.rejects(readScanImageWords(Buffer.alloc(0)), /内容无效/);
  await assert.rejects(readScanImageWords(Buffer.from('image'), { language: 'chi_sim;rm' }), /语言参数/);
});
