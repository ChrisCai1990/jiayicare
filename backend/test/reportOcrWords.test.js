const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePdfTextBoxes, parseTesseractTsv, parseLayoutResultPairs, compareShadowPairsToItems,
  readPdfPageTextBoxes, readScanImageWords } = require('../src/utils/reportOcrWords');

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

test('shadow layout detector finds two result columns without copying identity lines', () => {
  const pairs = parseLayoutResultPairs([
    '项目名称      结果         参考范围      项目名称       结果',
    '白细胞计数       5.7          3.5-9.5      红细胞计数        4.41',
    '姓名 张某      体检号 12345',
    '报告时间 2021-06-16',
    '尿蛋白          阴性         阴性',
  ].join('\n'), 6);
  assert.deepEqual(pairs.map(row => [row.page, row.name, row.value]), [
    [6, '白细胞计数', '5.7'], [6, '红细胞计数', '4.41'], [6, '尿蛋白', '阴性'],
  ]);
  assert.equal(pairs.every(row => row.source === 'pdf_text' && row.line > 0), true);
});

test('shadow coverage counts unique same-page name and value pairs only', () => {
  const pairs = [
    { page: 4, name: '白细胞计数', value: '5.7' },
    { page: 4, name: '白细胞计数', value: '5.7' },
    { page: 4, name: '红细胞计数', value: '4.41' },
  ];
  assert.deepEqual(compareShadowPairsToItems(pairs, [
    { sourcePage: 4, name: '白细胞 计数', value: '5.7' },
    { sourcePage: 5, name: '红细胞计数', value: '4.41' },
  ]), { candidateRows: 2, matchedRows: 1, uncoveredRows: 1 });
});

test('OCR adapters reject invalid input before invoking local binaries', async () => {
  await assert.rejects(readPdfPageTextBoxes(Buffer.from('pdf'), 0), /页码/);
  await assert.rejects(readScanImageWords(Buffer.alloc(0)), /内容无效/);
  await assert.rejects(readScanImageWords(Buffer.from('image'), { language: 'chi_sim;rm' }), /语言参数/);
});
