import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

export default function ClinicalStandardReviewPanel() {
  const { staff } = useStaff()
  const [items, setItems] = useState([])
  const [note, setNote] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = () => staffAPI.clinicalStandardUpdates().then(r => setItems(r.data || [])).catch(e => { if (e.status !== 403) setError(e.message) })
  useEffect(() => { if (staff?.role === 'familyDoctor') load() }, [staff?.role])
  if (staff?.role !== 'familyDoctor' || (!items.length && !error)) return null
  const review = async (id, action) => { setBusy(id); setError(''); try { await staffAPI.reviewClinicalStandardUpdate(id, { action, note: note[id] || '' }); await load() } catch (e) { setError(e.message) } finally { setBusy('') } }
  return <section className="card" style={{padding:18, marginBottom:20}}><h2 style={{fontSize:18, marginTop:0}}>临床标准更新审核 <small>· {items.length} 项</small></h2><p style={{fontSize:12, color:'#667085'}}>核对原始来源及对现行规则的影响；审核结果只进入实施队列，不会自动改动客户分级。</p>{error && <p role="alert" style={{color:'#b91c1c'}}>{error}</p>}{items.map(item => <div key={item._id} style={{borderTop:'1px solid #e5e7eb', padding:'14px 0'}}><b>{item.standard?.title || item.standardId}</b><div style={{fontSize:12, color:'#667085'}}>发现于 {new Date(item.detectedAt).toLocaleString('zh-CN')} · 当前规则版本 {item.standard?.version || '待核对'} · {item.trigger === 'source_changed' ? '来源变化' : item.trigger === 'baseline_review' ? '首次核对' : '定期复核'}</div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</a>}<textarea className="form-input" rows={3} maxLength={2000} placeholder="记录新版名称、变化点及是否需要调整现行规则（至少10字）" value={note[item._id] || ''} onChange={e => setNote({...note,[item._id]:e.target.value})} style={{display:'block', width:'100%', margin:'10px 0'}}/><div style={{display:'flex', gap:8}}><button className="btn btn-primary btn-sm" disabled={busy === item._id || (note[item._id] || '').trim().length < 10} onClick={() => review(item._id, 'clinically_reviewed')}>确认需评估实施</button><button className="btn btn-secondary btn-sm" disabled={busy === item._id || (note[item._id] || '').trim().length < 10} onClick={() => review(item._id, 'dismissed')}>无需更新</button></div></div>)}</section>
}
