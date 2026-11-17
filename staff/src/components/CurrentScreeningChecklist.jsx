import React, { useEffect, useMemo, useState } from 'react'
import { staffAPI } from '../api'
import SpecialtyConcernButton from './SpecialtyConcernButton'
import AICheckupReview from './AICheckupReview'

const directionLabel = { medical_treatment: '安排就医', checkup_completion: '完善检查', abnormal_followup: '定期复查', vaccine: '疫苗接种', monitoring: '日常监测', ongoing_management: '持续管理或观察' }
const actionable = new Set(['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine'])

export default function CurrentScreeningChecklist({ patientId, year, reports = [], staff, toast, onOpenReport }) {
  const [state, setState] = useState({ loading: true, error: '', decisions: [], checkup: null, plan: null })
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [appendError, setAppendError] = useState('')
  const [findingsOpen, setFindingsOpen] = useState(false)
  const [findingPage, setFindingPage] = useState(1)
  const refresh = async () => {
    setState(old => ({ ...old, loading: true, error: '' }))
    try {
      const [decisionRes, checkupRes, planRes] = await Promise.all([
        staffAPI.getAnnualManagementDecisions(patientId, year), staffAPI.getAICheckupReviews(patientId, year), staffAPI.getAnnualPlan(patientId, year),
      ])
      const plans = Array.isArray(planRes.data) ? planRes.data : [planRes.data].filter(Boolean)
      setState({ loading: false, error: '', decisions: decisionRes.data || [], checkup: checkupRes.data,
        plan: plans.find(plan => plan.pushedAt && plan.confirmedAt && plan.reviewStatus === 'approved') || null })
    } catch (error) { setState(old => ({ ...old, loading: false, error: error.message || '读取筛查核对结果失败' })) }
  }
  useEffect(() => { refresh() }, [patientId, year])
  const reviewed = state.checkup?.reviews || []
  const currentReports = useMemo(() => reports.filter(report => report.audit_status === 'audited' && !report.archiveOnly), [reports])
  const covered = useMemo(() => {
    const latest = new Map()
    for (const report of currentReports) for (const item of report.reportItems || []) {
      const key = String(item.screeningKey || item.screeningKeys?.[0] || '').trim()
      if (!key) continue
      const previous = latest.get(key)
      if (!previous || String(report.checkDate || report.date || '') > String(previous.report.checkDate || previous.report.date || '')) latest.set(key, { report, item })
    }
    return [...latest.values()].sort((a, b) => String(b.report.checkDate || b.report.date || '').localeCompare(String(a.report.checkDate || a.report.date || '')))
  }, [currentReports])
  const findings = useMemo(() => currentReports.flatMap(report => (report.reportItems || [])
    .filter(item => ['abnormal', 'attention'].includes(item.status) || item.itemType === 'imaging' && /结节|斑块|囊肿|占位|增生|息肉|狭窄|钙化|脂肪肝|异常/.test(String(item.conclusion || '')))
    .map(item => ({ report, item }))), [currentReports])
  const findingPages = Math.max(1, Math.ceil(findings.length / 20))
  const currentFindingPage = Math.min(findingPage, findingPages)
  const pageFindings = findings.slice((currentFindingPage - 1) * 20, currentFindingPage * 20)
  const planSourceIds = new Set(Object.values(state.plan?.moduleData || {}).flatMap(module => (module?.records || []).flatMap(row => row.sourceIds || [])))
  const pendingSources = [
    ...state.decisions.filter(row => !planSourceIds.has(`management_issue:${row._id}`)).map(row => ({ kind: 'decision', id: row._id, title: row.title,
      direction: row.reviewPlan?.kind === 'recheck' ? 'abnormal_followup' : row.direction, note: row.note,
      reviewPlan: row.reviewPlan })),
    ...reviewed.filter(row => row.disposition === 'needs_exam' && !planSourceIds.has(`management_issue:${row._id}`)).map(row => ({ kind: 'ai_checkup', id: row._id, title: row.title, direction: 'checkup_completion', note: row.itemText })),
  ]
  const possibleExisting = source => (state.plan?.moduleData?.[source.direction]?.records || [])
    .some(row => String(row.items || row.department || row.name || '').replace(/\s/g, '') === String(source.title || '').replace(/\s/g, ''))
  const openAmendment = source => { setAppendError(''); setEditing(source); setForm({ title: source.title, reason: source.note || '', advice: '',
    date: '', timingReason: '', changeReason: '补入当前筛查核对事项' }) }
  const append = async () => {
    if (!state.plan || !editing) return
    setSaving(true); setAppendError('')
    try {
      await staffAPI.appendCurrentScreeningAction(patientId, state.plan._id, { sourceKind: editing.kind, sourceId: editing.id,
        baseUpdatedAt: state.plan.updatedAt, ...form })
      setEditing(null); toast?.('已补入年度方案；请继续核对目标及执行安排')
      await refresh()
    } catch (error) { setAppendError(error.message || '补入方案失败，请重试') }
    finally { setSaving(false) }
  }
  return <section style={{ margin: '0 16px 14px', padding: 14, border: '1px solid #D9E9E1', borderRadius: 10, background: '#F8FCFA' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><div><strong style={{ color: '#1E6B50' }}>资料与管理去向</strong><div style={{ fontSize: 12, color: '#52675D', marginTop: 4 }}>逐项核实报告、异常线索和 AI 建议，决定是否补入当前年度方案；此处不形成年度综合判断。</div></div><button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={state.loading}>刷新核对</button></div>
    {state.error && <div role="alert" style={{ color: '#B42318', marginTop: 8 }}>{state.error}</div>}
    {state.loading ? <p>正在核对来源…</p> : <>
      <p style={{ fontSize: 13 }}>已审核报告 {currentReports.length} 份 · 有检查记录的专项 {covered.length} 项 · 异常或需关注的结构化线索 {findings.length} 项 · AI 待完善检查 {state.checkup?.items?.length || 0} 项 · 待补入当前方案 {pendingSources.length} 项</p>
      <div style={{ fontSize: 12, color: '#7A5B24' }}>“有检查记录”不等于该项目仍在有效期内；影像和检验异常仅为核对线索，须结合原报告、后续检查和顾问解读判断。无结构化结果的报告请在原始资料中核对。</div>
      <details style={{ marginTop: 10 }}><summary>已有检查记录的专项（{covered.length}，时效待核对）</summary>
        {covered.map(({ report, item }, index) => <div key={`${item.screeningKey || item.screeningKeys?.[0]}:${index}`} style={{ padding: 8, background: '#fff', marginTop: 6, borderRadius: 7, fontSize: 13 }}>
          {item.screeningParent || item.name || '专项检查'} · 最近记录 {report.checkDate || report.date || '日期待核对'} · {report.title || '报告'}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => onOpenReport?.(report)}>查看原件</button>
        </div>)}
      </details>
      <details style={{ marginTop: 10 }} onToggle={event => setFindingsOpen(event.currentTarget.open)}><summary>已审核报告中的需关注线索（{findings.length}）</summary>
        {!findings.length && <p>暂无可识别的异常线索，请结合原始报告核对。</p>}
        {findingsOpen && pageFindings.map(({ report, item }, index) => <div key={`${report._id}:${item.itemId || item.name}:${index}`} style={{ padding: 9, marginTop: 7, background: '#fff', borderRadius: 7 }}>
          <div><b>{item.name || '检查项目'}</b> · {report.checkDate || report.date || '日期待核对'} · {report.title || '报告'}</div>
          <div style={{ fontSize: 12, color: '#52675D' }}>{String(item.conclusion || item.value || item.findings || '').slice(0, 240)}</div>
          <div style={{ display: 'flex', gap: 7, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(report)}>查看原件</button>
            <SpecialtyConcernButton patientId={patientId} year={year} staff={staff} toast={toast} onSaved={refresh} source={{ kind: item.screeningKey || item.screeningKeys?.length ? 'screening' : 'report_item', reportId: report._id, itemId: item.itemId || item.name }} suggestedIssue={item.name} sourceLabel={`${report.title || '已审核报告'} · ${item.name || '检查项目'}`} />
          </div>
        </div>)}
        {findingsOpen && findingPages > 1 && <div className="report-table-pager" style={{ marginTop: 8 }}><button type="button" disabled={currentFindingPage <= 1} onClick={() => setFindingPage(currentFindingPage - 1)}>上一页</button><span>第 {currentFindingPage} / {findingPages} 页</span><button type="button" disabled={currentFindingPage >= findingPages} onClick={() => setFindingPage(currentFindingPage + 1)}>下一页</button></div>}
      </details>
      <details style={{ marginTop: 10 }} open><summary>AI 健康信息整理提出的待完善检查（{state.checkup?.items?.length || 0}）</summary>
        <AICheckupReview patientId={patientId} year={year} versionKey={state.checkup?.version || ''} staff={staff} toast={toast} onSaved={refresh} />
      </details>
      <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 8 }}><b>已核对、待补入方案的事项</b>
        {!state.plan && <p style={{ fontSize: 12 }}>未找到已确认的本年度方案；请先核对年度方案。</p>}
        {!pendingSources.length && <p style={{ fontSize: 12 }}>目前没有已确认但尚未进入方案的事项。仍须核对上方未处理线索。</p>}
        {pendingSources.map(source => <div key={`${source.kind}:${source.id}`} style={{ borderTop: '1px solid #E4ECE7', marginTop: 8, paddingTop: 8, fontSize: 13 }}>
          <b>{source.title}</b> · {directionLabel[source.direction] || '待确认去向'}
          {state.plan && possibleExisting(source) && <span style={{ color: '#925F20' }}> · 原方案有同名事项，请先核对，避免重复</span>}
          {state.plan && !possibleExisting(source) && actionable.has(source.direction) && <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => openAmendment(source)}>补入已发布方案</button>}
          {state.plan && !actionable.has(source.direction) && <span style={{ color: '#925F20' }}> · 请在方案修订与专业服务入口核对安排</span>}
        </div>)}
        {state.plan && <div style={{ fontSize: 12, marginTop: 10 }}>补入后还需由顾问确认管理目标与执行安排。<a href={`/patients/${patientId}/annual-health?year=${year}`}>查看现有年度方案</a></div>}
      </div>
    </>}
    {editing && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 560 }}><div className="modal-header"><h3>补入已确认年度方案</h3><button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button></div><div className="modal-body" style={{ display: 'grid', gap: 8 }}>
      <div>{editing.title} · {directionLabel[editing.direction]}</div>
      <label>事项名称<input className="form-input" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label>资料依据<textarea className="form-input" rows={2} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
      <label>处理建议<textarea className="form-input" rows={3} value={form.advice} onChange={event => setForm({ ...form, advice: event.target.value })} /></label>
      {editing.reviewPlan?.kind === 'recheck' ? <div>按已确认复查计划：{editing.reviewPlan.intervalMonths} 个月后，{editing.reviewPlan.department || '专科待补'}；项目：{editing.reviewPlan.items?.join('、') || '待补'}。同次复查项目会归为一条就诊安排。</div>
        : <label>执行日期（待确认可留空）<input className="form-input" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>}
      {form.date && <label>日期依据<input className="form-input" value={form.timingReason} onChange={event => setForm({ ...form, timingReason: event.target.value })} /></label>}
      <label>修订原因<input className="form-input" value={form.changeReason} onChange={event => setForm({ ...form, changeReason: event.target.value })} /></label>
      <p style={{ fontSize: 12 }}>保存会通知客户并进入顾问执行安排复核；不会自动创建或完成任务。</p>
      {appendError && <p role="alert" style={{ margin: 0, color: '#B42318' }}>{appendError}</p>}
    </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>取消</button><button type="button" className="btn btn-primary" disabled={saving || !form.reason?.trim() || !form.advice?.trim()} onClick={append}>{saving ? '保存中…' : '确认补入'}</button></div></div></div>}
  </section>
}
