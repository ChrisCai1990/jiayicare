import React, { useEffect, useMemo, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export default function PdfPagePreview({ src, pageNumber, height = '74vh' }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const documentRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [status, setStatus] = useState('loading_document')
  const [error, setError] = useState('')
  const [pageCount, setPageCount] = useState(0)
  const [pdfDocument, setPdfDocument] = useState(null)
  const sourceUrl = useMemo(() => String(src || '').split('#')[0], [src])

  useEffect(() => {
    let active = true
    setStatus('loading_document')
    setError('')
    setPageCount(0)
    setPdfDocument(null)
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
    }).catch(err => {
      if (!active) return
      setError(err?.message || 'PDF 加载失败')
      setStatus('error')
    })
    return () => {
      active = false
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
      const pdf = documentRef.current
      documentRef.current = null
      loadingTask.destroy?.()
      if (!loadingTask.destroy && pdf) pdf.destroy?.()
    }
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
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false })
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        renderTaskRef.current?.cancel?.()
        const renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
        renderTaskRef.current = renderTask
        await renderTask.promise
        if (active) setStatus('ready')
      } catch (err) {
        if (!active || err?.name === 'RenderingCancelledException') return
        setError(err?.message || 'PDF 页面渲染失败')
        setStatus('error')
      }
    }
    render()
    return () => {
      active = false
      renderTaskRef.current?.cancel?.()
      renderTaskRef.current = null
    }
  }, [pageNumber, pdfDocument])

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
