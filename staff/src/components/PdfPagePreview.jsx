import React, { useEffect, useMemo, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export default function PdfPagePreview({ src, pageNumber, prefetchPages = [], height = '74vh', onAuthExpired }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const documentRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [status, setStatus] = useState('loading_document')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [pdfDocument, setPdfDocument] = useState(null)
  const sourceUrl = useMemo(() => String(src || '').split('#')[0], [src])
  const prefetchKey = useMemo(() => [...new Set((prefetchPages || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b).join(','), [prefetchPages])
  const authRefreshRequestedRef = useRef(false)

  const handleLoadError = err => {
    const message = err?.message || 'PDF 加载失败'
    if (/\b(?:401|403)\b|unauthori[sz]ed|forbidden/i.test(message) && !authRefreshRequestedRef.current) {
      authRefreshRequestedRef.current = true
      onAuthExpired?.()
    }
    setError(message)
    setStatus('error')
  }

  useEffect(() => {
    let active = true
    setStatus('loading_document')
    setError('')
    setPageCount(0)
    setPdfDocument(null)
    authRefreshRequestedRef.current = false
    const loadingTask = getDocument({
      url: sourceUrl,
      rangeChunkSize: 256 * 1024,
      disableAutoFetch: true,
      disableStream: true,
    })
    loadingTask.promise.then(pdf => {
      if (!active) return pdf.destroy()
      documentRef.current = pdf
      setPdfDocument(pdf)
      setPageCount(pdf.numPages)
      setStatus('ready')
    }).catch(err => { if (active) handleLoadError(err) })
    return () => {
      active = false
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
      const pdf = documentRef.current
      documentRef.current = null
      loadingTask.destroy?.()
      if (!loadingTask.destroy && pdf) pdf.destroy?.()
    }
  // 报告预览 URL 带短时令牌。即使文件路径相同，令牌刷新后也必须重建 PDF 文档；
  // 否则组件会继续持有已过期请求并一直显示 403。
  }, [sourceUrl])

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return
    let active = true
    const render = async () => {
      try {
        setStatus('rendering_page')
        const safePage = Math.min(Math.max(1, Number(pageNumber) || 1), pdfDocument.numPages)
        const page = await pdfDocument.getPage(safePage)
        if (!active) return
        const baseViewport = page.getViewport({ scale: 1 })
        const availableWidth = Math.max(240, (containerRef.current?.clientWidth || baseViewport.width) - 16)
        const viewport = page.getViewport({ scale: availableWidth / baseViewport.width })
        const ratio = Math.min(globalThis.devicePixelRatio || 1, 2)
        // 在离屏画布完成整页渲染后再替换可见画布，避免切页时先清空而长时间黑屏。
        const nextCanvas = document.createElement('canvas')
        const nextContext = nextCanvas.getContext('2d', { alpha: false })
        nextCanvas.width = Math.floor(viewport.width * ratio)
        nextCanvas.height = Math.floor(viewport.height * ratio)
        renderTaskRef.current?.cancel?.()
        const renderTask = page.render({ canvasContext: nextContext, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
        renderTaskRef.current = renderTask
        await renderTask.promise
        if (!active || !canvasRef.current) return
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        canvas.width = nextCanvas.width
        canvas.height = nextCanvas.height
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        context.drawImage(nextCanvas, 0, 0)
        renderTaskRef.current = null
        setStatus('ready')
      } catch (err) {
        if (!active || err?.name === 'RenderingCancelledException') return
        handleLoadError(err)
      }
    }
    render()
    return () => {
      active = false
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
    }
  }, [pageNumber, pdfDocument])

  useEffect(() => {
    if (!pdfDocument || status !== 'ready') return
    let cancelled = false
    const timer = setTimeout(async () => {
      const candidates = [...new Set([
        ...prefetchKey.split(',').map(Number),
        Number(pageNumber) + 1,
        Number(pageNumber) - 1,
      ])].filter(page => Number.isInteger(page) && page > 0 && page <= pdfDocument.numPages && page !== Number(pageNumber)).slice(0, 5)
      for (const target of candidates) {
        if (cancelled) break
        try {
          const page = await pdfDocument.getPage(target)
          if (cancelled) break
          await page.getOperatorList()
        } catch {
          // 预取失败不影响当前页；用户真正切换时仍会按正常路径重试。
        }
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [pdfDocument, pageNumber, prefetchKey, status])

  return (
    <div ref={containerRef} data-pdf-page={pageNumber} data-pdf-status={status} style={{ position: 'relative', minHeight: height, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', background: '#EEF2F0', borderRadius: 6 }}>
      <canvas ref={canvasRef} aria-label={`报告 PDF 第 ${pageNumber} 页`} style={{ display: status === 'error' ? 'none' : 'block', background: '#fff', boxShadow: '0 1px 5px rgba(20,45,34,0.12)' }} />
      {(status === 'loading_document' || status === 'rendering_page') && (
        <div style={{ position: 'absolute', top: 12, left: 12, padding: '5px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.92)', color: '#567065', fontSize: 11 }}>
          {status === 'loading_document' ? '首次载入原件…' : `正在显示第 ${pageNumber} 页…`}
        </div>
      )}
      {status === 'ready' && pageCount > 0 && (
        <div style={{ position: 'absolute', right: 10, bottom: 10, padding: '3px 7px', borderRadius: 10, background: 'rgba(28,48,39,0.72)', color: '#fff', fontSize: 10 }}>
          {pageNumber} / {pageCount}
        </div>
      )}
      {status === 'error' && (
        <div style={{ padding: 16, color: '#9B2C2C', fontSize: 12 }}>
          原件预览失败：{error}。<a href={`${sourceUrl}#page=${pageNumber}`} target="_blank" rel="noreferrer">在新窗口打开</a>
        </div>
      )}
    </div>
  )
}
