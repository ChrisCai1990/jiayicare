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

// 用 pdftoppm 获取 PDF 总页数
function getPdfPageCount(pdfPath) {
  return new Promise((resolve) => {
    execFile('pdfinfo', [pdfPath], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const m = stdout.match(/Pages:\s*(\d+)/);
      resolve(m ? parseInt(m[1], 10) : null);
    });
  });
}

// 转换 PDF 指定页范围为 PNG base64 数组（单批，转完即清理临时文件）
function convertPdfRange(pdfPath, firstPage, lastPage, dpi) {
  return new Promise((resolve, reject) => {
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbatch-'));
    } catch (e) { return reject(e); }
    const outPrefix = path.join(tmpDir, 'page');
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

    execFile('pdftoppm', [
      '-png', '-r', String(dpi),
      '-f', String(firstPage), '-l', String(lastPage),
      pdfPath, outPrefix,
    ], { timeout: 60000 }, (err) => {
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
        resolve(images);
      } catch (e) { cleanup(); reject(e); }
    });
  });
}

/**
 * 把 PDF Buffer 按批次转成 PNG base64 数组，每批处理完后立即释放内存。
 * callback(batchImages, batchIndex) 在每批转换完成后被调用；
 * 若不传 callback，则收集所有图片一次返回（仅适合小文件）。
 *
 * @param {Buffer} pdfBuffer
 * @param {object} opts
 * @param {number} opts.dpi        默认 96
 * @param {number} opts.batchSize  每批页数，默认 8（内存可控）
 * @param {Function} [opts.onBatch]  async (images: string[], batchIndex: number) => void
 * @returns {Promise<string[]>}  若有 onBatch 则返回空数组；否则返回全部图片
 */
async function pdfBufferToImages(pdfBuffer, { dpi = 96, batchSize = 8, onBatch } = {}) {
  // 先把 PDF 写到临时文件（保留整个解析过程，批次共用）
  const tmpPdf = path.join(os.tmpdir(), `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  const cleanupPdf = () => { try { fs.unlinkSync(tmpPdf); } catch {} };

  try {
    // 获取总页数
    const totalPages = await getPdfPageCount(tmpPdf);
    // pdfinfo 不一定有，fallback：用 pdftoppm 转一大批，看实际产出了几页
    const knownTotal = totalPages || 999;

    const allImages = [];
    let batchIndex = 0;

    for (let first = 1; first <= knownTotal; first += batchSize) {
      const last = Math.min(first + batchSize - 1, knownTotal);
      const images = await convertPdfRange(tmpPdf, first, last, dpi);
      if (images.length === 0) break; // pdftoppm 返回空说明已超出实际页数

      if (onBatch) {
        await onBatch(images, batchIndex);
      } else {
        allImages.push(...images);
      }
      batchIndex++;

      // 如果实际转出的页数少于请求的，说明已到最后一批
      if (images.length < last - first + 1) break;
    }

    if (!onBatch && allImages.length === 0) {
      throw new Error('PDF未生成任何页面图片');
    }
    return allImages;
  } finally {
    cleanupPdf();
  }
}

// 只把 PDF 里某一页重新转成一张 PNG base64（用于"某检验单提取条数不全，只重试这一页"场景，不用整份报告重新跑）
async function renderSinglePage(pdfBuffer, pageNum, dpi = 96) {
  const tmpPdf = path.join(os.tmpdir(), `pdf-single-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  try {
    const images = await convertPdfRange(tmpPdf, pageNum, pageNum, dpi);
    return images[0] || null;
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

// 判断报告是否为 PDF
function isPdfReport(report) {
  return report.mimeType === 'application/pdf'
    || (report.fileUrl || '').toLowerCase().includes('.pdf')
    || (report.content || '').startsWith('data:application/pdf');
}

module.exports = { fetchReportBuffer, pdfBufferToImages, isPdfReport, renderSinglePage };
