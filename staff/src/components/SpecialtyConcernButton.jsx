import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import { specialtyIssueSuggestions } from '../utils/specialtyIssueSuggestion.mjs'
import { annualManagementSourceKey, findAnnualManagementDecision } from '../utils/annualManagementDecision.mjs'
import DateField from '../../../shared/DateField.jsx'
import annualAppointment from '../../../shared/annualAppointment.cjs'
import { MONITORING_METRICS, MONITORING_PERIODS } from '../utils/monitoringMetrics'
import { splitMonitoringPeriods, toggleMonitoringPeriod } from '../utils/monitoringPeriodSelection.mjs'
import MonitoringFrequencyField from './MonitoringFrequencyField'

const supportsInterval = direction => ['medical_treatment', 'checkup_completion'].includes(direction)
const DIRECTIONS = [
  ['checkup_completion', '完善检查'], ['medical_treatment', '安排就医'],
  ['abnormal_followup', '定期复查'], ['nutrition_assessment', '营养评估'],
  ['ongoing_management', '持续管理或观察（旧方向）'],
  ['vaccine', '疫苗接种'], ['monitoring', '日常监测'],
]
const pending = new Map()
function load(patientId, year) {
  const key = `${patientId}:${year}`
  if (!pending.has(key)) pending.set(key, staffAPI.getAnnualManagementDecisions(patientId, year).finally(() => pending.delete(key)))
  return pending.get(key)
}
export default function SpecialtyConcernButton({ patientId, year, source, sourceLabel, sourceText = '', suggestedIssue = '', staff, toast, onSaved, correctionId, correctionMessage, correctionField }) {
  const trigger = useRef(null)
  const correctionPanel = useRef(null)
  const openedCorrection = useRef(null)
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [drafting, setDrafting] = useState(false)
  const [title, setTitle] = useState(''), [directions, setDirections] = useState([]), [note, setNote] = useState('')
  const [goal, setGoal] = useState('')
  const [directionTimings, setDirectionTimings] = useState({})
  const [monitoringItems, setMonitoringItems] = useState([])
  const [reviewKind, setReviewKind] = useState('none'), [reviewMonths, setReviewMonths] = useState('3'), [reviewItems, setReviewItems] = useState('')
  const [reviewAnchorDate, setReviewAnchorDate] = useState('')
  const [saved, setSaved] = useState(null), [legacy, setLegacy] = useState(null), [adoptLegacy, setAdoptLegacy] = useState(false), [error, setError] = useState('')
  const [priorDecisions, setPriorDecisions] = useState([])
  const [replacesId, setReplacesId] = useState('')
  const [withdrawReason, setWithdrawReason] = useState(null)
  const suggestions = specialtyIssueSuggestions(sourceText)
  const key = annualManagementSourceKey(source)
  const symptomSource = source?.kind === 'symptom' && !!source?.recordId
  const reportSource = !!source?.reportId && ['screening', 'screening_report', 'report_item'].includes(source.kind)
  const direction = directions[0] || ''
  const hasDirection = value => directions.includes(value)
  const directionText = values => (values || []).map(value => DIRECTIONS.find(([key]) => key === value)?.[1] || value).join('、')
  const timingFor = value => directionTimings[value]
    ? { dateBasis: directionTimings[value].dateBasis || 'date', ...directionTimings[value] }
    : { mode: 'pending', dateBasis: supportsInterval(value) ? 'interval' : 'date' }
  const updateTiming = (value, patch) => setDirectionTimings(previous => ({ ...previous, [value]: {
    mode: 'pending', dateBasis: previous[value] ? previous[value].dateBasis || 'date' : supportsInterval(value) ? 'interval' : 'date',
    ...(previous[value] || {}), ...patch,
  } }))
  const savedDirections = saved?.directions?.length ? saved.directions : [saved?.direction].filter(Boolean)
  const toggleDirection = value => {
    const next = directions.includes(value) ? directions.filter(item => item !== value) : DIRECTIONS.map(([key]) => key).filter(key => key === value || directions.includes(key))
    setDirections(next)
    if (value === 'abnormal_followup' && next.includes(value)) setReviewKind('recheck')
    if (!next.includes('abnormal_followup') && !next.includes('ongoing_management')) setReviewKind('none')
  }
  useEffect(() => {
    if (!patientId || !year || (!reportSource && !symptomSource)) return
    let active = true
    const refresh = () => load(patientId, year).then(result => {
      if (!active) return
      setPriorDecisions((result.data || []).filter(item => item.reportId && String(item.reportId) !== String(source.reportId)))
      setSaved(findAnnualManagementDecision(result.data || [], source))
      setLegacy(source.kind === 'screening'
        ? (result.data || []).find(item => item.sourceKey === `screening_report:${source.reportId}`) || null
        : null)
    }).catch(() => {})
    refresh()
    const eventName = `annual-decisions:${patientId}:${year}`
    window.addEventListener(eventName, refresh)
    return () => { active = false; window.removeEventListener(eventName, refresh) }
  }, [patientId, year, key])
  useEffect(() => {
    if (!correctionId || saved?._id !== correctionId || openedCorrection.current === correctionId || !trigger.current) return
    openedCorrection.current = correctionId
    trigger.current.click()
  }, [correctionId, saved])
  useEffect(() => {
    if (open && correctionId) correctionPanel.current?.focus()
  }, [open, correctionId])
  if (!['familyDoctor', 'superadmin'].includes(staff?.role) || (!reportSource && !symptomSource)) return null
  const submit = async () => {
    if (title.trim().length < 2 || !directions.length || !goal.trim() && !(directions.length === 1 && hasDirection('monitoring'))) { setError('请填写具体问题、管理方向和整体目标'); return }
    if (hasDirection('monitoring') && (!monitoringItems.length || monitoringItems.some(item => MONITORING_PERIODS[item.type] && !item.time.trim() || !item.frequency?.trim()))) { setError('请勾选监测项目，为每项选择监测周期，并填写血压、血糖或体重的监测时间'); return }
    setBusy(true); setError('')
    try {
      const replaces = priorDecisions.find(item => item._id === replacesId)
      const result = await staffAPI.saveAnnualManagementDecision(patientId, { year, source, title: title.trim(), direction, directions, note: note.trim(),
        ...(replaces ? { replacesDecisionId: replaces._id, replacesUpdatedAt: replaces.updatedAt } : {}),
        goal: goal.trim() || '按选定项目与时间完成日常监测', action: '', directionTimings: Object.fromEntries(directions
          .filter(value => !(reviewKind === 'recheck' && ['abnormal_followup', 'ongoing_management'].includes(value)))
          .map(value => { if (value === 'monitoring') return [value, { mode: 'pending', items: monitoringItems.map(item => ({ type: item.type, time: item.time.trim(), frequency: item.frequency.trim() })) }]; const timing = timingFor(value); return [value, { mode: timing.mode || 'pending',
            firstDueDate: supportsInterval(value) && timing.mode !== 'pending' && timing.dateBasis === 'interval' ? '' : timing.firstDueDate || '',
            frequency: timing.mode === 'rolling' ? timing.frequency || '' : '',
            ...(supportsInterval(value) && timing.mode !== 'pending' && timing.dateBasis === 'interval'
              ? { dateBasis: 'interval', anchorDate: timing.anchorDate || '', intervalMonths: Number(timing.intervalMonths) } : {}),
          }] })),
        reviewPlan: { kind: reviewKind, intervalMonths: Number(reviewMonths), anchorDate: reviewAnchorDate, items: reviewItems },
        ...(adoptLegacy && legacy?._id ? { legacyDecisionId: legacy._id } : {}) })
      setSaved(result.data); if (adoptLegacy) setLegacy(null)
      toast('已确认管理方向；已发布方案请继续核对是否需要局部补入', 5000)
      window.dispatchEvent(new Event(`annual-decisions:${patientId}:${year}`))
      setOpen(false)
      onSaved?.()
    } catch (e) { setError(e.message || '保存失败，请重试') }
    finally { setBusy(false) }
  }
  const withdraw = async () => {
    setBusy(true); setError('')
    try {
      await staffAPI.withdrawAnnualManagementDecision(patientId, saved._id, withdrawReason.trim(), key, saved.updatedAt)
      setSaved(null); setOpen(false)
      window.dispatchEvent(new Event(`annual-decisions:${patientId}:${year}`))
      toast('已撤销该项管理决定')
      onSaved?.()
    } catch (e) { setError(e.message || '撤销失败，请刷新后核对') }
    finally { setBusy(false) }
  }
  const draft = async () => {
    if (title.trim().length < 2 || !directions.length) { setError('请先填写具体问题并选择管理方向'); return }
    setDrafting(true); setError('')
    try {
      const result = await staffAPI.draftAnnualManagementDecision(patientId, { year, source, title: title.trim(), direction, directions })
      setGoal(current => current.trim() || result.data.goal)
    } catch (e) { setError(e.message || 'AI草稿暂不可用，请手动填写') }
    finally { setDrafting(false) }
  }
  return <>
    <button ref={trigger} disabled={!!correctionId && (saved?._id !== correctionId)} type="button" className={`btn ${saved ? 'btn-primary' : 'btn-secondary'} btn-sm`} title={saved ? `已纳入年度管理：${directionText(savedDirections) || '管理方向待核对'}；点击可查看或调整` : '点击确认是否纳入年度管理'} onClick={event => {
      event.stopPropagation(); setReplacesId(''); setTitle(saved?.title || suggestedIssue || suggestions[0] || '');
      setDirections(savedDirections); setNote(saved?.note || ''); setGoal(saved?.goal || '')
      const legacyTimingDirection = saved?.reviewPlan?.kind === 'recheck' && savedDirections.includes('medical_treatment')
        ? 'medical_treatment' : savedDirections[0]
      setDirectionTimings(saved?.directionTimings && Object.keys(saved.directionTimings).length ? saved.directionTimings
        : saved?.actionTiming && legacyTimingDirection && !(saved?.reviewPlan?.kind === 'recheck' && ['abnormal_followup', 'ongoing_management'].includes(legacyTimingDirection))
          ? { [legacyTimingDirection]: saved.actionTiming } : {})
      setMonitoringItems(Array.isArray(saved?.directionTimings?.monitoring?.items) ? saved.directionTimings.monitoring.items : [])
      setWithdrawReason(null); setAdoptLegacy(false); setError(''); setOpen(true)
      setReviewKind(savedDirections.includes('abnormal_followup') || saved?.reviewPlan?.kind === 'recheck' ? 'recheck' : 'none')
      setReviewMonths(String(saved?.reviewPlan?.intervalMonths || 3))
      setReviewItems((saved?.reviewPlan?.items || []).join('、'))
      setReviewAnchorDate(saved?.reviewPlan?.anchorDate || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))
    }}>{saved ? `✓ 已纳入管理 · ${directionText(savedDirections) || '待核对'}` : '＋ 纳入管理'}</button>
    {open && <div className="modal-overlay" onClick={event => event.stopPropagation()}><div className="modal" style={{ maxWidth: 520 }}>
      <div className="modal-header"><div className="modal-title">纳入年度管理</div><button className="modal-close" onClick={() => setOpen(false)}>×</button></div>
      {withdrawReason !== null ? <div className="modal-body">
        <strong>撤销{source.kind === 'screening_report' ? '报告级' : '本项'}管理决定</strong>
        <p>{sourceLabel} · {saved?.title} · {directionText(savedDirections)}</p>
        <label className="form-label">撤销原因（4 至 500 字）<textarea autoFocus className="form-input" value={withdrawReason} maxLength={500} onChange={e => setWithdrawReason(e.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
      </div> : <div className="modal-body">
        <div style={{ fontSize: 13, color: '#65776F', marginBottom: 10 }}>来源：{sourceLabel || '已审核专项筛查'}。请选择对应现有方案的管理方向。</div>
        {reportSource && priorDecisions.length > 0 && <label className="form-label">本次决定是否更新同一问题的旧安排
          <select className="form-input" value={replacesId} onChange={event => setReplacesId(event.target.value)}>
            <option value="">独立管理事项</option>{priorDecisions.map(row => <option key={row._id} value={row._id}>替代 {row.sourceSnapshot?.checkDate} · {row.title} · {directionText(row.directions?.length ? row.directions : [row.direction])}</option>)}
          </select></label>}
        <label className="form-label">具体问题</label><input autoFocus={!correctionId} className="form-input" maxLength={80} value={title} disabled={drafting} onChange={e => setTitle(e.target.value)} placeholder="例如：肺结节" />
        <label className="form-label" style={{ marginTop: 12 }}>管理方向</label>
        {correctionMessage && <div role="alert" style={{ color: '#9F1239', marginBottom: 8 }}>{correctionMessage}</div>}
        <div ref={correctionField === 'direction' ? correctionPanel : undefined} tabIndex={-1} role="group" aria-label="管理方向（可多选）" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>{DIRECTIONS.filter(([value]) => (value !== 'ongoing_management' || savedDirections.includes(value)) && (!symptomSource || ['medical_treatment', 'ongoing_management', 'nutrition_assessment'].includes(value))).map(([value, label]) => <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 8px', border: `1px solid ${hasDirection(value) ? '#17694D' : '#DDE6E0'}`, borderRadius: 7, cursor: 'pointer', background: hasDirection(value) ? '#F1F8F3' : '#FFF' }}><input type="checkbox" checked={hasDirection(value)} disabled={drafting} onChange={() => toggleDirection(value)} />{label}</label>)}</div>
        {!(directions.length === 1 && hasDirection('monitoring')) && <><label className="form-label" style={{ marginTop: 12 }}>管理目标</label>
        <textarea className="form-input" rows={2} maxLength={240} value={goal} onChange={e => setGoal(e.target.value)} placeholder="写出本年度要达到或明确的可核对结果；缺少基线时先以建立基线为目标" />
        <button type="button" className="btn btn-secondary btn-sm" disabled={drafting || busy || !direction || !title.trim()} onClick={draft} style={{ marginTop: 8 }}>
          {drafting ? 'AI 起草中…' : 'AI 起草空白目标'}
        </button>
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>只填入空白字段；顾问核对原始资料后修改确认。</div></>}
        <label className="form-label" style={{ marginTop: 12 }}>顾问补充说明（可选）</label>
        <textarea className="form-input" rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="如已确认的复查时限、就医意向或待核实事项" />
        {!symptomSource && (hasDirection('ongoing_management') || hasDirection('abnormal_followup')) && <><label className="form-label" style={{ marginTop: 12 }}>定期复查 · 时间安排</label>
        {!hasDirection('abnormal_followup') && <select className="form-input" value={reviewKind} onChange={e => setReviewKind(e.target.value)}>
          <option value="none">不单独安排复查</option><option value="recheck">安排一次复查</option>
        </select>}
        {reviewKind === 'recheck' && <div style={{ marginTop: 10, padding: 10, background: '#F4F8F5', borderRadius: 6 }}>
          <label className="form-label">约几个月后复查</label>
          <input className="form-input" type="number" min="1" max="24" value={reviewMonths} onChange={e => setReviewMonths(e.target.value)} />
          <label className="form-label" style={{ marginTop: 8 }}>从哪一天起算</label>
          <DateField type="date" className="form-input" value={reviewAnchorDate} onChange={e => setReviewAnchorDate(e.target.value)} />
          <div>建议复查日期：{Number(reviewMonths) >= 1 && Number(reviewMonths) <= 24 && annualAppointment.addMonths(reviewAnchorDate, Number(reviewMonths)) || '填写间隔与起算日期后自动计算'}</div>
          <label className="form-label" style={{ marginTop: 8 }}>需复查项目（用顿号或换行分隔）</label>
          <textarea className="form-input" rows={2} value={reviewItems} onChange={e => setReviewItems(e.target.value)} placeholder="逐项填写具体检查名称，由顾问确认" />
        </div>}</>}
        {hasDirection('monitoring') && <div ref={correctionField === 'monitoring' ? correctionPanel : undefined} tabIndex={-1} role="group" aria-label="日常监测项目与周期" style={{ marginTop: 12, padding: 10, background: '#F4F8F5', borderRadius: 6 }}>
          <strong>日常监测 · 每项选择周期；血压、血糖、体重选择监测时间</strong>
          {MONITORING_METRICS.map(([type, label]) => { const selected = monitoringItems.find(item => item.type === type); const periods = splitMonitoringPeriods(selected?.time); const choices = MONITORING_PERIODS[type] || []; return <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <label style={{ minWidth: 76 }}><input type="checkbox" checked={!!selected} onChange={e => setMonitoringItems(previous => e.target.checked ? [...previous, { type, time: type === 'weight' ? '晨起' : '', frequency: '' }] : previous.filter(item => item.type !== type))} /> {label}</label>
            {selected && choices.length > 0 && <div role="group" aria-label={`${label}监测时间（可多选）`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>{[...choices, ...periods.filter(period => !choices.includes(period))].map(period => <label key={period} style={{ whiteSpace: 'nowrap', fontSize: 13 }}><input type="checkbox" checked={periods.includes(period)} onChange={() => setMonitoringItems(previous => previous.map(item => item.type === type ? { ...item, time: toggleMonitoringPeriod(item.time, period) } : item))} /> {period}</label>)}</div>}
            {selected && <MonitoringFrequencyField label={label} value={selected.frequency || ''} onChange={frequency => setMonitoringItems(previous => previous.map(item => item.type === type ? { ...item, frequency } : item))} />}
          </div> })}
        </div>}
        {directions.filter(value => value !== 'monitoring' && !(reviewKind === 'recheck' && ['abnormal_followup', 'ongoing_management'].includes(value))).map(value => {
          const timing = timingFor(value)
          const intervalAction = supportsInterval(value)
          const actionLabel = value === 'medical_treatment' ? '就医' : '检查'
          return <div key={value} style={{ marginTop: 10, padding: 10, background: '#F4F8F5', borderRadius: 6 }}>
            <label className="form-label">{DIRECTIONS.find(([key]) => key === value)?.[1]} · 时间安排</label>
            <select className="form-input" value={timing.mode || 'pending'} onChange={e => updateTiming(value, { mode: e.target.value, firstDueDate: '', frequency: '' })}>
              <option value="pending">时间待确认</option><option value="single">单次安排</option><option value="rolling">持续跟进，完成本轮后安排下一轮</option>
            </select>
            {timing.mode !== 'pending' && intervalAction && <><label className="form-label" style={{ marginTop: 8 }}>建议{actionLabel}日期的确定方式</label>
              <select className="form-input" value={timing.dateBasis || 'interval'} onChange={e => updateTiming(value, { dateBasis: e.target.value, firstDueDate: '' })}>
                <option value="interval">按起算日期和间隔计算</option><option value="date">直接选择日期</option>
              </select></>}
            {timing.mode !== 'pending' && intervalAction && (timing.dateBasis || 'interval') === 'interval' && <>
              <label className="form-label" style={{ marginTop: 8 }}>几个月后{actionLabel}</label>
              <input className="form-input" type="number" min="1" max="24" value={timing.intervalMonths || ''} onChange={e => updateTiming(value, { intervalMonths: e.target.value })} />
              <label className="form-label" style={{ marginTop: 8 }}>从哪一天起算</label>
              <DateField type="date" className="form-input" value={timing.anchorDate || ''} onChange={e => updateTiming(value, { anchorDate: e.target.value })} />
              <div style={{ fontSize: 12, color: '#365E4C', marginTop: 7 }}>建议{actionLabel}日期：{timing.intervalMonths && annualAppointment.addMonths(timing.anchorDate, Number(timing.intervalMonths)) || '填写间隔与起算日期后自动计算'}；方案确认后按建议日期提前 7 天安排预约随访。</div>
            </>}
            {timing.mode !== 'pending' && (!intervalAction || (timing.dateBasis || 'interval') === 'date') && <><label className="form-label" style={{ marginTop: 8 }}>{intervalAction ? `建议${actionLabel}日期` : '首次执行日期'}</label>
              <DateField type="date" className="form-input" value={timing.firstDueDate || ''} onChange={e => updateTiming(value, { firstDueDate: e.target.value })} /></>}
            {timing.mode === 'rolling' && <><label className="form-label" style={{ marginTop: 8 }}>下一轮如何确定</label>
              <input className="form-input" maxLength={100} value={timing.frequency || ''} onChange={e => updateTiming(value, { frequency: e.target.value })} placeholder="例如：根据本轮结果由负责人确定" /></>}
          </div>
        })}
        {!saved && legacy && <label style={{ display: 'block', marginTop: 12, padding: 10, background: '#FFF9ED', borderRadius: 6, fontSize: 13 }}>
          <input type="checkbox" checked={adoptLegacy} onChange={e => {
            setAdoptLegacy(e.target.checked)
            if (e.target.checked) { setTitle(legacy.title || ''); setDirections(legacy.directions?.length ? legacy.directions : [legacy.direction].filter(Boolean)); setNote(legacy.note || '') }
          }} /> 此报告有旧版整份报告纳入的“{legacy.title}”。确认它属于当前检查项目后，可勾选并重新归属；否则不要勾选。
        </label>}
        {error && <div role="alert" style={{ marginTop: 8, color: '#B42318' }}>{error}</div>}
        <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>团队专项研判可另行开展，不影响本项进入年度方案。</div>
      </div>}
      <div className="modal-footer">{withdrawReason !== null ? <><button className="btn btn-secondary" disabled={busy} onClick={() => { setWithdrawReason(null); setError('') }}>返回</button><button className="btn btn-primary" disabled={busy || withdrawReason.trim().length < 4} onClick={withdraw}>确认撤销</button></> : <>{saved && <button className="btn btn-secondary" disabled={busy || drafting} onClick={() => { setWithdrawReason(''); setError('') }}>撤销纳入管理</button>}<button className="btn btn-secondary" onClick={() => setOpen(false)}>取消</button><button className="btn btn-primary" disabled={busy || drafting} onClick={submit}>{busy ? '保存中…' : '确认纳入管理'}</button></>}</div>
    </div></div>}
  </>
}
