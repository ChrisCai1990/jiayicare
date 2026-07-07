import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// 用 pdf.js 把PDF逐页渲染到canvas，替代 <iframe src={pdfUrl}> 直接嵌入。
// 2026-07-07：不同浏览器/设备对"iframe能否原生渲染PDF"支持不一致（部分苹果/华为设备会显示空白
// 或直接触发下载而不是预览），审核弹窗看不到原图的真正根因即此——用pdf.js自己解析渲染，
// 不依赖浏览器/操作系统的PDF查看能力，所有设备表现一致。
export default function PdfPreview({ url }) {
  const containerRef = useRef(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setError('')
    setLoading(true)
    const container = containerRef.current
    if (container) container.innerHTML = ''

    pdfjsLib.getDocument(url).promise.then(async (pdf) => {
      if (cancelled || !container) return
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (cancelled) return
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = '100%'
        canvas.style.marginBottom = '8px'
        canvas.style.borderRadius = '6px'
        canvas.style.display = 'block'
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
        container.appendChild(canvas)
      }
      if (!cancelled) setLoading(false)
    }).catch(err => {
      if (!cancelled) { setError(err.message || 'PDF加载失败'); setLoading(false) }
    })

    return () => { cancelled = true }
  }, [url])

  if (error) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ color: '#DC3545', fontSize: 12, marginBottom: 8 }}>PDF预览失败：{error}</div>
        <button className="btn btn-primary btn-sm" onClick={() => window.open(url, '_blank')}>新窗口打开</button>
      </div>
    )
  }

  return (
    <div>
      {loading && <div style={{ fontSize: 12, color: '#8AA89C', padding: '8px 4px' }}>PDF加载中…</div>}
      <div ref={containerRef} />
    </div>
  )
}
