import React, { useState } from 'react'
import { staffAPI } from '../api'
import supplementTools from '../../../shared/annualSupplement.cjs'
import { annualTemplateCode } from '../utils/annualTemplateSelection.mjs'

const labels = { focus: '重点关注', items: '项目', name: '名称', reason: '原因', basisSummary: '依据', visit_time: '建议日期', time: '建议日期', date: '建议日期', department: '科室', order_dept: '开单科室', hospital: '医院', precautions: '注意事项', customerAction: '客户行动' }
const describe = row => row ? Object.entries(labels).filter(([key]) => row[key]).map(([key, label]) => `${label}：${row[key]}`).join('\n') : '无此事项'

export default function AnnualPlanSupplement({ patientId, year, planType, templateId, template, plan, moduleData, canEdit, blocked, onApply, toast }) {
  const [sources, setSources] = useState(null)
  const [reviewIds, setReviewIds] = useState([]), [reportIds, setReportIds] = useState([])
  const [note, setNote] = useState(''), [noteConfirmed, setNoteConfirmed] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [preview, setPreview] = useState(null), [selected, setSelected] = useState([])
  const published = !!(plan?.pushedAt || plan?.confirmedAt || plan?.frozenAt)
  const load = async () => {
    setBusy(true); setError('')
    try { setSources((await staffAPI.getAnnualSupplementSources(patientId, plan?._id)).data) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const toggle = (id, setter) => { setter(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); setPreview(null) }
  const generate = async () => {
    if (!templateId || blocked) { setError('请先完成准备清单并选择模板'); return }
    setBusy(true); setError(''); setPreview(null)
    const input = { reviewIds, reportIds, note, noteConfirmed, baseModuleData: moduleData }
    try {
      const response = await staffAPI.generateAIAnnualPlan(patientId, annualTemplateCode(planType, template), '', templateId, year, input)
      const changes = supplementTools.supplementChanges(moduleData, response.data || {})
      setPreview({ base: JSON.stringify(moduleData), sources: input, changes, coverage: response.generation?.evidenceCoverage || [] })
      setSelected([])
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const apply = async () => {
    if (!preview || preview.base !== JSON.stringify(moduleData)) { setError('原方案已变化，请重新生成调整建议'); return }
    const changes = preview.changes.filter((_, index) => selected.includes(index))
    setBusy(true); setError('')
    try {
      if (published) {
        await staffAPI.saveAnnualSupplementRevision(patientId, { planId: plan._id, baseUpdatedAt: plan.updatedAt, sources: preview.sources, changes })
        toast('修订草稿已留档，尚未发布；原方案和执行任务保持不变')
      } else {
        onApply(supplementTools.applySupplement(moduleData, changes))
        toast('已应用选中建议到本地草稿，请核对并保存；未自动推送或派单')
      }
      setPreview(null)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section style={{ background: '#fff', border: '1px solid #B2D8C7', padding: 18, borderRadius: 12, marginBottom: 20 }}>
    <h3 style={{ marginTop: 0 }}>补充依据／更新方案</h3>
    <p>选择已确认研判（不限类型）、已审核报告，或顾问确认的补充意见。仅生成调整建议，逐项审核后应用；未涉及的内容保留。</p>
    {published && <p style={{ color: '#9A5B13' }}>当前是已推送方案：本入口只保存独立修订草稿，不能直接发布或改动已派任务。</p>}
    <button onClick={load} disabled={busy || !canEdit}>加载／刷新可用依据</button>
    {sources && <>
      <h4>已确认研判</h4>
      {sources.reviews.map(row => <details key={row._id}><summary><label><input type="checkbox" disabled={busy} checked={reviewIds.includes(row._id)} onChange={() => toggle(row._id, setReviewIds)} />{row.title}（{row.reviewType}）</label></summary><div style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{row.conclusion?.content}</div></details>)}
      {!sources.reviews.length && <p>暂无已确认研判；未确认讨论和已归档记录不引用。</p>}
      <details><summary>选择已审核报告</summary>{sources.reports.map(row => <label key={row._id} style={{ display: 'block' }}><input type="checkbox" disabled={busy} checked={reportIds.includes(row._id)} onChange={() => toggle(row._id, setReportIds)} />{row.checkDate} {row.title}</label>)}</details>
      <textarea aria-label="顾问补充意见" placeholder="补充意见（可选，不能将未确认讨论当作结论）" maxLength={4000} value={note} onChange={e => { setNote(e.target.value); setNoteConfirmed(false); setPreview(null) }} style={{ width: '100%', minHeight: 90, marginTop: 12 }} />
      <label><input type="checkbox" checked={noteConfirmed} onChange={e => { setNoteConfirmed(e.target.checked); setPreview(null) }} />我已核对并确认上述补充意见</label>
      <div><button disabled={busy || !canEdit || blocked || (!reviewIds.length && !reportIds.length && !note.trim()) || (!!note.trim() && !noteConfirmed)} onClick={generate}>{busy ? '处理中…' : '生成调整建议（不覆盖原方案）'}</button></div>
      {sources.revisions?.length > 0 && <details><summary>已留档修订草稿（尚未发布）</summary>{sources.revisions.map((r, i) => <details key={r.id || i}><summary>{new Date(r.createdAt).toLocaleString()} · {r.status}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.changes, null, 2)}</pre></details>)}</details>}
    </>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
    {preview && <div>
      {!preview.changes.length && <p>没有新增或修改建议，原方案保留。</p>}
      {preview.changes.map((change, i) => <details key={i} open><summary><label><input type="checkbox" checked={selected.includes(i)} onChange={() => setSelected(old => old.includes(i) ? old.filter(x => x !== i) : [...old, i])} />{change.before ? '修改' : '新增'}：{change.label}</label></summary><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>调整前：{describe(change.before)}</pre><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>调整后：{describe(change.after)}</pre></div></details>)}
      <details><summary>依据处理说明</summary>{preview.coverage.map(row => <p key={row.sourceId}>{row.sourceId}：{row.reason}</p>)}</details>
      <button disabled={busy || !selected.length || !canEdit} onClick={apply}>{published ? '保存选中项为修订草稿（不发布）' : '确认选中项并应用到草稿'}</button>
    </div>}
  </section>
}
