import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI, API_ORIGIN } from '../api'

const SCOPES = [
  ['basic', '基本资料'], ['healthProfile', '健康档案'], ['reports', '体检报告'], ['healthRecords', '健康监测'],
  ['medications', '用药/营养素'], ['followups', '随访'], ['plans', '管理方案'], ['aiAnalysis', '既有AI分析'],
]
const PROVIDER_LABEL = '通义千问'
const REVIEW_TEMPLATES = [
  { key: 'checkup', label: '体检方案研判', title: '体检方案研判', description: '结合体检报告、健康档案和既往检查，明确本次体检重点与待审核方案。', scopes: ['basic','healthProfile','reports','plans','aiAnalysis'], target: '本次体检方案' },
  { key: 'nutrition', label: '营养干预研判', title: '营养干预研判', description: '结合指标、生活方式和依从性讨论本季度营养干预方向，形成季度待审核方案。', scopes: ['basic','healthProfile','healthRecords','medications','followups','plans'], target: '季度营养干预方案' },
  { key: 'annual', label: '年度管理研判', title: '年度管理研判', description: '结合健康档案、目标和既有服务，讨论下一年度管理重点与待审核方案。', scopes: ['basic','healthProfile','reports','healthRecords','followups','plans','aiAnalysis'], target: '年度管理方案' },
  { key: 'medical', label: '就医协助研判', title: '就医协助研判', description: '围绕明确健康问题讨论本次复查、就医或陪诊安排，形成单次待审核方案。', scopes: ['basic','healthProfile','reports','plans','aiAnalysis'], target: '单次就医协助方案' },
  { key: 'daily', label: '日常问题交流', title: '日常问题交流', description: '围绕具体问题进行信息分析和讨论；仅保存讨论结论，不自动生成方案。', scopes: ['basic','healthProfile','reports','healthRecords','medications','followups'], target: '讨论结论' },
]

const ASSESSMENT_LABELS = { summary: '核心结论', facts: '已确认事实', changes: '阶段变化', risks: '重点风险', actions: '下一步行动', missing: '待补信息' }
function StructuredAssessment({ data }) {
  if (!data) return null
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginBottom: 12 }}>
    {Object.entries(ASSESSMENT_LABELS).map(([key, label]) => (data[key] || []).length > 0 && <section key={key} style={{ border: '1px solid #DCE8E1', borderRadius: 10, padding: 12, background: key === 'risks' ? '#FFF8ED' : key === 'actions' ? '#EEF8F3' : '#FAFCFB' }}>
      <div style={{ fontWeight: 700, color: key === 'risks' ? '#B45309' : '#155E48', marginBottom: 7 }}>{label}</div>
      {(data[key] || []).map((item, index) => <div key={index} style={{ fontSize: 13, lineHeight: 1.55, marginTop: 5, paddingLeft: 12, position: 'relative' }}><span style={{ position: 'absolute', left: 0 }}>•</span>{item}</div>)}
    </section>)}
  </div>
}

function CleanText({ children }) {
  const lines = String(children || '').split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').trim()).filter(line => line && !/^[-—_]{3,}$/.test(line))
  return <div>{lines.map((line, index) => <div key={index} style={{ lineHeight: 1.65, fontSize: 14, marginTop: index ? 5 : 0 }}>{line.replace(/^[-*+]\s+/, '• ')}</div>)}</div>
}

const STAGE_SECTION_META = [
  { icon: '📈', label: '阶段变化', color: '#2563EB', background: '#EFF6FF' },
  { icon: '🔗', label: '生活关联', color: '#16845B', background: '#EEF8F3' },
  { icon: '⚠️', label: '潜在风险', color: '#B45309', background: '#FFF8ED' },
  { icon: '🧭', label: '下一步规划', color: '#7C3AED', background: '#F5F3FF' },
]

function splitStageAssessment(content) {
  const sections = []
  String(content || '').split(/\r?\n/).forEach(raw => {
    const line = raw.trim()
    if (!line) return
    const heading = line.match(/^[一二三四][、.．]\s*(.+)$/)
    if (heading) sections.push({ title: heading[1], lines: [] })
    else if (sections.length) sections[sections.length - 1].lines.push(line.replace(/^[-•▪]\s*/, ''))
  })
  return STAGE_SECTION_META.map((meta, index) => ({ ...meta, title: sections[index]?.title || meta.label, lines: sections[index]?.lines || [] }))
}

function replaceStageSection(content, sectionIndex, nextText) {
  const sections = splitStageAssessment(content)
  sections[sectionIndex].lines = String(nextText || '').split(/\r?\n/).map(line => line.replace(/^[-•▪]\s*/, '').trim()).filter(Boolean)
  const numerals = ['一', '二', '三', '四']
  return sections.map((section, index) => `${numerals[index]}、${section.title}\n${section.lines.map(line => `- ${line}`).join('\n')}`).join('\n\n')
}

function AssessmentLine({ line, color }) {
  const divider = line.indexOf('：')
  if (divider > 0 && divider < 28) return <div style={{ padding: '9px 11px', borderRadius: 8, background: '#fff', marginTop: 7, fontSize: 13, lineHeight: 1.65 }}><strong style={{ color }}>{line.slice(0, divider)}</strong><span style={{ color: '#33473E' }}>：{line.slice(divider + 1)}</span></div>
  return <div style={{ padding: '8px 11px 8px 25px', position: 'relative', borderBottom: '1px dashed #DCE8E1', fontSize: 13, lineHeight: 1.65 }}><span style={{ position: 'absolute', left: 10, color }}>•</span>{line}</div>
}

function StageWorkflow({ assessment }) {
  if (!assessment) return <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 6 }}>尚未生成评估</div>
  const status = assessment.status === 'pending' ? 'nutrition_review' : assessment.status
  const clinicalRequired = assessment.clinicalReview?.required === true
  const steps = [
    { label: 'AI草稿', state: 'done', note: '已生成' },
    { label: '营养师初审', state: status === 'nutrition_review' || status === 'rejected' ? 'current' : 'done', note: status === 'rejected' ? '已退回待调整' : status === 'nutrition_review' ? '当前环节' : '已完成' },
    { label: '健康顾问复审', state: status === 'doctor_review' ? 'current' : ['finalized', 'approved'].includes(status) ? (clinicalRequired ? 'done' : 'skipped') : 'waiting', note: status === 'doctor_review' ? '当前环节' : clinicalRequired ? (['finalized', 'approved'].includes(status) ? '已完成' : '待进入') : '按临床问题触发' },
    { label: '写入服务档案', state: ['finalized', 'approved'].includes(status) ? 'done' : 'waiting', note: ['finalized', 'approved'].includes(status) ? '已生成评估归档记录' : '待审核完成' },
  ]
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
    {steps.map((step, index) => {
      const palette = step.state === 'done' ? ['#16845B', '#EEF8F3'] : step.state === 'current' ? ['#7C3AED', '#F5F3FF'] : step.state === 'skipped' ? ['#65776F', '#F3F5F4'] : ['#9AA8A1', '#FAFBFA']
      return <div key={step.label} style={{ position: 'relative', border: `1px solid ${palette[0]}55`, background: palette[1], borderRadius: 9, padding: '9px 10px', textAlign: 'center' }}>
        <div style={{ fontSize: 16 }}>{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : step.state === 'skipped' ? '—' : '○'}</div>
        <div style={{ color: palette[0], fontSize: 12, fontWeight: 800, marginTop: 2 }}>{index + 1}. {step.label}</div>
        <div style={{ color: '#65776F', fontSize: 11, marginTop: 2 }}>{step.note}</div>
      </div>
    })}
  </div>
}

export default function AiCaseReviewPanel({ patientId, staff, toast, mode = 'all', onNavigate }) {
  const [topics, setTopics] = useState([])
  const [assessments, setAssessments] = useState([])
  const [assessmentMode, setAssessmentMode] = useState('routine')
  const [assessmentEdits, setAssessmentEdits] = useState({})
  const [expandedAssessments, setExpandedAssessments] = useState({})
  const [activeAssessmentSections, setActiveAssessmentSections] = useState({})
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', reviewType: 'custom', preferredProvider: 'qwen', contextScopes: SCOPES.map(([key]) => key) })
  const [conclusionText, setConclusionText] = useState('')
  const bottomRef = useRef(null)
  const active = useMemo(() => topics.find(item => item._id === activeId) || topics[0], [topics, activeId])
  const isStageAssessmentTopic = active?.reviewType === 'assessment' || /阶段性.*评估/.test(`${active?.title || ''} ${active?.description || ''}`)

  const replaceTopic = topic => {
    setTopics(items => [topic, ...items.filter(item => item._id !== topic._id)])
    setActiveId(topic._id)
  }
  const load = async () => {
    setLoading(true)
    try {
      const [topicRes, assessmentRes] = await Promise.all([staffAPI.getAiCaseReviews(patientId), staffAPI.getPhaseAssessments(patientId)])
      setTopics(topicRes.data || [])
      setAssessments(assessmentRes.data || [])
      setAssessmentEdits(Object.fromEntries((assessmentRes.data || []).map(item => [item._id, item.content || ''])))
      if (!activeId && topicRes.data?.length) setActiveId(topicRes.data[0]._id)
    } catch (err) { toast(err.message, 'error') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])
  useEffect(() => { setConclusionText(active?.conclusion?.content || ''); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30) }, [active?._id, active?.messages?.length])

  const createTopic = async () => {
    if (!form.title.trim()) return toast('请输入研判主题', 'error')
    setBusy(true)
    try { const res = await staffAPI.createAiCaseReview(patientId, form); replaceTopic(res.data); setShowCreate(false); setForm(f => ({ ...f, title: '', description: '', reviewType: 'custom' })) }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const updateScopes = async contextScopes => {
    try { const res = await staffAPI.updateAiCaseReview(patientId, active._id, { contextScopes }); replaceTopic(res.data) }
    catch (err) { toast(err.message, 'error') }
  }
  const uploadSelected = async event => {
    const selected = Array.from(event.target.files || []).slice(0, 6 - files.length)
    if (!selected.length) return
    setBusy(true)
    try {
      const uploaded = []
      for (const file of selected) {
        const res = await staffAPI.uploadImage(file)
        uploaded.push({ name: file.name, url: res.data.url, mimeType: file.type })
      }
      setFiles(list => [...list, ...uploaded].slice(0, 6))
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false); event.target.value = '' }
  }
  const send = async () => {
    if (!draft.trim() && !files.length) return
    setBusy(true)
    try {
      const res = await staffAPI.sendAiCaseReviewMessage(patientId, active._id, { content: draft, attachments: files })
      replaceTopic(res.data); setDraft(''); setFiles([])
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const generateConclusion = async () => {
    setBusy(true)
    try { const res = await staffAPI.generateAiCaseReviewConclusion(patientId, active._id); replaceTopic(res.data); setConclusionText(res.data.conclusion?.content || '') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const confirmConclusion = async () => {
    if (!conclusionText.trim()) return toast('结论不能为空', 'error')
    setBusy(true)
    try {
      const writeToPhaseAssessment = /阶段性.*评估/.test(`${active.title} ${active.description || ''}`)
      const res = await staffAPI.confirmAiCaseReviewConclusion(patientId, active._id, conclusionText, writeToPhaseAssessment)
      replaceTopic(res.data)
      if (res.archivedToPhaseAssessment) toast('结论已确认，并已写入阶段性健康评估')
      else {
        const target = REVIEW_TEMPLATES.find(item => item.key === active.reviewType)?.target
          || (/年度管理研判/.test(active.title) ? '年度管理方案' : '对应业务方案')
        toast(`结论已确认，将仅用于${target}`)
      }
    }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const applyReviewTemplate = async key => {
    const item = REVIEW_TEMPLATES.find(v => v.key === key); if (!item || !active) return
    setBusy(true)
    try {
      const description = `${item.description}\n\n固定研判输出：${item.key === 'daily' ? '问题要点、已确认事实、待补信息、人工决定的后续事项' : '研判依据、管理执行/问题分析、风险或数据缺口、待审核方案/下一步计划'}`
      const res = await staffAPI.updateAiCaseReview(patientId, active._id, { title: item.title, description, reviewType: item.key, contextScopes: item.scopes })
      replaceTopic(res.data); toast(`已套用${item.label}模板`)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const generateAssessment = async () => {
    setBusy(true)
    try {
      const res = await staffAPI.generatePhaseAssessment(patientId, assessmentMode)
      setAssessments(list => [res.data, ...list.filter(item => item._id !== res.data._id)])
      setAssessmentEdits(items => ({ ...items, [res.data._id]: res.data.content || '' }))
      toast(`${assessmentMode === 'intensive_nutrition' ? '强化干预' : '常规'}阶段评估草稿已生成，等待营养师初审`)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const reviewAssessment = async (assessment, action) => {
    const promptText = action === 'approve' ? '审核备注（可选）：' : action === 'escalate' ? '请说明需要健康顾问复审的临床问题：' : action === 'regenerate' ? '请填写需要AI修正的内容：' : '请填写退回原因：'
    const reviewNote = window.prompt(promptText, '')
    if (reviewNote === null || (action !== 'approve' && !reviewNote.trim())) return
    setBusy(true)
    try {
      const res = await staffAPI.reviewPhaseAssessment(patientId, assessment._id, { action, reviewNote, content: assessmentEdits[assessment._id] ?? assessment.content, clinicalRequired: action === 'escalate' })
      setAssessments(list => list.map(item => item._id === assessment._id ? res.data : item))
      const message = action === 'regenerate' ? 'AI已重新生成草稿，等待营养师初审' : res.data.status === 'doctor_review' ? '营养初审已完成，已转健康顾问临床复审' : res.data.status === 'finalized' ? '阶段性评估已完成审核，并写入服务档案' : '阶段性评估已退回，等待重新生成'
      toast(message)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  if (loading) return <div className="card"><div className="card-body">正在加载专题研判资料…</div></div>
  const visibleAssessments = assessments.filter(item => (item.assessmentMode || 'routine') === assessmentMode)
  const currentAssessment = visibleAssessments.find(item => !String(item.periodKey || '').includes('-legacy-')) || null
  return <div style={{ display: 'grid', gridTemplateColumns: mode === 'assessment' ? '1fr' : '280px minmax(0, 1fr)', gap: 16, minHeight: mode === 'assessment' ? 0 : 680 }}>
    {mode !== 'specialty' && <div className="card" style={{ gridColumn: '1/-1', border: '1px solid #7C3AED55' }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}><div style={{ flex: 1 }}><div className="card-title">阶段性健康评估</div><div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>统一评估入口，根据管理模式使用不同节奏</div><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className={`btn btn-sm ${assessmentMode === 'routine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAssessmentMode('routine')}>常规管理</button><button className={`btn btn-sm ${assessmentMode === 'intensive_nutrition' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAssessmentMode('intensive_nutrition')}>强化营养干预 · 12周</button></div><div style={{ marginTop: 9, padding: '8px 10px', background: assessmentMode === 'routine' ? '#EFF6FF' : '#EEF8F3', borderRadius: 8, fontSize: 12, color: '#4A6558' }}>{assessmentMode === 'routine' ? '普通客户每月评估；重点客户每2周评估。' : '第1—4周每周评估；第5—12周每2周评估；第12周形成强化干预总结。'}</div><StageWorkflow assessment={currentAssessment} /></div>{['nutritionist', 'familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={generateAssessment}>生成当前节点草稿</button>}</div>
      <div className="card-body" style={{ display: 'grid', gap: 12 }}>
        {!visibleAssessments.length && <div style={{ color: '#8AA89C' }}>{assessmentMode === 'intensive_nutrition' ? '暂无强化干预评估。只有客户确认营养干预方案后，才能按12周节点生成。' : '暂无常规阶段性评估。试点阶段仅支持人工触发。'}</div>}
        {visibleAssessments.map(item => {
          const status = item.status === 'pending' ? 'nutrition_review' : item.status
          const statusLabel = { nutrition_review: '待营养师初审', doctor_review: '待健康顾问临床复审', finalized: '已写入服务档案', approved: '历史已审核', rejected: '已退回' }[status] || status
          const canNutritionReview = ['nutritionist', 'superadmin'].includes(staff?.role) && status === 'nutrition_review'
          const canRegenerate = ['nutritionist', 'superadmin'].includes(staff?.role) && status === 'rejected'
          const canDoctorReview = ['familyDoctor', 'superadmin'].includes(staff?.role) && status === 'doctor_review'
          const expanded = expandedAssessments[item._id] === true
          const evidenceCount = (item.evidenceSources || []).length
          const stageSections = splitStageAssessment(assessmentEdits[item._id] ?? item.content)
          const activeSectionIndex = activeAssessmentSections[item._id]
          const activeSection = Number.isInteger(activeSectionIndex) ? stageSections[activeSectionIndex] : null
          return <section key={item._id} id={`phase-assessment-${item._id}`} style={{ border: '1px solid #DCE8E1', borderRadius: 10, padding: 13, background: status === 'finalized' ? '#F2FAF6' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong style={{ color: '#155E48' }}>📊 {item.periodLabel}{item.assessmentMode === 'intensive_nutrition' ? '评估' : '阶段性健康评估'}</strong><span style={{ fontSize: 12, fontWeight: 700, color: status === 'doctor_review' ? '#B45309' : status === 'finalized' ? '#16845B' : '#7C3AED' }}>{statusLabel}</span></div>
            <div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>{item.templateSnapshot?.name || '模板驱动评估'} · {evidenceCount ? `${evidenceCount}项依据` : '依据待核实'}{['finalized', 'approved'].includes(status) ? ' · 归档位置：服务档案 / 阶段性评估' : ''}</div>
            {['finalized', 'approved'].includes(status) && onNavigate && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={() => onNavigate('serviceRecords')}>查看服务档案中的评估记录</button>}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 9 }}>
              {stageSections.map((section, index) => <button key={section.label} type="button" onClick={() => setActiveAssessmentSections(values => ({ ...values, [item._id]: expanded ? index : values[item._id] === index ? null : index }))} style={{ border: `1px solid ${activeSectionIndex === index ? section.color : '#DCE8E1'}`, borderRadius: 10, padding: '12px 8px', background: activeSectionIndex === index ? section.background : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 25, lineHeight: 1 }}>{section.icon}</div>
                <div style={{ marginTop: 7, fontSize: 13, fontWeight: 800, color: section.color }}>{section.label}</div>
                <div style={{ marginTop: 3, fontSize: 11, color: '#7A8C83' }}>{section.lines.length || 0}项</div>
              </button>)}
            </div>
            {!expanded && activeSection && <div style={{ marginTop: 10, padding: 12, borderRadius: 9, background: activeSection.background, borderLeft: `4px solid ${activeSection.color}` }}>
              <div style={{ fontWeight: 800, color: activeSection.color, marginBottom: 7 }}>{activeSection.title}</div>
              {activeSection.lines.length ? activeSection.lines.map((line, index) => <AssessmentLine key={index} line={line} color={activeSection.color} />) : <div style={{ color: '#7A8C83', fontSize: 13 }}>本板块暂无内容</div>}
            </div>}
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => { if (!expanded && !Number.isInteger(activeSectionIndex)) setActiveAssessmentSections(values => ({ ...values, [item._id]: 0 })); setExpandedAssessments(values => ({ ...values, [item._id]: !expanded })) }}>{expanded ? '退出编辑' : (canNutritionReview || canDoctorReview ? '编辑当前板块并审核' : '查看原文')}</button>
            {expanded && <>
              {item.clinicalReview?.reasons?.length > 0 && <div style={{ marginTop: 8, padding: 8, borderRadius: 7, background: '#FFF8ED', color: '#92400E', fontSize: 12 }}>临床复审原因：{item.clinicalReview.reasons.join('；')}</div>}
              {(() => {
                const draftContent = assessmentEdits[item._id] ?? item.content ?? ''
                const editSections = splitStageAssessment(draftContent)
                const editIndex = Number.isInteger(activeSectionIndex) ? activeSectionIndex : 0
                const editSection = editSections[editIndex]
                return <div style={{ marginTop: 10, padding: 12, borderRadius: 9, background: editSection.background, border: `1px solid ${editSection.color}55` }}>
                  <div style={{ fontWeight: 800, color: editSection.color }}>正在编辑：{editSection.label}</div>
                  <div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>每行一个要点；切换上方图标可编辑其他板块。</div>
                  <textarea className="form-input" rows={9} style={{ marginTop: 9, background: '#fff' }} disabled={!canNutritionReview && !canDoctorReview} value={editSection.lines.join('\n')} onChange={event => setAssessmentEdits(values => ({ ...values, [item._id]: replaceStageSection(draftContent, editIndex, event.target.value) }))} />
                </div>
              })()}
              {item.nutritionReview?.reviewedAt && <div style={{ marginTop: 7, fontSize: 12, color: '#65776F' }}>营养师初审：{item.nutritionReview.reviewedByName || '-'} · {item.nutritionReview.note || '无补充备注'}</div>}
              {item.doctorReview?.reviewedAt && <div style={{ marginTop: 5, fontSize: 12, color: '#65776F' }}>健康顾问复审：{item.doctorReview.reviewedByName || '-'} · {item.doctorReview.note || '无补充备注'}</div>}
              {canNutritionReview && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'approve')}>营养初审通过</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'escalate')}>转健康顾问复审</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'reject')}>退回AI调整</button></div>}
              {canRegenerate && <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'regenerate')}>按退回意见由AI重新生成</button></div>}
              {canDoctorReview && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'approve')}>临床复审通过并入档</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'return')}>退回营养师</button></div>}
            </>}
          </section>
        })}
      </div>
    </div>}
    {mode !== 'assessment' && <>
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card-header"><div><div className="card-title">专项辅助研判</div><div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>仅用于临时、专项或跨专业问题讨论，不替代上方正式阶段评估</div></div><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>新建主题</button></div>
      <div className="card-body" style={{ padding: 10 }}>
        {!topics.length && <div style={{ padding: 20, color: '#8AA89C', textAlign: 'center' }}>为客户的具体健康问题建立独立研判主题</div>}
        {topics.map(topic => <button key={topic._id} onClick={() => setActiveId(topic._id)} style={{ width: '100%', textAlign: 'left', border: topic._id === active?._id ? '1px solid #1E6B50' : '1px solid #E0D9CE', background: topic._id === active?._id ? '#EEF7F2' : '#fff', borderRadius: 8, padding: 11, marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, color: '#1A2B24' }}>{topic.title}</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 5 }}>{topic.status === 'concluded' ? '已形成确认结论' : `${topic.messages?.length || 0} 条讨论`} · {PROVIDER_LABEL}</div>
        </button>)}
      </div>
    </div>

    {active ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card"><div className="card-body" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{active.title}</div><div style={{ color: '#4A6558', fontSize: 13, marginTop: 4 }}>{active.description || '围绕该问题持续讨论，资料和结论均保存在客户专项资料库。'}</div></div>
          <div style={{ color: '#4A6558', fontSize: 13 }}>当前模型：{PROVIDER_LABEL}</div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCOPES.map(([key, label]) => {
          const checked = active.contextScopes?.includes(key)
          return <label key={key} style={{ fontSize: 12, border: `1px solid ${checked ? '#1E6B50' : '#D8E1DC'}`, color: checked ? '#1E6B50' : '#65776F', borderRadius: 16, padding: '5px 9px', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => updateScopes(checked ? active.contextScopes.filter(v => v !== key) : [...active.contextScopes, key])} style={{ marginRight: 5 }} />{label}</label>
        })}</div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #E5ECE8' }}><div style={{ fontSize: 12, color: '#65776F', marginBottom: 7 }}>套用研判模板（可用于当前主题）</div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{REVIEW_TEMPLATES.map(item => <button key={item.key} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => applyReviewTemplate(item.key)}>{item.label}</button>)}</div></div>
      </div></div>

      <div className="card" style={{ flex: 1 }}><div className="card-body" style={{ height: 480, overflowY: 'auto', background: '#F7F8F6' }}>
        {!active.messages?.length && <div style={{ color: '#8AA89C', textAlign: 'center', paddingTop: 120 }}>输入问题或上传图片，AI会按上方授权范围调取客户资料。</div>}
        {(active.messages || []).map(message => <div key={message._id} style={{ display: 'flex', justifyContent: message.role === 'staff' ? 'flex-end' : 'flex-start', marginBottom: 14 }}><div style={{ maxWidth: '82%', background: message.role === 'staff' ? '#DDF2E7' : '#fff', border: '1px solid #DCE5E0', borderRadius: 12, padding: '10px 13px' }}>
          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 5 }}>{message.role === 'ai' ? `AI助手 · ${message.provider || ''}${message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)}秒` : ''}` : `${message.staffName} · ${message.staffRole}`}</div>
          <CleanText>{message.content}</CleanText>
          {!!message.attachments?.length && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>{message.attachments.map((file, index) => <a key={index} href={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} target="_blank" rel="noreferrer"><img src={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} alt={file.name || '附件'} style={{ width: 90, height: 72, objectFit: 'cover', borderRadius: 6 }} /></a>)}</div>}
          {!!message.contextSnapshot?.sources?.length && <details style={{ marginTop: 8, fontSize: 12, color: '#4A6558' }}><summary>本轮依据 {message.contextSnapshot.sources.length} 项资料</summary><div style={{ marginTop: 5 }}>{message.contextSnapshot.sources.map((s, i) => <div key={i}>· {s}</div>)}</div></details>}
        </div></div>)}<div ref={bottomRef} />
      </div></div>

      <div className="card"><div className="card-body" style={{ padding: 12 }}>
        {!!files.length && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{files.map((file, index) => <span key={index} style={{ fontSize: 12, background: '#EEF7F2', padding: '5px 8px', borderRadius: 6 }}>{file.name}<button onClick={() => setFiles(list => list.filter((_, i) => i !== index))} style={{ border: 0, background: 'none', cursor: 'pointer' }}>×</button></span>)}</div>}
        <textarea className="form-input" rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="提出问题、补充判断，或说明希望AI调取和比较哪些资料…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>添加图片<input type="file" accept="image/*" multiple hidden onChange={uploadSelected} /></label><button className="btn btn-primary btn-sm" disabled={busy || (!draft.trim() && !files.length)} onClick={send}>{busy ? '处理中…' : '发送给AI'}</button></div>
      </div></div>

      {!!active.messages?.length && <div className="card"><div className="card-header"><div className="card-title">阶段性结论</div><button className="btn btn-secondary btn-sm" disabled={busy} onClick={generateConclusion}>AI整理结论</button></div><div className="card-body">
        <StructuredAssessment data={active.conclusion?.structured} />
        <textarea className="form-input" rows={10} value={conclusionText} onChange={e => setConclusionText(e.target.value)} placeholder="AI整理后由健康顾问复核确认；只有已确认结论会进入管理方案上下文。" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><span style={{ fontSize: 12, color: active.conclusion?.status === 'confirmed' ? '#16845B' : '#8AA89C' }}>{isStageAssessmentTopic ? '研判结论仅供参考；正式阶段评估必须使用上方营养初审流程' : active.conclusion?.status === 'confirmed' ? `已由${active.conclusion.confirmedByName || '健康顾问'}确认` : '草稿不会进入任何正式方案'}</span>{!isStageAssessmentTopic && ['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy || !conclusionText.trim()} onClick={confirmConclusion}>{`确认并用于${REVIEW_TEMPLATES.find(item => item.key === active.reviewType)?.target || (/年度管理研判/.test(active.title) ? '年度管理方案' : '对应方案')}`}</button>}</div>
      </div></div>}
    </div> : <div className="card"><div className="card-body" style={{ padding: 60, textAlign: 'center', color: '#8AA89C' }}>请先新建一个研判主题</div></div>}
    </>}

    {showCreate && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 620 }}><div className="modal-header"><div className="modal-title">新建专项研判主题</div><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div><div className="modal-body">
      <div className="form-group"><label className="form-label">研判模板</label><select className="form-input" defaultValue="" onChange={e => { const item = REVIEW_TEMPLATES.find(v => v.key === e.target.value); if (item) setForm(f => ({ ...f, title: item.title, description: item.description, reviewType: item.key, contextScopes: item.scopes })); else setForm(f => ({ ...f, reviewType: 'custom' })) }}><option value="">自定义主题</option>{REVIEW_TEMPLATES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select><div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>就医协助形成单次方案，营养干预形成季度方案；只有年度管理研判进入年度管理方案。</div></div>
      <div className="form-group"><label className="form-label">主题名称</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：近期血压波动原因分析" /></div>
      <div className="form-group"><label className="form-label">问题说明</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">测试模型</label><div className="form-input" style={{ background: '#F7F8F6', color: '#4A6558' }}>{PROVIDER_LABEL}</div></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={createTopic}>创建主题</button></div></div></div>}
  </div>
}
