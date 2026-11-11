const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseScannedLabTable } = require('./reportScanTable');

const packageDir = process.env.REPORT_OCR_PACKAGE_DIR || path.join(__dirname, '../../.ocr-runtime/site');
const script = path.join(__dirname, '../../scripts/scanTableOcr.py');

function isLocalScanOcrAvailable() {
  return fs.existsSync(path.join(packageDir, 'rapidocr')) && fs.existsSync(path.join(packageDir, 'onnxruntime'));
}

async function extractScannedLabTable(imageBuffer, sourcePage) {
  if (!isLocalScanOcrAvailable()) return { supported: false, reason: 'runtime_unavailable', items: [] };
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length || imageBuffer.length > 20 * 1024 * 1024) {
    throw new Error('扫描页图像大小无效');
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'report-scan-ocr-'));
  const imagePath = path.join(directory, 'page.jpg');
  try {
    fs.writeFileSync(imagePath, imageBuffer, { mode: 0o600 });
    const stdout = await new Promise((resolve, reject) => execFile(
      process.env.REPORT_OCR_PYTHON || 'python3', [script, imagePath], {
        timeout: 120000, maxBuffer: 3 * 1024 * 1024, encoding: 'utf8',
        env: { ...process.env, PYTHONPATH: [packageDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
          PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' },
      }, (error, output) => error ? reject(error) : resolve(output)));
    const result = JSON.parse(stdout);
    if (result.layout !== 'two_column') return { supported: false, reason: 'layout_unsupported', items: [] };
    const items = parseScannedLabTable(result.rows, { width: result.width, sourcePage });
    return { supported: items.length > 0, reason: items.length ? '' : 'no_rows', items,
      diagnostics: { detectedBoxes: result.rows.length, candidateRows: items.length,
        leftValues: result.leftValues, rightValues: result.rightValues, seconds: result.seconds } };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { extractScannedLabTable, isLocalScanOcrAvailable };
