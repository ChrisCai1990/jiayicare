const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const content = 'BT /F1 24 Tf 30 100 Td (PDF preview works) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xrefAt = Buffer.byteLength(pdf);
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'miniprogram/src/utils/h5FilePreview.js'), 'utf8')
  .replace('pdfjs-dist/legacy/build/pdf.mjs', '/pdf.mjs')
  .replace('pdfjs-dist/legacy/build/pdf.worker.min.mjs', '/pdf.worker.mjs');
const files = {
  '/preview.js': [source, 'text/javascript'],
  '/pdf.mjs': [fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')), 'text/javascript'],
  '/pdf.worker.mjs': [fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')), 'text/javascript'],
  '/sample.pdf': [pdf, 'application/pdf'],
  '/': ['<script type="module">import {openH5FilePreview} from "/preview.js";openH5FilePreview(["/sample.pdf"],false)</script>', 'text/html'],
};
const server = http.createServer((req, res) => {
  const [body, type] = files[req.url] || ['missing', 'text/plain'];
  res.writeHead(files[req.url] ? 200 : 404, { 'Content-Type': type });
  res.end(body);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 0, null, { timeout: 15000 });
    await page.waitForFunction(() => !document.body.textContent.includes('正在加载 PDF'), null, { timeout: 15000 });
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0;
      for (let i = 0; i < bytes.length; i += 4) if (bytes[i] < 200) ink += 1;
      return ink;
    });
    if (errors.length || pixels < 100) throw new Error(`PDF render failed: ${JSON.stringify({ errors, pixels })}`);
    console.log(`PDF canvas rendered; ink pixels: ${pixels}`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
