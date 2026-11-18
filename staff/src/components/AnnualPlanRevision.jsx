import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI } from '../api'

const LABELS = { medical_treatment: '就医安排', specialist_collab: '多学科会诊', checkup_completion: '完善检查', abnormal_followup: '定期复查', vaccine: '疫苗接种', nutrition_assessment: '营养评估' }
const titleOf = row => row?.items || row?.name || row?.purpose || row?.department || (row?.institution !== undefined ? '年度体检' : '未命名事项')
const originalReason = row => String(row?.basisSummary || row?.reason || '').split('\n处理建议：')[0]
const originalAdvice = row => row?.personalizedAdvice || row?.personalization || String(row?.reason || '').split('\n处理建议：')[1] || ''
const draftOf = (row, assignedManagerId = '', defaultGoal = '') => row ? { title: titleOf(row), goal: row.goal || defaultGoal, reason: originalReason(row), advice: originalAdvice(row), notes: row.notes || '', date: row.visit_time || row.plan_time || row.time || row.date || '', timingReason: row.timingReason || '', hospital: row.hospital || row.institution || '', campus: row.campus || '', department: row.department || '', expert: row.expert || '', followUpStaff: row.followUpStaff || assignedManagerId, bookingRequired: row.bookingRequired === true, serviceMode: row.serviceMode || 'reminder', serviceType: row.serviceType || '', managedServiceType: row.managedServiceType || '', institution: row.institution || '', focus: row.focus || '' } : { title: '', goal: defaultGoal, reason: '', advice: '', notes: '', date: '', timingReason: '', hospital: '', campus: '', department: '', expert: '', followUpStaff: assignedManagerId, bookingRequired: false, serviceMode: 'reminder', serviceType: '', managedServiceType: '', institution: '', focus: '' }

export default function AnnualPlanRevision({ patientId, plan, pilot = false, inlineItem, defaultGoal = '', staffList = [], assignedManagerId = '', onSaved, toast }) {
  const editorRef = useRef(null)
  const options = useMemo(() => [
    ...Object.entries(LABELS).flatMap(([key, label]) =>
      (plan?.moduleData?.[key]?.records || []).map((row, target) => ({ key, target, label, row }))),
    ...(pilot && plan?.moduleData?.annual_checkup?.enabled !== false && plan?.moduleData?.annual_checkup
      ? [{ key: 'annual_checkup', target: 0, label: '年度体检', row: plan.moduleData.annual_checkup }] : []),
  ], [plan, pilot])
  const inlineSelection = inlineItem ? `${inlineItem.key}:${inlineItem.target}` : ''
  const [selection, setSelection] = useState(inlineSelection)
  const [draft, setDraft] = useState(() => draftOf(options.find(option => `${option.key}:${option.target}` === inlineSelection)?.row, assignedManagerId, defaultGoal))
  const [saving, setSaving] = useState(false)
  const selected = options.find(option => `${option.key}:${option.target}` === selection)
  const medicalService = pilot && ['medical_treatment', 'specialist_collab', 'checkup_completion', 'abnormal_followup', 'annual_checkup'].includes(selected?.key)
  const choose = value => {
    setSelection(value)
    const next = options.find(option => `${option.key}:${option.target}` === value)
    setDraft(draftOf(next?.row, assignedManagerId, defaultGoal))
  }
  useEffect(() => {
    if (inlineItem) return
    const openItem = event => {
      const value = `${event.detail?.key}:${event.detail?.target}`
      if (!options.some(option => `${option.key}:${option.target}` === value)) return
      choose(value)
      const editor = editorRef.current
      if (editor) editor.open = true
    }
    window.addEventListener('annual-plan-edit-item', openItem)
    return () => window.removeEventListener('annual-plan-edit-item', openItem)
  }, [options, inlineItem])
  useEffect(() => {
    if (inlineItem) return
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        const editor = editorRef.current
        if (editor?.open) editor.open = false
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [inlineItem])
  const save = async () => {
    if (pilot && (!draft.goal.trim() || draft.goal.trim().length > 240)) { toast('请填写不超过240字的本项目标'); return }
    if (!selected || (selected.key !== 'annual_checkup' && (!draft.title.trim() || !draft.reason.trim() || (!medicalService && !draft.advice.trim())))) {
      toast('请填写事项名称和设置依据'); return
    }
    const originalDate = selected.row.visit_time || selected.row.plan_time || selected.row.time || selected.row.date || ''
    if (!medicalService && selected.key !== 'annual_checkup' && draft.date !== originalDate && draft.date && !draft.timingReason.trim()) { toast('修改日期时请填写时间依据'); return }
    if (medicalService && (!draft.followUpStaff || !['reminder', 'single', 'managed'].includes(draft.serviceMode)
      || draft.serviceMode === 'single' && !draft.serviceType || draft.serviceMode === 'managed' && !draft.managedServiceType)) {
      toast('请选择执行健管专员和具体服务方式'); return
    }
    setSaving(true)
    try {
      const res = await staffAPI.reviseAnnualPlan(patientId, {
        planId: plan._id, baseUpdatedAt: plan.updatedAt, reason: draft.notes.trim() || '健康顾问调整年度方案事项',
        item: selected.key === 'annual_checkup' ? { key: 'annual_checkup', goal: draft.goal.trim(), date: draft.date, institution: draft.institution.trim(), focus: draft.focus.trim(), notes: draft.notes.trim(), delivery: {
          hospital: draft.institution, campus: draft.campus, department: '', expert: draft.expert, followUpStaff: draft.followUpStaff,
          bookingRequired: draft.bookingRequired, serviceMode: draft.serviceMode, serviceType: draft.serviceType, managedServiceType: draft.managedServiceType,
        } } : { key: selected.key, target: selected.target, title: draft.title.trim(), goal: draft.goal.trim(), reason: draft.reason.trim(), advice: draft.advice.trim(), notes: draft.notes.trim(),
          ...(medicalService ? { date: draft.date } : draft.date !== originalDate ? draft.date ? { date: draft.date, timingReason: draft.timingReason.trim() } : { datePending: true, timingReason: draft.timingReason.trim() } : {}) ,
          ...(medicalService ? { delivery: { hospital: draft.hospital, campus: draft.campus, department: selected.key === 'medical_treatment' ? draft.title : draft.department, expert: draft.expert,
            followUpStaff: draft.followUpStaff, bookingRequired: draft.bookingRequired, serviceMode: draft.serviceMode, serviceType: draft.serviceType, managedServiceType: draft.managedServiceType } } : {}) },
      })
      onSaved(res.data)
      if (!inlineItem) setSelection('')
      const editor = editorRef.current
      if (editor) editor.open = false
      toast(res.message || '本项已暂存，客户尚未看到修改')
    } catch (error) { toast(error.message || '修订失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  const remove = async () => {
    if (!selected) return
    const deletionReason = window.prompt('请填写删除原因（至少2字）：', '')
    if (deletionReason === null) return
    if (deletionReason.trim().length < 2) { toast('删除原因至少填写2字'); return }
    if (!window.confirm('确认将本项删除暂存到修订草稿？发布前客户仍看到原方案。')) return
    setSaving(true)
    try {
      const response = await staffAPI.reviseAnnualPlan(patientId, { planId: plan._id, baseUpdatedAt: plan.updatedAt,
        reason: deletionReason.trim(), item: { key: selected.key, target: selected.target, operation: 'remove', deletionReason: deletionReason.trim() } })
      onSaved(response.data)
      toast('删除已暂存；发布后客户方案才会更新，原执行任务仍需核对')
    } catch (error) { toast(error.message || '删除失败，请刷新后重试') }
    finally { setSaving(false) }
  }
  useEffect(() => {
    if (inlineItem) return
    const saveFromPage = () => {
      const editor = editorRef.current
      if (editor) editor.open = true
      if (!selected) { toast('请先选择要修改的方案事项'); return }
      save()
    }
    window.addEventListener('annual-plan-save-revision', saveFromPage)
    return () => window.removeEventListener('annual-plan-save-revision', saveFromPage)
  })
  if (!options.length || (inlineItem && !options.some(option => option.key === inlineItem.key && option.target === inlineItem.target))) return null
  const fields = <>
    {!inlineItem && <p style={{ fontSize: 13, color: '#52675D' }}>修改后保存。已派发任务的实际排期另行核对。</p>}
    {!inlineItem && <label>方案事项<select className="form-input" value={selection} onChange={event => choose(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 5 }}><option value="">请选择</option>{options.map(option => <option key={`${option.key}:${option.target}`} value={`${option.key}:${option.target}`}>{option.label} · {titleOf(option.row)}</option>)}</select></label>}
    {selected && <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
      {pilot && <label>本项目标<textarea className="form-input" rows={2} maxLength={240} value={draft.goal} onChange={event => setDraft({ ...draft, goal: event.target.value })} placeholder="核对并调整系统带出的目标" /></label>}
      {selected.key === 'annual_checkup' ? <>
        <label>计划体检日期<input className="form-input" type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
        <label>体检机构<input className="form-input" value={draft.institution} onChange={event => setDraft({ ...draft, institution: event.target.value })} /></label>
        <label>重点关注<textarea className="form-input" rows={8} style={{ minHeight: 180 }} value={draft.focus} onChange={event => setDraft({ ...draft, focus: event.target.value })} /></label>
        <label>院区（选填）<input className="form-input" value={draft.campus} onChange={event => setDraft({ ...draft, campus: event.target.value })} /></label>
        <label>专家（选填）<input className="form-input" value={draft.expert} onChange={event => setDraft({ ...draft, expert: event.target.value })} /></label>
        <label>执行健管专员<select className="form-input" value={draft.followUpStaff} onChange={event => setDraft({ ...draft, followUpStaff: event.target.value })}><option value="">请选择</option>{staffList.filter(staff => staff.role === 'healthManager' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}</select></label>
        <label>服务方式<select className="form-input" value={draft.serviceMode} onChange={event => setDraft({ ...draft, serviceMode: event.target.value, serviceType: '', managedServiceType: '' })}><option value="reminder">仅提醒</option><option value="single">单项就医协助</option><option value="managed">全托管（一站式）</option></select></label>
        {draft.serviceMode === 'single' && <label>协助类型<select className="form-input" value={draft.serviceType} onChange={event => setDraft({ ...draft, serviceType: event.target.value })}><option value="">请选择</option><option value="proxy_booking">代约 / 代办</option><option value="escort_exam">陪检</option><option value="escort_visit">陪诊</option><option value="consult_coordination">会诊协调</option></select></label>}
        {draft.serviceMode === 'managed' && <label>一站式类型<select className="form-input" value={draft.managedServiceType} onChange={event => setDraft({ ...draft, managedServiceType: event.target.value })}><option value="">请选择</option><option value="checkup">体检一站式</option><option value="outpatient">门诊一站式</option></select></label>}
        <label className="annual-plan-revision-checkbox"><input type="checkbox" checked={draft.bookingRequired} onChange={event => setDraft({ ...draft, bookingRequired: event.target.checked })} />需要健管专员预约</label>
      </> : <>
      <label>{selected.key === 'medical_treatment' ? '就诊科室' : selected.key === 'specialist_collab' ? '会诊目的' : '事项名称'}<input className="form-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>设置依据<textarea className="form-input" rows={medicalService ? 5 : 3} value={draft.reason} onChange={event => setDraft({ ...draft, reason: event.target.value })} /></label>
      {!medicalService && <label>处理建议<textarea className="form-input" rows={3} value={draft.advice} onChange={event => setDraft({ ...draft, advice: event.target.value })} /></label>}
      {medicalService && <>
        <label>医院<input className="form-input" value={draft.hospital} onChange={event => setDraft({ ...draft, hospital: event.target.value })} /></label>
        <label>院区（选填）<input className="form-input" value={draft.campus} onChange={event => setDraft({ ...draft, campus: event.target.value })} /></label>
        {!['medical_treatment'].includes(selected.key) && <label>就诊科室<input className="form-input" value={draft.department} onChange={event => setDraft({ ...draft, department: event.target.value })} /></label>}
        <label>专家（选填）<input className="form-input" value={draft.expert} onChange={event => setDraft({ ...draft, expert: event.target.value })} /></label>
        <label>执行健管专员<select className="form-input" value={draft.followUpStaff} onChange={event => setDraft({ ...draft, followUpStaff: event.target.value })}><option value="">请选择</option>{staffList.filter(staff => staff.role === 'healthManager' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}</select></label>
        <label>服务方式<select className="form-input" value={draft.serviceMode} onChange={event => setDraft({ ...draft, serviceMode: event.target.value, serviceType: '', managedServiceType: '' })}><option value="reminder">仅提醒</option><option value="single">单项就医协助</option><option value="managed">全托管（一站式）</option></select></label>
        {draft.serviceMode === 'single' && <label>协助类型<select className="form-input" value={draft.serviceType} onChange={event => setDraft({ ...draft, serviceType: event.target.value })}><option value="">请选择</option><option value="proxy_booking">代约 / 代办</option><option value="proxy_visit">代诊</option><option value="escort_visit">陪诊</option><option value="escort_exam">陪检</option><option value="consult_coordination">会诊协调</option></select></label>}
        {draft.serviceMode === 'managed' && <label>一站式类型<select className="form-input" value={draft.managedServiceType} onChange={event => setDraft({ ...draft, managedServiceType: event.target.value })}><option value="">请选择</option><option value="outpatient">门诊一站式</option><option value="checkup">体检一站式</option></select></label>}
        <label className="annual-plan-revision-checkbox"><input type="checkbox" checked={draft.bookingRequired} onChange={event => setDraft({ ...draft, bookingRequired: event.target.checked })} />需要健管专员预约专家</label>
      </>}
      <label>建议日期<input className="form-input" type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      {!medicalService && draft.date !== (selected.row.visit_time || selected.row.plan_time || selected.row.time || selected.row.date || '') && <label>时间调整依据<input className="form-input" value={draft.timingReason} onChange={event => setDraft({ ...draft, timingReason: event.target.value })} /></label>}
      </>}
      <label>备注（内部）<textarea className="form-input" rows={2} maxLength={1000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="记录客户意见或执行时需要关注的事项（选填）" /></label>
      <div className="annual-plan-revision-controls"><button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? '暂存中…' : '暂存本项'}</button>
        {inlineItem && selected.key !== 'annual_checkup' && <button type="button" className="btn btn-secondary btn-sm" style={{ color: '#B73D3D' }} disabled={saving} onClick={remove}>删除本项</button>}</div>
    </div>}
  </>
  if (inlineItem) return <div className="annual-plan-revision annual-plan-revision--inline" onFocusCapture={event => {
    document.querySelectorAll('[data-annual-save-active]').forEach(node => node.removeAttribute('data-annual-save-active'))
    event.currentTarget.setAttribute('data-annual-save-active', 'true')
  }}>{fields}</div>
  return <details ref={editorRef} id="annual-plan-revision" className="annual-plan-revision" style={{ marginBottom: 16, padding: 14, border: '1px solid #C7D8CB', borderRadius: 10, background: '#fff' }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>修改方案事项</summary>
    {fields}
  </details>
}
