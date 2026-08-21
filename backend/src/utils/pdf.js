const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { signStoredUrl } = require('./oss');

function pdfTool(name) {
  const configuredBin = String(process.env.POPPLER_BIN || '').trim();
  if (!configuredBin) return name;
  return path.join(configuredBin, process.platform === 'win32' ? `${name}.exe` : name);
}

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
  // 已登记原件摘要的新报告始终从原件入口读取。content 仅兼容历史 Base64 报告，
  // 避免预览派生内容或旧客户端字段覆盖可追溯的 OCR 输入。
  if (!report.sourceFiles?.length && report.content) {
    const b64 = report.content.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(b64, 'base64');
  }
  if (report.fileUrl) {
    if (report.fileUrl.startsWith('http')) {
      return await downloadBuffer(signStoredUrl(report.fileUrl, report.ossKey || ''));
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

// 取一份报告关联的全部文件二进制（支持 fileUrls 数组——一份报告被拍成多张照片场景，如"结论页"+
// "数据页"，需要把每张图都读出来传给AI合并识别）。content/单fileUrl场景直接复用 fetchReportBuffer，
// 不改动其行为，保证PDF等原有调用路径完全不受影响。
async function fetchReportBuffers(report, uploadsDir) {
  const urls = (report.fileUrls && report.fileUrls.length) ? report.fileUrls : [];
  if (!urls.length) return [await fetchReportBuffer(report, uploadsDir)];
  const buffers = [];
  for (let index = 0; index < urls.length; index++) {
    const url = urls[index];
    if (url.startsWith('http')) {
      const key = report.ossKeys?.[index] || (index === 0 ? report.ossKey : '');
      buffers.push(await downloadBuffer(signStoredUrl(url, key)));
      continue;
    }
    let rel = url;
    const marker = '/uploads/';
    const i = rel.indexOf(marker);
    rel = i >= 0 ? rel.slice(i + marker.length) : rel.split('/').pop();
    const fpath = path.join(uploadsDir, rel);
    if (fs.existsSync(fpath)) buffers.push(fs.readFileSync(fpath));
    else throw new Error('文件不存在：' + fpath);
  }
  return buffers;
}

// 用 pdftoppm 获取 PDF 总页数
function getPdfPageCount(pdfPath) {
  return new Promise((resolve) => {
    execFile(pdfTool('pdfinfo'), [pdfPath], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const m = stdout.match(/Pages:\s*(\d+)/);
      resolve(m ? parseInt(m[1], 10) : null);
    });
  });
}

// Native PDFs often contain a reliable text layer. It is intentionally an
// optional evidence source: scanned/garbled documents keep the existing visual
// OCR path and no report is rejected when pdftotext is unavailable.
function extractPdfTextLayer(pdfBuffer) {
  return new Promise((resolve) => {
    const unavailable = () => resolve({ available: false, pageCount: 0, charCount: 0, pages: [] });
    const tmpPdf = path.join(os.tmpdir(), `pdf-text-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    try {
      fs.writeFileSync(tmpPdf, pdfBuffer);
    } catch {
      unavailable();
      return;
    }
    execFile(pdfTool('pdftotext'), ['-layout', tmpPdf, '-'], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      try { fs.unlinkSync(tmpPdf); } catch {}
      const raw = String(stdout || '').replace(/\r/g, '');
      const pages = raw ? raw.split('\f').map(page => page.trim()).filter(Boolean) : [];
      const meaningful = raw.replace(/\s/g, '').length;
      resolve({ available: !err && meaningful >= 80, pageCount: pages.length, charCount: meaningful, pages });
    });
  });
}

// 转换 PDF 指定页范围为 PNG base64 数组（单批，转完即清理临时文件）
function convertPdfRange(pdfPath, firstPage, lastPage, dpi, crop = null) {
  return new Promise((resolve, reject) => {
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbatch-'));
    } catch (e) { return reject(e); }
    const outPrefix = path.join(tmpDir, 'page');
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

    const cropArgs = crop ? ['-x', String(crop.x), '-y', String(crop.y), '-W', String(crop.width), '-H', String(crop.height)] : [];
    execFile(pdfTool('pdftoppm'), [
      '-png', '-r', String(dpi),
      ...cropArgs,
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
 * @param {number[]} [opts.pageNumbers]  只渲染指定页；用于文字层主提取后的视觉兜底
 * @param {Function} [opts.onBatch]  async (images: string[], batchIndex: number, pageNumbers: number[]) => void
 * @returns {Promise<string[]>}  若有 onBatch 则返回空数组；否则返回全部图片
 */
function groupPdfPageNumbers(pageNumbers, batchSize) {
  const pages = [...new Set((pageNumbers || []).map(Number)
    .filter(page => Number.isInteger(page) && page > 0))].sort((a, b) => a - b);
  return Array.from({ length: Math.ceil(pages.length / batchSize) }, (_, index) =>
    pages.slice(index * batchSize, (index + 1) * batchSize));
}

async function pdfBufferToImages(pdfBuffer, { dpi = 96, batchSize = 8, pageNumbers = null, onBatch } = {}) {
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
    const requestedGroups = Array.isArray(pageNumbers)
      ? groupPdfPageNumbers(pageNumbers.filter(page => page <= knownTotal), batchSize)
      : null;
    const groups = requestedGroups || Array.from(
      { length: Math.ceil(knownTotal / batchSize) },
      (_, index) => {
        const first = index * batchSize + 1;
        return Array.from({ length: Math.min(batchSize, knownTotal - first + 1) }, (__, offset) => first + offset);
      },
    );

    for (let batchIndex = 0; batchIndex < groups.length; batchIndex += 1) {
      const batchPages = groups[batchIndex];
      let images;
      let renderedPages;
      if (requestedGroups) {
        const rendered = await Promise.all(batchPages.map(async page => ({
          page,
          image: (await convertPdfRange(tmpPdf, page, page, dpi))[0] || null,
        })));
        images = rendered.filter(result => result.image).map(result => result.image);
        renderedPages = rendered.filter(result => result.image).map(result => result.page);
      } else {
        const first = batchPages[0];
        const last = batchPages[batchPages.length - 1];
        images = await convertPdfRange(tmpPdf, first, last, dpi);
        renderedPages = batchPages.slice(0, images.length);
      }
      if (images.length === 0) break; // pdftoppm 返回空说明已超出实际页数

      if (onBatch) {
        await onBatch(images, batchIndex, renderedPages);
      } else {
        allImages.push(...images);
      }
      // 如果实际转出的页数少于请求的，说明已到最后一批
      if (!requestedGroups && images.length < batchPages.length) break;
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

// Render a fractional page region for a tightly scoped OCR retry. Ratios are
// converted to pdftoppm pixel coordinates at the requested DPI.
async function renderSinglePageCrop(pdfBuffer, pageNum, crop, dpi = 240) {
  const tmpPdf = path.join(os.tmpdir(), `pdf-crop-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  try {
    const pageWidth = Math.round(8.27 * dpi);
    const pageHeight = Math.round(11.69 * dpi);
    const x = Math.round(pageWidth * Number(crop?.x || 0));
    const y = Math.round(pageHeight * Number(crop?.y || 0));
    const width = Math.round(pageWidth * Number(crop?.width || 1));
    const height = Math.round(pageHeight * Number(crop?.height || 1));
    const images = await convertPdfRange(tmpPdf, pageNum, pageNum, dpi, { x, y, width, height });
    return images[0] || null;
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

// 高密度表格页分区渲染，减少单次视觉模型输入和输出，避免整页识别超时。
async function renderSinglePageRegions(pdfBuffer, pageNum, dpi = 160) {
  const tmpPdf = path.join(os.tmpdir(), `pdf-regions-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  try {
    const width = Math.round(8.27 * dpi);
    const height = Math.round(11.69 * dpi);
    const overlap = Math.round(height * 0.08);
    const split = Math.round(height * 0.55);
    const crops = [
      { x: 0, y: 0, width, height: split },
      { x: 0, y: split - overlap, width, height: height - split + overlap },
    ];
    const images = [];
    for (const crop of crops) {
      const rendered = await convertPdfRange(tmpPdf, pageNum, pageNum, dpi, crop);
      if (rendered[0]) images.push(rendered[0]);
    }
    return images;
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

// 双栏检验单按左右半幅物理切图；整图提示无法保证视觉模型真正移动到右栏。
async function renderSinglePageColumns(pdfBuffer, pageNum, dpi = 180) {
  const tmpPdf = path.join(os.tmpdir(), `pdf-columns-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(tmpPdf, pdfBuffer);
  try {
    const width = Math.round(8.27 * dpi);
    const height = Math.round(11.69 * dpi);
    const overlap = Math.round(width * 0.08);
    const split = Math.round(width * 0.52);
    const crops = [
      { x: 0, y: 0, width: split, height },
      { x: split - overlap, y: 0, width: width - split + overlap, height },
    ];
    const images = [];
    for (const crop of crops) {
      const rendered = await convertPdfRange(tmpPdf, pageNum, pageNum, dpi, crop);
      if (rendered[0]) images.push(rendered[0]);
    }
    return images;
  } finally {
    try { fs.unlinkSync(tmpPdf); } catch {}
  }
}

async function splitImageColumns(imageBuffer) {
  const Jimp = require('jimp-compact');
  const image = await Jimp.read(imageBuffer);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const overlap = Math.round(width * 0.08);
  const split = Math.round(width * 0.52);
  const crops = [image.clone().crop(0, 0, split, height), image.clone().crop(split - overlap, 0, width - split + overlap, height)];
  return Promise.all(crops.map(crop => new Promise((resolve, reject) => {
    crop.getBase64(Jimp.MIME_PNG, (error, value) => error ? reject(error) : resolve(String(value).split(',')[1]));
  })));
}

// 判断报告是否为 PDF
function isPdfReport(report) {
  return report.mimeType === 'application/pdf'
    || (report.fileUrl || '').toLowerCase().includes('.pdf')
    || (report.content || '').startsWith('data:application/pdf');
}

module.exports = { fetchReportBuffer, fetchReportBuffers, groupPdfPageNumbers, pdfBufferToImages, isPdfReport, extractPdfTextLayer, renderSinglePage, renderSinglePageCrop, renderSinglePageRegions, renderSinglePageColumns, splitImageColumns };
