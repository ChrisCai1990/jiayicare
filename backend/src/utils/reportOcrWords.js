// Read-only OCR evidence adapter for the shadow parser. It does not classify,
// change reportItems, or send report content to an external service.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function decodeXml(value) {
  return String(value || '').replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity[0] !== '#') return named[entity.toLowerCase()] || '';
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

function parsePdfTextBoxes(xml) {
  const words = [];
  const pattern = /<word\b([^>]*)>([\s\S]*?)<\/word>/gi;
  for (const match of String(xml || '').matchAll(pattern)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/(xMin|yMin|xMax|yMax)="([^"]+)"/g)].map(([, key, value]) => [key, Number(value)]));
    if (Object.keys(attrs).length !== 4 || Object.values(attrs).some(value => !Number.isFinite(value))) continue;
    const text = decodeXml(match[2].replace(/<[^>]+>/g, '')).trim();
    if (!text) continue;
    words.push({ text, x: attrs.xMin, y: attrs.yMin, width: attrs.xMax - attrs.xMin,
      height: attrs.yMax - attrs.yMin, confidence: null, source: 'pdf_text' });
  }
  return words;
}

function parseTesseractTsv(tsv) {
  const words = [];
  for (const line of String(tsv || '').split(/\r?\n/).slice(1)) {
    const cells = line.split('\t');
    if (cells.length < 12 || cells[0] !== '5') continue;
    const text = cells.slice(11).join('\t').trim();
    const [x, y, width, height, confidence] = cells.slice(6, 11).map(Number);
    if (!text || [x, y, width, height, confidence].some(value => !Number.isFinite(value))
      || width <= 0 || height <= 0 || confidence < 0) continue;
    words.push({ text, x, y, width, height, confidence, source: 'scan_ocr',
      block: Number(cells[2]), line: `${cells[2]}:${cells[3]}:${cells[4]}` });
  }
  return words;
}

function run(program, args, { timeoutMs = 60000, maxBuffer = 12 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => execFile(program, args,
    { timeout: timeoutMs, maxBuffer, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(new Error(`${program} 原文读取失败：${error.code || error.message}`));
      else resolve(stdout);
    }));
}

async function withTempFile(buffer, extension, action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'report-ocr-'));
  const filename = path.join(directory, `source.${extension}`);
  try {
    fs.writeFileSync(filename, buffer);
    return await action(filename);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function readPdfPageTextBoxes(pdfBuffer, pageNum) {
  if (!Buffer.isBuffer(pdfBuffer) || !Number.isInteger(pageNum) || pageNum < 1) throw new Error('PDF 页码或内容无效');
  return withTempFile(pdfBuffer, 'pdf', async filename => parsePdfTextBoxes(await run('pdftotext',
    ['-f', String(pageNum), '-l', String(pageNum), '-bbox-layout', filename, '-'])));
}

async function readScanImageWords(imageBuffer, { language = 'chi_sim+eng' } = {}) {
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) throw new Error('扫描图内容无效');
  if (!/^[a-z_]+(?:\+[a-z_]+)*$/i.test(language)) throw new Error('OCR 语言参数无效');
  const extension = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 ? 'jpg' : 'png';
  return withTempFile(imageBuffer, extension, async filename => parseTesseractTsv(await run('tesseract',
    [filename, 'stdout', '-l', language, 'tsv'], { timeoutMs: 120000 })));
}

module.exports = { parsePdfTextBoxes, parseTesseractTsv, readPdfPageTextBoxes, readScanImageWords };
