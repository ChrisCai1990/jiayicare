const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

// 下载远程文件为 Buffer（跟随一次重定向）
function downloadBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects <= 0) return reject(new Error('重定向次数过多'));
        return resolve(downloadBuffer(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) return reject(new Error('下载失败 HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 从报告记录里取出 PDF 二进制（优先 content base64，其次 fileUrl）
async function fetchReportBuffer(report, uploadsDir) {
  if (report.content) {
    const b64 = report.content.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(b64, 'base64');
  }
  if (report.fileUrl) {
    if (report.fileUrl.startsWith('http')) {
      return await downloadBuffer(report.fileUrl);
    }
    // 本地路径，如 /api/uploads/reports/xxx.pdf → 取 /uploads/ 之后的相对路径（含子目录）
    let rel = report.fileUrl;
    const marker = '/uploads/';
    const i = rel.indexOf(marker);
    rel = i >= 0 ? rel.slice(i + marker.length) : rel.split('/').pop();
    const fpath = path.join(uploadsDir, rel);
    if (fs.existsSync(fpath)) return fs.readFileSync(fpath);
    throw new Error('文件不存在：' + fpath);
  }
  throw new Error('无法获取报告文件内容（content 与 fileUrl 均为空）');
}

// 把 PDF Buffer 逐页转成 PNG 的 base64 数组（依赖系统 pdftoppm / poppler-utils）
function pdfBufferToImages(pdfBuffer, { dpi = 150, maxPages = 10 } = {}) {
  return new Promise((resolve, reject) => {
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfimg-'));
    } catch (e) { return reject(e); }
    const pdfPath = path.join(tmpDir, 'in.pdf');
    const outPrefix = path.join(tmpDir, 'page');
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };
    try {
      fs.writeFileSync(pdfPath, pdfBuffer);
    } catch (e) { cleanup(); return reject(e); }

    // pdftoppm -png -r <dpi> -l <maxPages> in.pdf page  →  page-1.png, page-2.png ...
    execFile('pdftoppm', ['-png', '-r', String(dpi), '-l', String(maxPages), pdfPath, outPrefix],
      { timeout: 120000 }, (err) => {
        if (err) { cleanup(); return reject(new Error('PDF转图片失败：' + err.message)); }
        try {
          const files = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith('page') && f.endsWith('.png'))
            .sort((a, b) => {
              const na = parseInt((a.match(/(\d+)\.png$/) || [])[1] || '0', 10);
              const nb = parseInt((b.match(/(\d+)\.png$/) || [])[1] || '0', 10);
              return na - nb;
            });
          const images = files.map(f => fs.readFileSync(path.join(tmpDir, f)).toString('base64'));
          cleanup();
          if (images.length === 0) return reject(new Error('PDF未生成任何页面图片'));
          resolve(images);
        } catch (e) { cleanup(); reject(e); }
      });
  });
}

// 判断报告是否为 PDF
function isPdfReport(report) {
  return report.mimeType === 'application/pdf'
    || (report.fileUrl || '').toLowerCase().includes('.pdf')
    || (report.content || '').startsWith('data:application/pdf');
}

module.exports = { fetchReportBuffer, pdfBufferToImages, isPdfReport };
