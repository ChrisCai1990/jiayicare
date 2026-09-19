import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import CheckupPreparationReadiness from './CheckupPreparationReadiness'

export const isAnnualCheckupPreparation = task => task?.sourceType === 'annual_service'
  && task.formData?.annualCheckupPreparation?.version === 1
  && ['annual_checkup_preparation:familyDoctor', 'annual_checkup_preparation:healthPlanner'].includes(task.workflowKey)

export default function AnnualCheckupPreparationCard({ task, staff, onSaved }) {
  const nav = useNavigate()
  const role = task.formData?.annualCheckupPreparation?.role
  const canOpen = isAnnualCheckupPreparation(task) && (staff?.role === 'superadmin'
    || (staff?.role === role && String(task.assignedTo?._id || task.assignedTo) === String(staff._id)))
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [form, setForm] = useState({ healthPlanId: '', institution: '', note: '', customerConfirmed: false, resourceConfirmed: false })
  useEffect(() => {
    if (!canOpen) return
    let active = true
    setBusy(true); setError(''); setData(null)
    staffAPI.getCheckupPreparation(task._id).then(res => {
      if (!active) return
      setData(res.data)
      if (res.data.task.status !== task.status) onSaved(res.data.task)
      const evidence = res.data.task.formData?.annualCheckupPreparation?.evidence || {}
      setForm({ healthPlanId: evidence.healthPlanId || '', institution: evidence.institution || '', note: evidence.note || '',
        customerConfirmed: evidence.customerConfirmed === true, resourceConfirmed: evidence.resourceConfirmed === true })
    }).catch(err => { if (active) setError(err.message || '读取失败，请重新打开') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [task._id, task.updatedAt, canOpen])
  useEffect(() => {
    if (!canOpen || role !== 'familyDoctor') return
    let active = true
    staffAPI.getPlanTemplates('annual_checkup', task.patientId?._id || task.patientId)
      .then(res => { if (active) setTemplates(res.data || []) })
      .catch(err => { if (active) setError(err.message || '读取体检模板失败') })
    return () => { active = false }
  }, [task._id, canOpen, role])
  if (!canOpen) return null
  const current = data?.task
  const meta = current?.formData?.annualCheckupPreparation
  const editable = current && ['planned', 'in_progress', 'missed'].includes(current.status) && !current.isBlocked
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const openPlan = () => nav(`/plans/${form.healthPlanId}`, { state: { returnTo: `/patients/${task.patientId?._id || task.patientId}?tab=followups` } })
  return <section style={{ border: '1px solid #B2D8C7', borderRadius: 8, padding: 12, background: '#F6FBF8', fontSize: 13 }}>
    <b>年度体检准备 · {role === 'familyDoctor' ? '健康顾问' : '健康规划师'}</b>
    {error && <p role="alert" style={{ color: '#DC3545' }}>{error}</p>}
    {busy && !current && <p>正在读取…</p>}
    {current && <>
      <p>计划体检日期：{meta.targetDate}{meta.latePreparation ? '（准备时间不足14天）' : ''}</p>
      <CheckupPreparationReadiness task={current} />
      {current.status === 'completed' && <p>已保存实际准备结果，无需再次确认完成。准备完成不等于预约或体检已完成。</p>}
      {current.status === 'cancelled' && <p>此准备任务已取消，仅保留记录。</p>}
      {role === 'familyDoctor' ? <div style={{ display: 'grid', gap: 8 }}>
        <label>本次体检方案
          <select className="form-input" disabled={busy || !editable} value={form.healthPlanId} onChange={e => change('healthPlanId', e.target.value)}>
            <option value="">选择已有方案（可先关联草稿）</option>
            {(data.plans || []).map(plan => <option key={plan._id} value={plan._id}>{plan.title} · {plan.pushedAt ? '已发布' : '草稿'}</option>)}
            {form.healthPlanId && !(data.plans || []).some(plan => plan._id === form.healthPlanId) && <option value={form.healthPlanId}>{meta.evidence?.title || '已关联方案（请核对当前状态）'}</option>}
          </select>
        </label>
        <div>关联草稿后，在原方案完成审核发布，此准备任务自动完成；不额外要求点击“完成”。这里不会启动体检服务或下单。</div>
        {editable && !meta.evidence?.healthPlanId && <>
          <label>新建独立准备草稿（不启动服务）
            <select className="form-input" disabled={busy} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">选择标准体检模板</option>
              {templates.map(template => <option key={template._id} value={template._id}>{template.name}</option>)}
            </select>
          </label>
          <div>建立标准套餐草稿后，系统自动整理可选加项建议；在原方案页核对依据并审核。不创建服务或订单。</div>
          <button className="btn btn-secondary btn-sm" disabled={busy || !templateId} onClick={async () => {
            setBusy(true); setError('')
            try {
              const res = await staffAPI.createCheckupPreparationDraft(task._id, { templateId, updatedAt: current.updatedAt })
              nav(`/plans/${res.data._id}`, { state: { returnTo: `/patients/${task.patientId?._id || task.patientId}?tab=followups` } })
            } catch (err) { setError(err.message || '新建失败，请重新打开后重试') } finally { setBusy(false) }
          }}>建立并打开准备草稿</button>
        </>}
        {form.healthPlanId && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={openPlan}>打开所选体检方案</button>}
      </div> : <div style={{ display: 'grid', gap: 8 }}>
        <label>拟安排体检机构<input className="form-input" value={form.institution} maxLength={200} disabled={busy || !editable} onChange={e => change('institution', e.target.value)} /></label>
        <label>与客户及机构沟通的实际结果<textarea className="form-input" value={form.note} maxLength={2000} disabled={busy || !editable} onChange={e => change('note', e.target.value)} /></label>
        <label><input type="checkbox" checked={form.customerConfirmed} disabled={busy || !editable} onChange={e => change('customerConfirmed', e.target.checked)} /> 已与客户确认该日期可行</label>
        <label><input type="checkbox" checked={form.resourceConfirmed} disabled={busy || !editable} onChange={e => change('resourceConfirmed', e.target.checked)} /> 已与体检机构核对资源可行</label>
        <div>这是资源准备记录，不是正式预约。日期变化需先核对年度排期，不在此处直接改期。</div>
      </div>}
      {editable && <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy || (role === 'familyDoctor'
        ? !form.healthPlanId : !form.institution.trim() || !form.note.trim() || !form.customerConfirmed || !form.resourceConfirmed)} onClick={async () => {
        setBusy(true); setError('')
        try {
          const res = await staffAPI.saveCheckupPreparation(task._id, { ...form, date: meta.targetDate, updatedAt: current.updatedAt })
          setData(previous => ({ ...previous, task: res.data })); onSaved(res.data)
        } catch (err) { setError(err.message || '保存失败，请重新打开后重试') } finally { setBusy(false) }
      }}>{role === 'familyDoctor' ? '关联本次方案' : '保存沟通与资源安排'}</button>}
    </>}
  </section>
}
