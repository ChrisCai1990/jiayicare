import React, { useEffect, useMemo, useState } from 'react'
import DateInput from './DateInput'
import { nearbyVisitRows, changeVisitDate, changeVisitSeparationReason, groupVisitRows } from '../utils/annualVisitScheduling.mjs'

const serviceTypes = [
  ['proxy_booking', '代约 / 代办'], ['proxy_visit', '代诊'], ['escort_visit', '陪诊'],
  ['escort_exam', '陪检'], ['consult_coordination', '会诊协调'],
]

export default function AnnualVisitScheduleReview({ data, editable, onChange, onError }) {
  const rows = useMemo(() => nearbyVisitRows(data), [data])
  const [selected, setSelected] = useState([])
  const [date, setDate] = useState('')
  const [leaderKey, setLeaderKey] = useState('')
  const [serviceMode, setServiceMode] = useState('')
  const [serviceType, setServiceType] = useState('')
  const chosen = rows.filter(row => selected.includes(row.key))
  useEffect(() => setSelected(previous => previous.filter(key => rows.some(row => row.key === key))), [data])
  useEffect(() => {
    if (!chosen.length) return
    const leader = chosen.find(row => ['managed', 'single'].includes(row.row.serviceMode)) || chosen[0]
    setLeaderKey(leader.key)
    setServiceMode(['managed', 'single'].includes(leader.row.serviceMode) ? leader.row.serviceMode : '')
    setServiceType(leader.row.serviceType || '')
    setDate(leader.date || '')
  }, [selected.join('|')])
  if (!rows.length) return null

  const groups = [...new Set(rows.map(row => row.cluster))].map(cluster => rows.filter(row => row.cluster === cluster))
  const apply = () => {
    try {
      const next = groupVisitRows(data, selected, { date, leaderKey, serviceMode, serviceType })
      onChange(next)
      setSelected([])
    } catch (error) { onError(error.message) }
  }
  const inputStyle = { padding: '6px 8px', border: '1px solid #D6DED8', borderRadius: 6, maxWidth: '100%' }
  return <details style={{ background: '#fff', border: '1px solid #B9D8C8', borderRadius: 12, padding: 16, marginBottom: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>就医与检查排期统筹 · {rows.length} 项</summary>
    <p style={{ fontSize: 12, color: '#62776A' }}>按建议日期排列，相隔 14 天以内的事项相邻显示。顾问可修改 AI 建议日期；同次就诊需核实医院、时限、准备要求及实际行程后再归类。归类后仅保留一次服务安排，全部事项仍会交给执行人员。</p>
    {groups.map((group, groupIndex) => <div key={group[0].cluster} style={{ borderTop: '1px solid #E5ECE7', paddingTop: 10, marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#62776A', marginBottom: 5 }}>排期段 {groupIndex + 1} · {group.length} 项{group.length > 1 ? '（相邻日期不代表必须同次就诊）' : ''}</div>
      {group.map(item => <div key={item.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(180px,1fr) minmax(165px,auto)', gap: 9, alignItems: 'center', padding: '7px 0' }}>
        {editable ? <input type="checkbox" aria-label={`选择${item.title}`} checked={selected.includes(item.key)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.key] : previous.filter(key => key !== item.key))} /> : <span />}
        <div><strong style={{ fontSize: 13 }}>{item.title}</strong><div style={{ fontSize: 12, color: '#62776A' }}>{item.row.hospital || '医院待确认'}{item.row.department ? ` · ${item.row.department}` : ''}{item.row.visitGroupId ? ` · 已归类：${item.row.visitGroupId}` : ''}</div></div>
        {editable ? <DateInput value={item.date} onChange={value => onChange(changeVisitDate(data, item.moduleKey, item.index, value))} label={`${item.title}建议日期`} style={inputStyle} /> : <span style={{ fontSize: 13 }}>{item.date || '日期待确认'}</span>}
        {(group.length > 1 || item.row.scheduleSeparationReason) && <details style={{ gridColumn: '2 / -1', fontSize: 12, color: '#62776A' }}><summary style={{ cursor: 'pointer' }}>分开安排的原因或待核实条件{item.row.scheduleSeparationReason ? ' · 已填写' : ''}</summary>{editable ? <textarea value={item.row.scheduleSeparationReason || ''} onChange={event => onChange(changeVisitSeparationReason(data, item.moduleKey, item.index, event.target.value))} rows={2} placeholder="如医嘱时限、准备要求、先后顺序；核实可同次就诊后清空" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginTop: 5 }} /> : <div style={{ marginTop: 5 }}>{item.row.scheduleSeparationReason || '暂无说明'}</div>}</details>}
      </div>)}
    </div>)}
    {editable && selected.length >= 2 && <div style={{ marginTop: 14, padding: 12, background: '#F0F6F2', borderRadius: 8 }}>
      <strong style={{ fontSize: 13 }}>将所选 {selected.length} 项归为同次就诊</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 9, alignItems: 'end' }}>
        <label style={{ fontSize: 12 }}>统一日期<br /><DateInput value={date} onChange={setDate} label="统一就诊日期" style={inputStyle} /></label>
        <label style={{ fontSize: 12 }}>主事项<br /><select value={leaderKey} onChange={event => { const key = event.target.value; const leader = chosen.find(row => row.key === key); setLeaderKey(key); setServiceMode(['managed', 'single'].includes(leader?.row.serviceMode) ? leader.row.serviceMode : ''); setServiceType(leader?.row.serviceType || '') }} style={inputStyle}>{chosen.map(row => <option key={row.key} value={row.key}>{row.title.slice(0, 28)}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>服务方式<br /><select value={serviceMode} onChange={event => setServiceMode(event.target.value)} style={inputStyle}><option value="">请选择</option><option value="managed">门诊一站式</option><option value="single">单项服务</option></select></label>
        {serviceMode === 'single' && <label style={{ fontSize: 12 }}>单项服务内容<br /><select value={serviceType} onChange={event => setServiceType(event.target.value)} style={inputStyle}><option value="">请选择</option>{serviceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <button type="button" className="btn btn-primary btn-sm" onClick={apply}>确认归类</button>
      </div>
      <div style={{ marginTop: 7, fontSize: 12, color: '#62776A' }}>将统一所选事项的日期；主事项承接一次服务，其他事项随同办理。保存草稿后，推送前仍需通过服务校验。</div>
    </div>}
  </details>
}
