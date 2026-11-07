import SearchableStaffSelect from './SearchableStaffSelect'
import React, { useEffect, useState } from 'react'
import { staffAPI, psychologyAPI } from '../api'
import { useStaff } from '../App'
import PatientPicker from './PatientPicker'

const types = [['single', '专家咨询', '围绕具体问题，请专家提供意见'], ['mdt', 'MDT 多学科咨询', '邀请多位专家共同评估'], ['psychology', '长期心理咨询', '建立持续服务关系，逐次记录会谈']]
export default function ConsultationCreatePanel({ initialType, onClose, onCreated }) {
  const { staff } = useStaff()
  const [type, setType] = useState(initialType)
  const [form, setForm] = useState({ patientId:'', psychologistId:'', request:'', expertCount:2 })
  const [options, setOptions] = useState({ patients:[], psychologists:[] })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [takeoverReason, setTakeoverReason] = useState('')
  useEffect(() => { if (staff?.role !== 'familyDoctor') return; let active = true; setLoading(true); psychologyAPI.get('/options').then(r => { if (active) setOptions(r.data) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [staff?.role])
  useEffect(() => { const escape = e => { if (e.key === 'Escape' && !busy) onClose() }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape) }, [busy, onClose])
  const change = key => e => setForm({ ...form, [key]: e.target.value })
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const result = type === 'psychology'
        ? await psychologyAPI.post('', { patientId:form.patientId, psychologistId:form.psychologistId, sharedBackground:form.request })
        : await staffAPI.createExpertConsultation({ patientId:form.patientId, type, request:form.request, expertCount:Number(form.expertCount) })
      onCreated(type, result.data)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="consultation-create-backdrop"><section className="consultation-create-panel" role="dialog" aria-modal="true" aria-labelledby="consultation-create-title"><header><div><h2 id="consultation-create-title">发起服务</h2><p>选择服务类型，填写本次协作需求。</p></div><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose} aria-label="关闭发起服务">关闭</button></header>
    <form onSubmit={submit}><fieldset disabled={busy}><div className="service-type-options">{types.filter(([key]) => key !== 'psychology' || staff?.role === 'familyDoctor').map(([key,title,description]) => <button key={key} type="button" className={type === key ? 'selected' : ''} aria-pressed={type === key} onClick={() => { setType(key); setForm(f => ({ ...f, patientId:'' })); setError('') }}><strong>{title}</strong><span>{description}</span></button>)}</div>
      <div className="consultation-form-grid"><div className="form-group">{type === 'psychology' ? <SearchableStaffSelect inputId="consultation-patient" label="服务客户 *" people={options.patients} value={form.patientId} onChange={patientId => setForm(f => ({ ...f, patientId }))} getLabel={p => p.name} placeholder={loading ? '正在加载…' : '输入客户姓名搜索'} emptyMessage="未找到您负责的匹配客户" required disabled={busy || loading} /> : <><label className="form-label">服务客户 *</label><PatientPicker value={form.patientId} onChange={patientId => setForm({ ...form, patientId })} /></>}</div>
      {type === 'psychology' && <div className="form-group"><SearchableStaffSelect inputId="consultation-psychologist" label="心理咨询师 *" people={options.psychologists} value={form.psychologistId} onChange={psychologistId => setForm(f => ({ ...f, psychologistId }))} getLabel={p => p.name} placeholder="输入咨询师姓名搜索" emptyMessage="未找到匹配的心理咨询师" required disabled={busy || loading} /></div>}
      {type === 'mdt' && <div className="form-group"><label className="form-label" htmlFor="consultation-expert-count">专家人数</label><select id="consultation-expert-count" className="form-input" value={form.expertCount} onChange={change('expertCount')}><option value={2}>2 位专家</option><option value={3}>3 位专家</option></select></div>}</div>
      <div className="form-group"><label className="form-label" htmlFor="consultation-request">{type === 'psychology' ? '咨询目标与必要背景' : '本次咨询问题'} *</label><textarea id="consultation-request" autoFocus className="form-input" required maxLength={20000} rows={5} value={form.request} onChange={change('request')} placeholder="说明希望解决的问题，以及接收方需要了解的背景。" /></div>
      <div className="consultation-form-note">{type === 'psychology' ? '建立后可持续记录会谈，无需重复转介。正式记录仅负责顾问与咨询师可见。' : '提交后进入现有专家咨询安排流程，可在同一页面查看服务进展。'}</div>
      {type === 'psychology' && <details className="consultation-takeover"><summary>客户已有心理咨询档案？</summary><p>若您刚接任该客户的健康顾问，可接管原档案，继续原有服务。</p><label className="form-label" htmlFor="takeover-reason">接管原因</label><input id="takeover-reason" className="form-input" maxLength={1000} value={takeoverReason} onChange={e => setTakeoverReason(e.target.value)} /><button type="button" className="btn btn-secondary" disabled={!form.patientId || !takeoverReason.trim()} onClick={async () => { setBusy(true); setError(''); try { const r = await psychologyAPI.post('/takeover', { patientId:form.patientId, reason:takeoverReason }); onCreated('psychology', r.data) } catch(e) { setError(e.message) } finally { setBusy(false) } }}>接管已有档案</button></details>}
      {error && <div className="consultation-form-error" role="alert">{error}</div>}
      <footer><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button><button className="btn btn-primary" disabled={!form.patientId || !form.request.trim() || (type === 'psychology' && (!form.psychologistId || loading))}>{busy ? '提交中…' : '确认发起'}</button></footer>
    </fieldset></form>
  </section></div>
}
