import React, { useEffect, useRef } from 'react'
import { staffAPI } from '../api'

import { reportReviewConcerns } from '../utils/reportReviewQuality'

export function useReportReviewActivity(reportId) {
  const flush = useRef(() => Promise.resolve())
  useEffect(() => {
    if (!reportId) return
    const sessionId = crypto.randomUUID()
    let sequence = 0, lastActivity = Date.now(), inFlight = false
    const activity = () => { lastActivity = Date.now() }
    const send = async () => {
      if (inFlight || document.hidden || Date.now() - lastActivity > 120000) return
      inFlight = true
      try { await staffAPI.reportReviewActivity(reportId, { sessionId, sequence: ++sequence }) } catch {} finally { inFlight = false }
    }
    flush.current = send
    send()
    const interval = setInterval(send, 15000)
    for (const event of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(event, activity, true)
    return () => {
      clearInterval(interval)
      for (const event of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(event, activity, true)
      flush.current = () => Promise.resolve()
    }
  }, [reportId])
  return flush
}

export default function ReportReviewQuality({ report, items, onChange, onFocus }) {
  const concerns = reportReviewConcerns(items)
  const people = Object.values(report.reviewActivity || {}).reduce((result, entry) => {
    const key = entry.actorId
    result[key] = { name: entry.actorName, durationMs: (result[key]?.durationMs || 0) + (entry.durationMs || 0) }
    return result
  }, {})
  return <div style={{ padding: 12, background: '#fff9ed', borderBottom: '1px solid #eadfc9', maxHeight: 180, overflow: 'auto' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>检查日期 <input type="date" value={report.checkDate || report.date || ''} onChange={e => onChange({ checkDate: e.target.value, date: e.target.value })} /></label>
      <label>来源机构 <input value={report.institution || report.hospital || ''} onChange={e => onChange({ institution: e.target.value, hospital: e.target.value, institutionStatus: e.target.value ? 'confirmed' : 'pending' })} /></label>
      <label><input type="checkbox" checked={report.institutionStatus === 'unknown'} onChange={e => onChange({ institutionStatus: e.target.checked ? 'unknown' : 'pending', ...(e.target.checked ? { institution: '', hospital: '' } : {}) })} />已核实，来源机构不明</label>
    </div>
    <div style={{ fontSize: 12, marginTop: 6 }}>请核对原文与数据；分类由 admin 维护，待归类不影响内容审核。</div>
    {Object.values(people).length > 0 && <div style={{ fontSize: 12 }}>已记录审核时长：{Object.values(people).map(person => `${person.name || '审核员'} ${Math.round(person.durationMs / 60000)}分钟`).join('；')}（重新打开时更新）</div>}
    {concerns.map((concern, i) => <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
      {items[concern.index]?.name}：{concern.message} <button onClick={() => onFocus(concern.index)}>定位第{items[concern.index]?.sourcePage || '?'}页</button>
      {concern.other !== undefined && <button onClick={() => onFocus(concern.other)}>对照第{items[concern.other]?.sourcePage || '?'}页</button>}
    </div>)}
  </div>
}
