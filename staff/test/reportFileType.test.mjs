import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isImageReportFile, isPdfReportFile } from '../src/utils/reportFileType.js'

test('recognizes a PDF when the signed preview URL has no extension', () => {
  const report = {
    title: '2026年5月肿瘤标志物.pdf',
    fileUrl: 'https://oss.example.com/private/report.pdf?signature=abc',
    previewUrl: '/api/staff/medical-reports/123/preview/0?token=xyz',
    mimeType: 'application/octet-stream',
  }
  assert.equal(isPdfReportFile(report, report.previewUrl), true)
  assert.equal(isImageReportFile(report, report.previewUrl), false)
})

test('recognizes image reports from the original file URL', () => {
  const report = {
    fileUrl: 'https://oss.example.com/private/report.jpeg?signature=abc',
    previewUrl: '/api/staff/medical-reports/123/preview/0?token=xyz',
  }
  assert.equal(isImageReportFile(report, report.previewUrl), true)
  assert.equal(isPdfReportFile(report, report.previewUrl), false)
})

test('opens PDF reports directly instead of sending them to the image lightbox', () => {
  const source = readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8')
  assert.match(source, /if \(isPdf \|\| !isImg\) \{\s*window\.open\(src, '_blank', 'noopener,noreferrer'\)/)
})
