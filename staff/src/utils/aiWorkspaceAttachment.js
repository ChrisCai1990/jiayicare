const MAX_TEXT = 12000

export async function readAiWorkspaceAttachment(file) {
  const name = file?.name?.trim()
  if (!name || name.length > 120) throw new Error('文件名过长或无效')
  const lower = name.toLowerCase()
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/.test(lower)) {
    if (file.size > 3 * 1024 * 1024) throw new Error('图片请控制在 3 MB 以内')
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new Error('仅支持 PNG、JPG、WEBP 图片')
    return { kind: 'image', name, dataUrl, size: file.size }
  }
  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    if (file.size > 5 * 1024 * 1024) throw new Error('PDF 请控制在 5 MB 以内')
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    try {
      if (document.numPages > 10) throw new Error('PDF 最多支持 10 页')
      let text = ''
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        text += `\n【第 ${pageNumber} 页】\n${content.items.map(item => item.str || '').join(' ')}`
        if (text.length > MAX_TEXT) throw new Error('PDF 文字超过 12000 字，请缩小文件范围')
      }
      if (!text.trim()) throw new Error('该 PDF 没有可提取的文字，扫描件请先转为图片上传')
      return { kind: 'text', name, text: text.trim(), size: file.size }
    } finally { await document.destroy() }
  }
  if (/\.(txt|md|csv)$/.test(lower)) {
    if (file.size > 100 * 1024) throw new Error('文本文件请控制在 100 KB 以内')
    const text = (await file.text()).trim()
    if (!text || text.length > MAX_TEXT) throw new Error('文件为空或文字超过 12000 字')
    return { kind: 'text', name, text, size: file.size }
  }
  throw new Error('支持 PNG、JPG、WEBP、PDF、TXT、MD、CSV 文件')
}
