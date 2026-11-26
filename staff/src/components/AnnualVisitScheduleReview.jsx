import React, { useEffect, useMemo, useState } from 'react'
import DateInput from './DateInput'
import { byVisitDepartment, suggestedAssistedVisits, nearDateCandidates, nearbyVisitRows, changeVisitDate, changeVisitSeparationReason, groupVisitRows } from '../utils/annualVisitScheduling.mjs'

const serviceTypes = [
  ['proxy_booking', '代约 / 代办'], ['proxy_visit', '代诊'], ['escort_visit', '陪诊'],
  ['escort_exam', '陪检'], ['consult_coordination', '会诊协调'],
]

export default function AnnualVisitScheduleReview({ data, editable, onChange, onError, nearbyOnly = false }) {
  const trips = useMemo(() => nearbyOnly ? suggestedAssistedVisits(data) : [], [data, nearbyOnly])
  const [tripKey, setTripKey] = useState('')
  const trip = trips.find(items => items[0].key === tripKey) || trips[0]
  const rows = useMemo(() => trip || (nearbyOnly ? nearDateCandidates(data) : nearbyVisitRows(data)), [trip, data, nearbyOnly])
  const [manualSelection, setSelected] = useState([])
  const selected = trip ? trip.map(item => item.key) : manualSelection
  const [date, setDate] = useState('')
  const [leaderKey, setLeaderKey] = useState('')
  const [serviceMode, setServiceMode] = useState('')
  const [serviceType, setServiceType] = useState('')
  const chosen = rows.filter(row => selected.includes(row.key))
  useEffect(() => setSelected(previous => previous.filter(key => rows.some(row => row.key === key))), [data])
  useEffect(() => {
    if (!chosen.length) return
    const leader = chosen.find(row => row.moduleKey === 'medical_treatment' && ['managed', 'single'].includes(row.row.serviceMode)) || chosen.find(row => ['managed', 'single'].includes(row.row.serviceMode)) || chosen[0]
    setLeaderKey(leader.key)
    setServiceMode(['reminder', 'managed', 'single'].includes(leader.row.serviceMode) ? leader.row.serviceMode : '')
    setServiceType(leader.row.serviceType || '')
    setDate(leader.date || '')
  }, [selected.join('|')])
  // A single visit has nothing to merge; its date and service are edited on
  // the plan item itself.
  if (rows.length < 2) return null

  const groups = trip
    ? byVisitDepartment(rows, item => item.moduleKey === 'medical_treatment' ? item.row.department : item.row.order_dept)
    : [...new Set(rows.map(row => row.cluster))].map((cluster, index) => ({ name: `排期段 ${index + 1}`, items: rows.filter(row => row.cluster === cluster) }))
  const apply = () => {
    try {
      if (trip && !['single', 'managed'].includes(serviceMode)) throw new Error('请选择本次就医协助的服务方式')
      const next = groupVisitRows(data, selected, { date, leaderKey, serviceMode, serviceType, trackResults: nearbyOnly, assistedTrip: Boolean(trip) })
      onChange(next)
      setSelected([])
    } catch (error) { onError(error.message) }
  }
  const inputStyle = { padding: '6px 8px', border: '1px solid #D6DED8', borderRadius: 6, maxWidth: '100%' }
  return <details id="annual-visit-schedule-review" open={nearbyOnly} style={{ background: '#fff', border: '1px solid #B9D8C8', borderRadius: 12, padding: 16, marginBottom: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>{nearbyOnly ? `同次就诊合并建议（${rows.length} 项）` : '排期工具：合并多项同次就医与检查'}</summary>
    {trips.length > 1 && <label>选择就诊日期和医院　<select value={trip[0].key} onChange={event => setTripKey(event.target.value)}>
      {trips.map(items => <option key={items[0].key} value={items[0].key}>{items[0].date} · {items[0].row.hospital} · {items.length} 项</option>)}
    </select></label>}
    <p>{trip ? `${trip[0].date} · ${trip[0].row.hospital} · 1 条就医协助任务。请核对以下分科安排。` : '日期相近的项目，可按实际就诊安排选择合并。'}</p>
    {groups.map(({ name, items: group }) => <div key={name} style={{ borderTop: '1px solid #E5ECE7', paddingTop: 10, marginTop: 10 }}>
      <div style={{ fontSize: 12, color: '#62776A', marginBottom: 5 }}><strong style={{ fontSize: 16 }}>{name}</strong> · {group.length} 项</div>
      {group.map(item => <div key={item.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(180px,1fr) minmax(165px,auto)', gap: 9, alignItems: 'center', padding: '7px 0' }}>
        {editable && !trip ? <input type="checkbox" aria-label={`选择${item.title}`} checked={selected.includes(item.key)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.key] : previous.filter(key => key !== item.key))} /> : <span />}
        <div><strong style={{ fontSize: 13 }}>{item.title}</strong><div style={{ fontSize: 12, color: '#62776A' }}>{item.row.hospital || '医院待确认'}{item.row.order_dept ? ` · 开单科室：${item.row.order_dept}` : item.row.department ? ` · ${item.row.department}` : ''}{item.row.order_dept && item.row.department ? ` · 检查科室：${item.row.department}` : ''}{item.row.visitGroupId ? ` · 已归类：${item.row.visitGroupId}` : ''}</div></div>
        {editable ? <DateInput value={item.date} onChange={value => onChange(changeVisitDate(data, item.moduleKey, item.index, value))} label={`${item.title}建议日期`} style={inputStyle} /> : <span style={{ fontSize: 13 }}>{item.date || '日期待确认'}</span>}
        {(!trip || item.row.scheduleSeparationReason) && (group.length > 1 || item.row.scheduleSeparationReason) && <details style={{ gridColumn: '2 / -1', fontSize: 12, color: '#62776A' }}><summary style={{ cursor: 'pointer' }}>分开安排的原因或待核实条件{item.row.scheduleSeparationReason ? ' · 已填写' : ''}</summary>{editable ? <textarea value={item.row.scheduleSeparationReason || ''} onChange={event => onChange(changeVisitSeparationReason(data, item.moduleKey, item.index, event.target.value))} rows={2} placeholder="如医嘱时限、准备要求、先后顺序；核实可同次就诊后清空" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginTop: 5 }} /> : <div style={{ marginTop: 5 }}>{item.row.scheduleSeparationReason || '暂无说明'}</div>}</details>}
      </div>)}
    </div>)}
    {editable && selected.length >= 2 && <div style={{ marginTop: 14, padding: 12, background: '#F0F6F2', borderRadius: 8 }}>
      <strong style={{ fontSize: 13 }}>{trip ? '本次就医协助' : '将所选事项归为同次就诊'} · {selected.length} 项</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 9, alignItems: 'end' }}>
        <label style={{ fontSize: 12 }}>统一日期<br /><DateInput value={date} onChange={setDate} label="统一就诊日期" style={inputStyle} /></label>
        {!trip && <label style={{ fontSize: 12 }}>主事项<br /><select value={leaderKey} onChange={event => { const key = event.target.value; const leader = chosen.find(row => row.key === key); setLeaderKey(key); setServiceMode((trip ? ['managed', 'single'] : ['reminder', 'managed', 'single']).includes(leader?.row.serviceMode) ? leader.row.serviceMode : ''); setServiceType(leader?.row.serviceType || '') }} style={inputStyle}>{chosen.map(row => <option key={row.key} value={row.key}>{row.title.slice(0, 28)}</option>)}</select></label>}
        <label style={{ fontSize: 12 }}>服务方式<br /><select value={serviceMode} onChange={event => setServiceMode(event.target.value)} style={inputStyle}><option value="">请选择</option>{!trip && <option value="reminder">仅提醒</option>}<option value="managed">门诊一站式</option><option value="single">单项服务</option></select></label>
        {serviceMode === 'single' && <label style={{ fontSize: 12 }}>单项服务内容<br /><select value={serviceType} onChange={event => setServiceType(event.target.value)} style={inputStyle}><option value="">请选择</option>{serviceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <button type="button" className="btn btn-primary btn-sm" onClick={apply}>{trip ? '确认分科安排' : '确认归类'}</button>
      </div>
      <div style={{ marginTop: 7, fontSize: 12, color: '#62776A' }}>{trip ? '确认后按上列科室分别办理，各项检查保留原检查科室。推送时统一派发一次。' : '将统一所选事项的日期；仅提醒时按同次就诊生成一条提醒，不生成就医协助服务。选择单项或一站式时由主事项承接服务，其他事项随同办理。保存草稿后，推送前仍需通过服务校验。'}</div>
    </div>}
  </details>
}
