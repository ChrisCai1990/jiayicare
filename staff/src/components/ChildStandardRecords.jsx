import React, { useState } from 'react'
import { staffAPI } from '../api'
import forms from '../../../shared/childStandardForms.json'

export default function ChildStandardRecords({ user, onSaved, canEdit }) {
  const [formId, setFormId] = useState(forms[0].id)
  const [schedule, setSchedule] = useState(forms[0].schedule[0])
  const [visitDate, setVisitDate] = useState('')
  const [sourceType, setSourceType] = useState('本机构检查')
  const [values, setValues] = useState({})
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [supersedesId, setSupersedesId] = useState(null)
  const form = forms.find(item => item.id === formId)
  const records = [...(user.childStandardRecords || [])].reverse()
  const supersededIds = new Set(records.map(row => String(row.supersedesId || '')).filter(Boolean))
  const chooseForm = id => { const next = forms.find(item => item.id === id); setFormId(id); setSchedule(next.schedule[0]); setValues({}); setSupersedesId(null); setError('') }
  const revise = row => { setFormId(row.formId); setSchedule(row.schedule); setVisitDate(row.visitDate); setSourceType(row.sourceType); setValues({ ...row.values }); setNote(''); setSupersedesId(String(row._id)); setError(''); setEditing(true) }
  const save = async () => {
    setBusy(true); setError('')
    try {
      await staffAPI.addChildStandardRecord(user._id, { formId, schedule, visitDate, sourceType, values, note, supersedesId })
      setValues({}); setNote(''); setVisitDate(''); setSupersedesId(null); setEditing(false)
      await onSaved()
    } catch (err) { setError(err.message || '保存失败') } finally { setBusy(false) }
  }
  return <section style={{ marginTop: 18, borderTop: '1px solid #D8EDE3', paddingTop: 14 }}>
    <div style={{ fontWeight: 700, fontSize: 15 }}>分龄访视与体检记录</div>
    <div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>0～6岁按国家基本公共卫生服务规范的四类表单项目记录；在校儿童按年度体检办法的项目记录，具体表式以当地卫生健康部门规定为准。问卷自述只进入上方待核实流程，不会自动生成检查结果。未填写项目表示未记录。</div>
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>{forms.map(item => <span key={item.id} style={{ background: '#F2F8F5', color: '#1E6B50', padding: '5px 8px', borderRadius: 5, fontSize: 11 }}>{item.title}</span>)}</div>
    {canEdit && <div style={{ marginTop: 12 }}><button className="btn btn-secondary btn-sm" onClick={() => { setSupersedesId(null); setValues({}); setNote(''); setVisitDate(''); setEditing(open => !open) }}>{editing ? '收起记录表' : '新增分龄记录'}</button></div>}
    {editing && <div style={{ border: '1px solid #D8EDE3', borderRadius: 8, padding: 12, marginTop: 10 }}>
      {supersedesId && <div style={{ fontSize: 12, color: '#A65A00', marginBottom: 8 }}>正在修订历史记录。保存后原记录仍可查看，本次修订需要重新填写依据。</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 9 }}>
        <label style={{ fontSize: 12 }}>记录类型<select className="form-input" value={formId} disabled={!!supersedesId} onChange={e => chooseForm(e.target.value)}>{forms.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>访视节点<select className="form-input" value={schedule} disabled={!!supersedesId} onChange={e => setSchedule(e.target.value)}>{form.schedule.map(item => <option key={item}>{item}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>实际检查日期<input className="form-input" type="date" value={visitDate} disabled={!!supersedesId} onChange={e => setVisitDate(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>资料来源<select className="form-input" value={sourceType} onChange={e => setSourceType(e.target.value)}><option>本机构检查</option><option>外部报告转录</option></select></label>
      </div>
      <div style={{ fontSize: 12, marginTop: 10 }}>规范依据：<a href={form.sourceUrl} target="_blank" rel="noreferrer">{form.source}</a></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9, marginTop: 12 }}>{form.fields.map(([key, label, type, options]) => <label key={key} style={{ fontSize: 12 }}>{label}{type === 'select' ? <select className="form-input" value={values[key] ?? ''} onChange={e => setValues(all => ({ ...all, [key]: e.target.value }))}><option value="">未记录</option>{(options || []).map(option => <option key={option}>{option}</option>)}</select> : <input className="form-input" type={type === 'number' ? 'number' : 'text'} step={type === 'number' ? 'any' : undefined} value={values[key] ?? ''} onChange={e => setValues(all => ({ ...all, [key]: e.target.value }))} />}</label>)}</div>
      <textarea className="form-input" rows={2} style={{ marginTop: 10 }} placeholder="检查记录或外部报告的依据（必填）" value={note} onChange={e => setNote(e.target.value)} />
      {error && <div style={{ color: '#B42318', fontSize: 12 }}>{error}</div>}
      <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? '保存中…' : supersedesId ? '保存修订版本' : '保存本次记录'}</button>
    </div>}
    <div style={{ marginTop: 12 }}>{records.length ? records.map(row => { const selected = forms.find(item => item.id === row.formId); const superseded = supersededIds.has(String(row._id)); return <details key={String(row._id)} style={{ padding: '8px 0', borderBottom: '1px solid #E5EEE8' }}><summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{row.formTitle} · {row.schedule} · {row.visitDate} · {row.sourceType} · 已录入{Object.keys(row.values || {}).length}项{superseded ? ' · 历史版本' : row.supersedesId ? ' · 修订版' : ''}</summary><div style={{ fontSize: 12, color: '#65776F', marginTop: 6 }}>访视时：{row.ageStage?.label || '年龄段未记录'} · 录入：{row.recordedByName || '医护人员'} · {new Date(row.recordedAt).toLocaleString('zh-CN')}</div><div style={{ fontSize: 12, marginTop: 5 }}>依据：{row.note}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 5, marginTop: 8 }}>{Object.entries(row.values || {}).map(([key, value]) => <div key={key}>{row.fieldLabels?.[key] || selected?.fields.find(field => field[0] === key)?.[1] || key}：{String(value)}</div>)}</div>{canEdit && !superseded && <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => revise(row)}>修订此记录</button>}</details> }) : <div style={{ fontSize: 12, color: '#65776F' }}>尚无分龄访视或体检记录。</div>}</div>
  </section>
}
