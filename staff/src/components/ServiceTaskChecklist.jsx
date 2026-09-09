import React from 'react'

export function normalizeServiceChecklist(value = [], purposes = [], source = []) {
  const saved = Array.isArray(value) ? value : []
  const executor = Array.isArray(source) ? source : []
  const base = executor.length ? executor : (saved.length ? saved : purposes.map((purpose, index) => ({ key: `purpose_${index}`, purpose })))
  return base.map((item, index) => ({ ...item, ...(saved.find(savedItem => savedItem.key === item.key) || {}), key: item.key || `purpose_${index}` }))
}

export function summarizeServiceChecklist(rows = [], mode = 'executor') {
  return rows.map((item, index) => mode === 'supervisor'
    ? `${index + 1}. ${item.purpose}：${item.supervisionStatus === 'verified' ? '核验通过' : '需补充'}${item.supervisionNote ? `（${item.supervisionNote}）` : ''}`
    : `${index + 1}. ${item.purpose}：${completionLabel[item.executionStatus] || '未填写'}${item.executionResult ? `；结果：${item.executionResult}` : ''}${item.nextAction ? `；下一步：${item.nextAction}` : ''}`
  ).join('\n')
}

const btn = active => ({ border: `1px solid ${active ? '#1E6B50' : '#D8DDD9'}`, background: active ? '#E8F5EF' : '#fff', color: active ? '#1E6B50' : '#65776F', borderRadius: 15, padding: '4px 9px', cursor: 'pointer', fontSize: 11 })
const completionLabel = { completed: '已完成', partial: '部分完成', incomplete: '未完成' }

export default function ServiceTaskChecklist({ mode, purposes = [], value, source, onChange }) {
  const rows = normalizeServiceChecklist(value, purposes, source)
  const update = (index, patch) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  return (
    <div style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: '#F2F8F5', color: '#29483C', fontSize: 13, fontWeight: 750 }}>{mode === 'supervisor' ? '逐项目的督导' : '逐项目的完成记录'}</div>
      {rows.length === 0 && <div style={{ padding: 12, color: '#B45309', fontSize: 12 }}>方案尚未形成明确的代办目的，请先补充具体科室、专家及需要开具或领取的项目。</div>}
      {rows.map((item, index) => <div key={item.key} style={{ padding: 12, borderTop: index ? '1px solid #E8EFEB' : 'none', background: '#fff' }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.65, color: '#1A2B24' }}>{index + 1}. {item.purpose}</div>
        {mode === 'executor' ? <>
          {item.supervisionStatus === 'issue' && <div style={{ marginTop: 7, padding: '7px 9px', borderRadius: 7, background: '#FFF4E5', color: '#B45309', fontSize: 12 }}>督办退回：{item.supervisionNote || '请补充完成此项目'}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[['completed', '已完成'], ['partial', '部分完成'], ['incomplete', '未完成']].map(([key, label]) => <button key={key} type="button" style={btn(item.executionStatus === key)} onClick={() => update(index, { executionStatus: key })}>{label}</button>)}</div>
          <textarea className="form-control" rows={2} value={item.executionResult || ''} onChange={e => update(index, { executionResult: e.target.value })} placeholder="填写实际结果：开具了哪些检查单、预约了哪位专家、领取了哪些资料" style={{ marginTop: 8 }} />
          {item.executionStatus !== 'completed' && <input className="form-control" value={item.nextAction || ''} onChange={e => update(index, { nextAction: e.target.value })} placeholder="未完成原因、下一步及预计时间" style={{ marginTop: 7 }} />}
        </> : <>
          <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 8, background: '#F7F5F0', fontSize: 12, lineHeight: 1.6 }}><strong>代办结果：{completionLabel[item.executionStatus] || '未提交'}</strong>{item.executionResult && <div>{item.executionResult}</div>}{item.nextAction && <div style={{ color: '#B45309' }}>下一步：{item.nextAction}</div>}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[['verified', '核验通过'], ['issue', '退回补充']].map(([key, label]) => <button key={key} type="button" style={btn(item.supervisionStatus === key)} onClick={() => update(index, { supervisionStatus: key })}>{label}</button>)}</div>
          {item.supervisionStatus === 'issue' && <input className="form-control" value={item.supervisionNote || ''} onChange={e => update(index, { supervisionNote: e.target.value })} placeholder="需补充内容、责任人和期限" style={{ marginTop: 7 }} />}
        </>}
      </div>)}
    </div>
  )
}
