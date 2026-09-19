import React from 'react'

export default function CheckupCompletionEvidence({ item }) {
  const proof = item?.checkupPreparationCompletion
  if (item?.status !== 'completed' || !proof?.servicePlanId || !proof?.handoffId || !proof?.finalTaskId || !proof?.reviewTaskId) return null
  return <section aria-label="体检服务自动完成依据" style={{ marginTop: 12, padding: 12, background: '#E8F5EF', borderRadius: 8, overflowWrap: 'anywhere' }}>
    <strong>体检服务验收后自动完成</strong>
    <p style={{ margin: '6px 0', fontSize: 13 }}>本次服务已完成顾问结果评估及最终验收，系统据此关闭原年度健管随访，无需重复填写执行记录。</p>
    <details>
      <summary>查看关联凭据</summary>
      <div>服务编号：{String(proof.servicePlanId)}</div>
      <div>顾问评估任务：{String(proof.reviewTaskId)}</div>
      <div>最终验收任务：{String(proof.finalTaskId)}</div>
      <div>承接编号：{String(proof.handoffId)}</div>
    </details>
  </section>
}
