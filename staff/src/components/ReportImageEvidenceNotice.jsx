import React from 'react'

export default function ReportImageEvidenceNotice({ evidence, hasItems = false }) {
  if (!evidence || !['image_only', 'needs_review'].includes(evidence.status)) return null
  const imageOnly = evidence.status === 'image_only'
  return <div role="status" style={{ margin: '10px 0 12px', padding: '14px 16px', borderRadius: 8,
    border: `1px solid ${imageOnly ? '#D9E4DF' : '#EED9AD'}`, background: imageOnly ? '#F5F8F6' : '#FFFAEF',
    color: '#344B40', fontSize: 13, lineHeight: 1.8 }}>
    <strong style={{ display: 'block', marginBottom: 4 }}>{imageOnly ? '影像资料页 · 无文字检查结果' : '原文待核对'}</strong>
    <div>{imageOnly ? '原图已保留，供医护查看。图像和测量标记不自动生成检查所见或诊断。请查看文字报告页；若没有文字报告，请补充报告或由医生填写。' : evidence.message}</div>
    {imageOnly && hasItems && <div style={{ marginTop: 6, color: '#9A6700' }}>本页已有条目未自动删除，请逐项核对来源；无原文依据的 AI 内容不应提交审核。</div>}
  </div>
}
