import React from 'react'

const OUTCOMES = { unverified: '待核实', achieved: '已达成', partial: '部分达成', not_achieved: '未达成', not_applicable: '本期不适用' }

export default function PhaseGoalReview({ rows = [], editable = false, onChange }) {
  if (!rows.length) return null
  const change = (index, patch) => onChange?.(rows.map((row, i) => i === index ? { ...row, ...patch } : row))
  return <section style={{ marginTop: 12, padding: 12, border: '1px solid #A7D1BA', borderRadius: 9, background: '#F4FAF6' }}>
    <strong>年度管理目标 · 本期核对</strong>
    <p style={{ fontSize: 12, color: '#52685D', margin: '5px 0 10px' }}>依据本期记录、随访和服务档案逐项判断。资料不足时选择“待核实”，并写明需要核对什么。</p>
    {rows.map((row, index) => <div key={`${row.issueId}-${index}`} style={{ background: '#fff', borderRadius: 8, padding: 10, marginTop: 8 }}>
      <div style={{ fontWeight: 700 }}>{row.sourceTitle || '管理问题'}：{row.goal}</div>
      {row.baseline && <div style={{ fontSize: 12, marginTop: 4 }}>基线：{row.baseline}</div>}
      {row.metricEvidence && <div style={{ fontSize: 12, marginTop: 4 }}>指标：{row.metricEvidence.latest?.value ?? '本期无可用结果'}{row.metricEvidence.latest?.unit || ''}{row.metricEvidence.incomplete ? '；来源可能不完整' : ''}</div>}
      {row.observationEvidence && <div style={{ fontSize: 12, marginTop: 4 }}>生活记录：{row.observationEvidence.coveredDays ?? row.observationEvidence.days ?? 0}天有记录；请结合原始内容核对</div>}
      <div style={{ fontSize: 12, marginTop: 4 }}>关联随访 {row.taskEvidence?.length || 0} 条 · 服务记录 {row.serviceEvidence?.length || 0} 条</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'start' }}>
        <label style={{ fontSize: 12 }}>目标结果<br /><select className="form-input" value={row.outcome || 'unverified'} disabled={!editable} onChange={event => change(index, { outcome: event.target.value })}>{Object.entries(OUTCOMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label style={{ flex: '1 1 260px', fontSize: 12 }}>判断依据或待核实内容<br /><textarea className="form-input" rows={2} maxLength={1000} value={row.outcomeNote || ''} disabled={!editable} onChange={event => change(index, { outcomeNote: event.target.value })} /></label>
      </div>
    </div>)}
  </section>
}
