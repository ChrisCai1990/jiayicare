import React, { useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
const fields = [['chiefComplaint','主要健康问题'],['presentIllness','阶段病程与变化'],['physicalExam','检查结果'],['epidemiologicalHistory','相关背景'],['initialDiagnosis','医疗机构诊断记录'],['currentMedication','治疗及用药记录']]
export default function DiseaseStagePanel({ patientId, dossier, onSaved }) {
  const { staff } = useStaff()
  const canReview = ['familyDoctor','superadmin'].includes(staff?.role)
  const [cutoff,setCutoff] = useState(new Date().toLocaleDateString('sv-SE'))
  const [draft,setDraft] = useState(dossier.stageDraft || null)
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [page,setPage] = useState(1)
  const stages = dossier.stageSummaries || []
  const generate = async () => {
    setBusy(true); setError('')
    try { const r = await staffAPI.generateDiseaseStage(patientId,dossier._id,cutoff); setDraft(r.data) }
    catch(e) { setError(e.message || '生成失败，已保存概要未改变') }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    setBusy(true); setError('')
    try { await staffAPI.confirmDiseaseStage(patientId,dossier._id,{ draftId:String(draft._id),summary:draft.summary }); setDraft(null); setPage(1); await onSaved() }
    catch(e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <div>
    <p style={{fontSize:13,color:'#65776F'}}>综合首次概况和截止日期内已归档的诊疗记录，生成阶段性概要；顾问核对后单独留存，首次概况保持不变。未审核病历请先在诊疗时间轴入档。</p>
    {canReview && <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><label>概要截止日期 <input aria-label="概要截止日期" type="date" value={cutoff} disabled={busy} onChange={e=>setCutoff(e.target.value)} /></label><button className="btn btn-primary btn-sm" disabled={busy || !dossier._id || dossier._id === 'legacy'} onClick={generate}>{busy?'处理中…':'AI生成阶段概要草稿'}</button></div>}
    {(!dossier._id || dossier._id === 'legacy') && <p>请先保存首次专病概况。</p>}
    {error && <p role="alert" style={{color:'#B42318'}}>{error}</p>}
    {draft && <div style={{padding:14,marginTop:12,border:'1px solid #E1D6AA',borderRadius:8}}><b>待顾问审核 · 截至 {draft.cutoff}</b><p>已纳入 {draft.coverage.courseCount} 条诊疗记录、{draft.coverage.reportCount} 份报告；{draft.excludedCount || 0} 条因超出日期、日期缺失或待核验未纳入。</p>
      <details><summary>核对来源报告</summary>{draft.sourceReports.map(r=><div key={r.id}>{r.title || '医疗资料'}</div>)}<p>诊疗记录请在时间轴核对。</p></details>
      {fields.map(([key,label])=><label key={key} style={{display:'block',marginTop:10}}>{label}<textarea className="form-control" rows={3} disabled={busy || !canReview} value={draft.summary[key] || ''} onChange={e=>setDraft(d=>({...d,summary:{...d.summary,[key]:e.target.value}}))}/></label>)}
      {canReview && <button className="btn btn-primary" disabled={busy} onClick={confirm}>审核确认并保存阶段概要</button>}
    </div>}
    <h4>已确认的阶段概要（{stages.length}）</h4>
    {!stages.length && <p>暂无已确认概要。</p>}
    {stages.slice((page-1)*5,page*5).map(stage=><details key={stage._id} style={{padding:'12px 0',borderBottom:'1px solid #eee'}}><summary>截至 {stage.cutoff} · {stage.confirmedByName} · {new Date(stage.confirmedAt).toLocaleString('zh-CN')}</summary><p>依据 {stage.coverage.courseCount} 条诊疗记录、{stage.coverage.reportCount} 份报告；保存后新增的病历不在本份概要范围内。</p>{fields.map(([key,label])=>stage.summary[key] && <div key={key} style={{whiteSpace:'pre-wrap',marginBottom:12}}><b>{label}：</b>{stage.summary[key]}</div>)}<details><summary>当时使用的首次概况及来源</summary><div style={{whiteSpace:'pre-wrap'}}>{fields.map(([key,label])=>stage.baselineSnapshot?.[key] ? `${label}：${stage.baselineSnapshot[key]}` : '').filter(Boolean).join('\n')}</div>{stage.sourceReports.map(r=><div key={r.id}>{r.title || '医疗资料'}</div>)}</details></details>)}
    {stages.length>5 && <div><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>上一页</button> {page} / {Math.ceil(stages.length/5)} 页 <button disabled={page*5>=stages.length} onClick={()=>setPage(p=>p+1)}>下一页</button></div>}
  </div>
}
