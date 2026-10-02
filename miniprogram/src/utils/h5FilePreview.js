// Files are fetched with the user's bearer token before this is called. Keep
// their object URLs inside the current page and release them when it closes.
async function renderPdf(url, body, isClosed) {
  // Legacy build supports Android System WebViews older than desktop Chrome.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url,
  ).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error('PDF 文件读取失败');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (isClosed()) return;
  const documentTask = pdfjs.getDocument({ data: bytes });
  const pdf = await documentTask.promise;
  try {
    for (let pageNo = 1; pageNo <= pdf.numPages && !isClosed(); pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const initial = page.getViewport({ scale: 1 });
      const width = Math.max(240, Math.min(body.clientWidth - 24, 900));
      const scale = width / initial.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewport.width * pixelRatio);
      canvas.height = Math.round(viewport.height * pixelRatio);
      canvas.style.cssText = `display:block;width:${viewport.width}px;max-width:100%;height:auto;margin:12px auto;background:#fff;`;
      body.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] }).promise;
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

export function openH5FilePreview(urls, isImage) {
  if (typeof document === 'undefined' || !urls?.length) throw new Error('无法打开原始文件');
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#fff;display:flex;flex-direction:column;';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #ddd;';
  const title = document.createElement('span');
  title.textContent = '原始报告文件';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.style.cssText = 'border:0;background:transparent;color:#1e6b50;font-size:16px;';
  let closed = false;
  const release = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    urls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  };
  close.addEventListener('click', release, { once: true });
  bar.append(title, close);
  overlay.appendChild(bar);
  const body = document.createElement('div');
  body.style.cssText = 'flex:1;overflow:auto;background:#f5f3ed;';
  urls.forEach((url, index) => {
    if (isImage) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = `报告原件 ${index + 1}`;
      image.style.cssText = 'display:block;max-width:100%;height:auto;margin:12px auto;';
      body.appendChild(image);
    } else {
      const status = document.createElement('div');
      status.textContent = '正在加载 PDF…';
      status.style.cssText = 'padding:16px;text-align:center;color:#555;';
      body.appendChild(status);
      renderPdf(url, body, () => closed).then(() => status.remove()).catch(() => {
        if (!closed) status.textContent = 'PDF 预览失败，请稍后重试';
      });
    }
  });
  overlay.appendChild(body);
  document.body.appendChild(overlay);
  return release;
}
