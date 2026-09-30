import React, { useState } from 'react'
import { staffAPI } from '../api'
import './CoreHealthArchive.css'

export const CORE_LABELS = { family: '家族史', disease: '疾病史与当前状态', allergy: '过敏史与不良反应史', medication: '首次建档用药与营养补充剂', symptom: '建档主诉与症状', routine: '基础信息与其他常规项目' }
const definitions = {
  medication: [['name','药物／营养补充剂名称'],['kind','类型（药物／营养补充剂）'],['dosage','建档时剂量'],['frequency','建档时频次'],['purpose','使用原因'],['startedAt','开始使用时间'],['baselineAt','建档时间'],['source','信息来源'],['note','备注']],
  family: [['disease','疾病或健康问题'],['personName','姓名（选填）'],['relationship','与客户的关系'],['onsetAge','发病年龄'],['diagnosedAt','确诊时间'],['status','当前情况'],['source','信息来源'],['note','备注']],
  disease: [['disease','疾病名称'],['institution','诊断机构'],['diagnosedAt','确诊时间'],['status','当前状态'],['statusAt','状态变化／逆转时间'],['evidence','状态判断依据'],['treatment','治疗经过'],['effect','治疗效果'],['source','信息来源'],['note','备注']],
  allergy: [['substance','过敏原或相关产品'],['kind','过敏／不良反应类型'],['reaction','具体反应'],['occurredAt','发生时间'],['severity','严重程度'],['treatment','处理情况'],['source','信息来源'],['note','备注']],
  symptom: [['symptom','不适主诉与症状'],['startedAt','开始时间'],['frequency','频率'],['severity','程度及生活影响'],['status','当前状态'],['statusAt','状态变化时间'],['institution','诊断机构'],['diagnosis','诊断名称（与自述症状区分）'],['diagnosedAt','诊断时间'],['medicationNote','用药情况说明（完整用药在统一模块维护）'],['treatment','其他治疗措施'],['effect','治疗效果'],['source','信息来源'],['note','备注']],
}
const presenceLabels = { uncollected: '待补充', present: '有相关情况', none: '未报告已知相关情况', unknown: '不详' }
const reviewLabels = { pending: '待复核', needs_info: '待补充', reviewed: '已复核' }
const format = value => value == null ? '' : Array.isArray(value) ? value.map(format).join('、') : typeof value === 'object' ? Object.entries(value).map(([k,v]) => `${k}：${format(v)}`).join('；') : String(value)
const valueAt = (user,path) => path.split('.').reduce((v,k) => v?.[k],user)
const when = value => value ? new Date(value).toLocaleString('zh-CN') : ''
const legacyFields = {
  family: ['familyHistoryNote', 'familyHistory'], disease: ['pastHistory', 'medicalHistory'],
  allergy: ['drugAllergy', 'foodAllergy', 'allergies'], symptom: ['recentSymptoms'],
  medication: ['medicHistory', 'recentMedication', 'supplementHistory', 'recentSupplement'],
}
export function ArchiveSource({ user, section }) {
  const items = user.initialArchiveReview?.items?.filter(item => item.section === section) || []
  const legacyLabels = {familyHistoryNote:'家族史',familyHistory:'既有家族记录',pastHistory:'既往疾病',medicalHistory:'既有疾病记录',drugAllergy:'药物过敏',foodAllergy:'食物过敏',allergies:'过敏与不良反应',recentSymptoms:'建档前近期症状',medicHistory:'建档时长期用药',recentMedication:'建档前近1月用药',supplementHistory:'建档时长期营养补充剂',recentSupplement:'建档前近1月营养补充剂'}
  const legacy = (legacyFields[section] || []).map(k => ({label:legacyLabels[k],value:format(user.healthProfile?.[k])})).filter(item => item.value)
  if (!items.length && !legacy.length) return <p className="core-muted">问卷未填写或尚未采集，不代表没有相关情况。</p>
  return <details className="core-source"><summary>问卷原始回答与历史摘要（供核对）</summary>
    {items.length ? items.map((item,i) => <div key={i}><b>{item.label}：</b>{format(item.answer)}{item.imported === false && <span className="core-muted"> · 待核对补充</span>}</div>) : <div>{section === 'medication' && <p className="core-muted">以下为历史档案摘要，请核实是否对应首次建档时的情况。</p>}{legacy.map((item,i)=><div key={i}><b>{item.label}：</b>{item.value}</div>)}</div>}
  </details>
}

export function CoreArchiveSection({ user, section, onSaved, onNavigate, canEdit }) {
  const current = user.coreHealthArchive?.[section] || { revision: 0, records: [], presence: 'uncollected' }
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const fields = definitions[section]
  const records = current.records || []
  const visible = records
  async function save() {
    setBusy(true); setError('')
    try { await staffAPI.saveCoreArchive(user._id, section, form); setForm(null); await onSaved() }
    catch (err) { setError(err.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  return <section className="card core-archive" id={`core-${section}`}>
    <div className="card-header"><div><button type="button" className="core-section-toggle card-title" aria-expanded={expanded} aria-controls={`core-body-${section}`} onClick={() => setExpanded(v => !v)}>{CORE_LABELS[section]} <span>{expanded ? "收起 ⌃" : "展开 ⌄"}</span></button><span className="core-muted">{presenceLabels[current.presence]}{user.initialArchiveReview && ` · ${reviewLabels[user.initialArchiveReview.sections?.[section]?.status || 'pending']}`}</span></div>
      {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => { setError(''); setForm(JSON.parse(JSON.stringify(current))) }}>补充／修改</button>}
    </div>
    {section === 'symptom' && <p className="core-section-description">来源：健康档案与建档问卷，记录建档前近3个月或更长时间的主诉与症状。</p>}
    {section === 'medication' && <p className="core-section-description">记录首次建档时的使用情况；后续服用中及已停用的记录在“用药与营养补充剂”维护。</p>}
    <div className="card-body" id={`core-body-${section}`} hidden={!expanded}>
      <ArchiveSource user={user} section={section}/>

      <div className="core-records">{visible.map(row => <details className="core-record" key={row.id} open={section !== 'symptom'}>
        <summary className="core-record-title"><strong>{section === 'family' ? `${row.personName || "姓名未填写"} · ${row.relationship} · ${row.disease}` : section === 'symptom' ? `${row.startedAt || "时间待补充"} · ${row.symptom}` : row[fields[0][0]]}</strong><span>{row.status || row.severity || ''}</span></summary>
        <div className="core-grid">{fields.slice(1).filter(([key]) => row[key] && key !== 'note').map(([key,label]) => <div key={key}><span className="core-muted">{label}：</span>{row[key]}</div>)}</div>
        {section === 'family' && row.person && <p className="core-muted">原人员称谓：{row.person}</p>}
        {row.note && <p>{row.note}</p>}
        {!!row.timeline?.length && <details><summary>状态变化记录（{row.timeline.length}）</summary>{[...row.timeline].reverse().map((t,i) => <div key={i}>{t.statusAt || '发生时间未填写'} · {t.status} {t.evidence && `· ${t.evidence}`}<small className="core-muted">　录入：{t.recordedByName} {when(t.recordedAt)}</small></div>)}</details>}
      </details>)}</div>
      {!visible.length && <p className="core-muted">{current.presence === 'present' ? '此视图暂无记录。' : presenceLabels[current.presence]}</p>}
      {current.updatedAt && <p className="core-muted">最近更新：{current.updatedByName} · {when(current.updatedAt)}</p>}
      {!!user.coreHealthArchiveHistory?.filter(h => h.section === section).length && <details><summary>查看修改历史</summary>{user.coreHealthArchiveHistory.filter(h => h.section === section).slice().reverse().map((h,i) => <div className="core-source" key={i}><b>{when(h.at)} · {h.byName}</b><div>修改前：{presenceLabels[h.before.presence]} {(h.before.records || []).map(r => fields.map(([k,l]) => r[k] ? `${l}：${r[k]}` : '').filter(Boolean).join(' · ')).join('；')}</div><div>修改后：{presenceLabels[h.after.presence]} {(h.after.records || []).map(r => fields.map(([k,l]) => r[k] ? `${l}：${r[k]}` : '').filter(Boolean).join(' · ')).join('；')}</div></div>)}</details>}
    </div>
    {form && <div className="modal-overlay"><div className="modal core-modal"><div className="modal-header"><h3>{CORE_LABELS[section]} · 补充与修改</h3><button className="modal-close" disabled={busy} onClick={() => setForm(null)}>×</button></div><div className="modal-body">
      <label>信息状态<select className="form-control" value={form.presence} onChange={e => setForm({...form, presence:e.target.value})}>{Object.entries(presenceLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <p className="core-muted">日期可填写具体日期、大致年份或“不详”。客户自述与医疗机构结论请注明来源。修改会保留历史。</p>
      {form.records.map((row,index) => <div className="core-record" key={row.id || index}><div className="core-grid">{fields.map(([key,label]) => <label key={key}>{label}{key === 'status' && ['disease','symptom'].includes(section) ? <select className="form-control" value={row[key] || ''} onChange={e => setForm({...form, records:form.records.map((r,i) => i===index ? {...r,[key]:e.target.value} : r)})}><option value="">请选择</option>{(section === 'disease' ? ['持续','缓解','已逆转','复发','已结束','不详'] : ['持续','间歇出现','缓解','已结束','不详']).map(v => <option key={v}>{v}</option>)}</select> : <input className="form-control" value={row[key] || ''} maxLength={4000} onChange={e => setForm({...form, records:form.records.map((r,i) => i===index ? {...r,[key]:e.target.value} : r)})}/>}</label>)}</div><button className="btn btn-secondary btn-sm" onClick={() => setForm({...form,records:form.records.filter((_,i) => i!==index)})}>移除此条（保存后保留历史）</button></div>)}
      <button className="btn btn-secondary" onClick={() => setForm({...form,presence:'present',records:[...form.records,{source:'人工核实'}]})}>＋ 新增记录</button>
      {error && <div role="alert" className="core-error">{error}</div>}
    </div><div className="modal-footer"><button className="btn btn-secondary" disabled={busy} onClick={() => setForm(null)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存档案'}</button></div></div></div>}
  </section>
}

export function InitialArchiveReview({ user, onSaved, onNavigate, canEdit }) {
  const review = user.initialArchiveReview
  const [selected, setSelected] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState([])
  if (!review) return null
  const count = Object.keys(CORE_LABELS).filter(k => review.sections?.[k]?.status === 'reviewed').length
  async function confirm(status) {
    setError(''); setBusy(true)
    try { await staffAPI.reviewInitialArchive(user._id, selected, {revision:review.revision,status,note,checkedQuestionIds:checked,sectionRevision:user.coreHealthArchive?.[selected]?.revision || 0}); setSelected(null); await onSaved() }
    catch (err) { setError(err.message || '复核失败') } finally { setBusy(false) }
  }
  return <section className="card core-archive" id="initial-archive-review"><div className="card-header"><div><div className="card-title">初次建档复核 · {count}/6</div><div className="core-muted">{review.questionnaireTitle} · 提交于 {when(review.submittedAt)} · {review.status === 'completed' ? '已完成' : '问卷已写入，待人工逐项核实'}</div></div></div><div className="card-body core-review-grid">
    {Object.entries(CORE_LABELS).map(([key,label]) => { const state=review.sections?.[key] || {}; return <div className="core-record" key={key}><strong>{label}</strong><p>{reviewLabels[state.status || 'pending']}</p>{state.note && <p>{state.note}</p>}{state.reviewedAt && <small className="core-muted">{state.reviewedByName} · {when(state.reviewedAt)}</small>}<div className="core-actions"><button className="btn btn-secondary btn-sm" onClick={() => onNavigate(key === 'symptom' ? 'symptoms' : 'records',key)}>查看／完善</button>{canEdit && review.status !== 'completed' && <button className="btn btn-primary btn-sm" onClick={() => {setSelected(key);setNote(state.note || '');setChecked(state.checkedQuestionIds || []);setError('')}}>复核</button>}</div></div> })}
    {selected && <div className="modal-overlay"><div className="modal core-modal"><div className="modal-header"><h3>复核 · {CORE_LABELS[selected]}</h3><button className="modal-close" disabled={busy} onClick={() => setSelected(null)}>×</button></div><div className="modal-body"><ArchiveSource user={user} section={selected}/><div>{(review.items || []).filter(item => item.section === selected).map((item,i) => <label className="core-source" style={{display:'block'}} key={i}><input type="checkbox" checked={checked.includes(item.questionId)} onChange={e => setChecked(e.target.checked ? [...checked,item.questionId] : checked.filter(k => k !== item.questionId))}/> 已核实：{item.label}<div className="core-muted">原回答：{format(item.answer)}<br/>当前档案：{format(valueAt(user,item.path)) || '尚未填写'}</div></label>)}</div><p>先在所属板块核对并修改档案，再确认本板块复核结果。用药核实不替代原有专业审核。</p><label>核实依据／待补充内容<textarea className="form-control" value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={4000}/></label>{error && <div role="alert" className="core-error">{error}</div>}</div><div className="modal-footer"><button className="btn btn-secondary" disabled={busy} onClick={()=>confirm('needs_info')}>标记待补充</button><button className="btn btn-primary" disabled={busy} onClick={()=>confirm('reviewed')}>{busy ? '保存中…' : '确认已核实'}</button></div></div></div>}
  </div></section>
}
