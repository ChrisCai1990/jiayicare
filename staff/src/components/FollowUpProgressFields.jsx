import React, { useEffect } from 'react'
import { canRecordProgress, requiresOutcomeReview } from '../utils/followUpContinuity'
import reminder from '../../../shared/reminderFollowUp.cjs'

export function followUpSaveLabel(item, form) {
  if (canRecordProgress(item) && reminder.eligible(item) && form.outcome === 'obtained') return '确认配药完成，结束提醒'
  if (canRecordProgress(item) && reminder.eligible(item) && form.outcome === 'visited') return '保存并转资料审核'
  if (requiresOutcomeReview(item)) return '保存并继续跟进'
  return form.status === 'completed' ? '完成本次随访' : '保存并继续跟进'
}

export function FollowUpProgressHistory({ item }) {
  if (!item?.progressRecords?.length) return null
  return <details open style={{ background: '#F0F8F4', padding: 12, borderRadius: 8 }}>
    <summary>随访过程（{item.progressRecords.length}次）</summary>
    {item.progressRecords.map(row => <div key={row.requestId} style={{ borderTop: '1px solid #DCE5E0', marginTop: 8, paddingTop: 8 }}>
      <small>{row.recordedAt ? new Date(row.recordedAt).toLocaleString('zh-CN') : ''} {row.staffName || ''}</small>
      {row.outcome&&<div><b>{reminder.outcomesFor(item)[row.outcome]||row.outcome}</b>{row.visitDate&&` · ${reminder.kindOf(item)==='review'?'复查':'就医'}日期：${row.visitDate}`}</div>}
      <div style={{ whiteSpace: 'pre-wrap' }}>{row.content}</div>
      {row.nextContactAt && <small>下次跟进：{new Date(row.nextContactAt).toLocaleString('zh-CN')}</small>}
    </div>)}
  </details>
}

export default function FollowUpProgressFields({ item, form, setForm }) {
  const eligible = canRecordProgress(item)
  useEffect(() => {
    if (eligible) setForm(f => ({ ...f, status: 'in_progress', requestId: crypto.randomUUID(), nextContactAt: '',outcome:reminder.eligible(item)?'reminded':'',visitDate:'',visitConfirmed:false }))
  }, [item._id, eligible, setForm])
  if (!eligible) return null
  return <>
    <FollowUpProgressHistory item={item} />
    <p style={{ fontSize: 12, color: '#1E6B50' }}>{reminder.kindOf(item)==='medication'&&item.formData?.adHocMedicalReminder?'仅记录配药进展；取得药品不等于已服用，不能代替用药核对。':requiresOutcomeReview(item) ? '联系客户不等于完成就医或检查；完成后仍需资料与随访审核。' : '按本次事项是否达成选择：需要再联系则继续跟进，普通沟通目标已达成可完成本次随访。'}</p>
    {!requiresOutcomeReview(item)&&!(reminder.kindOf(item)==='medication'&&item.formData?.adHocMedicalReminder)&&<label>本次处理结果<select className="form-control" value={form.status||'in_progress'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="in_progress">尚未完成，继续跟进</option><option value="completed">本次随访目标已达成，结束本次随访</option></select></label>}
    {reminder.eligible(item)&&<div style={{display:'grid',gap:10}}><label>本次跟进状态<select className="form-control" value={form.outcome||'reminded'} onChange={e=>setForm(f=>({...f,outcome:e.target.value,visitConfirmed:false}))}>{Object.entries(reminder.outcomesFor(item)).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {form.outcome==='visited'&&<><label>实际{reminder.kindOf(item)==='review'?'复查':'就医'}日期<input className="form-control" type="date" value={form.visitDate||''} onChange={e=>setForm(f=>({...f,visitDate:e.target.value}))}/></label><label><input type="checkbox" checked={!!form.visitConfirmed} onChange={e=>setForm(f=>({...f,visitConfirmed:e.target.checked}))}/> 已核对本事项确实完成（不是仅提醒或预约）</label><small>保存后进入资料上传、健管审核、AI随访草稿及顾问审核；本次事项尚不结束，不生成派单。</small></>}
      {form.outcome==='obtained'&&<label><input type="checkbox" checked={!!form.visitConfirmed} onChange={e=>setForm(f=>({...f,visitConfirmed:e.target.checked}))}/> 已核实客户取得药品（不代表已经服用）</label>}
    </div>}
    {form.status!=='completed'&&!['visited','obtained'].includes(form.outcome)&&<label style={{ fontSize: 12 }}>下次跟进时间（选填，留空保留原安排）
      <input className="form-control" type="datetime-local" value={form.nextContactAt || ''} onChange={e => setForm(f => ({ ...f, nextContactAt: e.target.value }))} />
    </label>}
    <p role="status" style={{fontSize:12,color:'#1E6B50'}}>{form.outcome==='obtained'?'保存后：本次配药提醒结束，过程记录保留。':form.outcome==='visited'&&reminder.eligible(item)?'保存后：转入资料收集与审核，本事项尚未结束。':form.status==='completed'&&!requiresOutcomeReview(item)?'保存后：本次随访结束，已有过程记录保留。':'保存后：保留同一任务继续跟进，不重复生成提醒任务。'}</p>
  </>
}
