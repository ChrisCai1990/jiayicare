import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI, API_ORIGIN } from '../api'
import ReviewPlanAmendment from './ReviewPlanAmendment'

const PHASE_ROLES = { familyDoctor: '健康顾问', nutritionist: '营养师', rehabSpecialist: '运动复健师', tcmDoctor: '药食同源专业人员' }
const PHASE_DOMAINS = { comprehensive: '综合健康', nutrition: '营养', exercise: '运动', tcm: '药食同源' }
const SCOPES = [
  ['basic', '基本资料'], ['healthProfile', '健康档案'], ['reports', '体检报告'], ['healthRecords', '健康监测'],
  ['medications', '用药/营养素'], ['followups', '随访'], ['plans', '管理方案'], ['aiAnalysis', '既有AI分析'],
]
const PROVIDER_LABEL = '通义千问'
const REVIEW_TYPE_LABELS = { checkup: '体检方案研判', nutrition: '营养干预研判', annual: '年度管理研判', assessment: '阶段性评估', medical: '就医协助研判', daily: '日常问题交流', specialty: '专病分析研判', custom: '自定义研判' }
const formatDateTime = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '-'
const topicTypeLabel = topic => topic?.templateSnapshot?.name || REVIEW_TYPE_LABELS[topic?.reviewType] || '专项研判'
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
  const lines = String(children || '').replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').trim()).filter(line => line && !/^[-—_]{3,}$/.test(line))
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
  const primary = assessment.primaryReviewRole || 'nutritionist'
  const status = assessment.status === 'pending' ? 'nutrition_review' : assessment.status
  const clinicalRequired = assessment.clinicalReview?.required === true
  const steps = [
    { label: 'AI草稿', state: 'done', note: '已生成' },
    ...(primary === 'familyDoctor' ? [] : [{ label: `${PHASE_ROLES[primary]}审核`, state: ['nutrition_review', 'professional_review', 'rejected'].includes(status) ? 'current' : 'done', note: status === 'rejected' ? '已退回待调整' : ['nutrition_review', 'professional_review'].includes(status) ? '当前环节' : '已完成' }]),
    { label: '健康顾问审核', state: status === 'doctor_review' || (status === 'rejected' && primary === 'familyDoctor') ? 'current' : ['archive_pending', 'finalized', 'approved'].includes(status) ? (clinicalRequired || primary === 'familyDoctor' ? 'done' : 'skipped') : 'waiting', note: status === 'doctor_review' ? '当前环节' : primary === 'familyDoctor' ? '综合审核' : '有风险或跨专业问题时复核' },
    { label: '写入服务档案', state: ['finalized', 'approved'].includes(status) ? 'done' : status === 'archive_pending' ? 'current' : 'waiting', note: ['finalized', 'approved'].includes(status) ? '已生成评估归档记录' : status === 'archive_pending' ? '审核已完成，待归档重试' : '待审核完成' },
  ]
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length},minmax(120px,1fr))`, gap: 8, marginTop: 10 }}>
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
  const [assessmentDomain, setAssessmentDomain] = useState(({ nutritionist: 'nutrition', rehabSpecialist: 'exercise', tcmDoctor: 'tcm' })[staff?.role] || 'comprehensive')
  const [topics, setTopics] = useState([])
  const [managedTemplates, setManagedTemplates] = useState([])
  const [reviewSettings, setReviewSettings] = useState({ allowCustomTopic: true })
  const [assessments, setAssessments] = useState([])
  const [closedLoop, setClosedLoop] = useState(false)
  const [assessmentMode, setAssessmentMode] = useState('routine')
  const [assessmentEdits, setAssessmentEdits] = useState({})
  const [expandedAssessments, setExpandedAssessments] = useState({})
  const [activeAssessmentSections, setActiveAssessmentSections] = useState({})
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [sendNotice, setSendNotice] = useState(null)
  const sendingRef = useRef(false)
  const pendingSendRef = useRef(null)
  const patientRef = useRef(patientId)
  patientRef.current = patientId
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [headerExpanded, setHeaderExpanded] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', reviewType: 'custom', templateId: '', preferredProvider: 'qwen', contextScopes: SCOPES.map(([key]) => key), managementTargets: [{ goal: '', focus: '', nutritionRelevant: false }] })
  const [editForm, setEditForm] = useState({ title: '', description: '', contextScopes: [], managementTargets: [], targetChangeNote: '' })
  const [conclusionText, setConclusionText] = useState('')
  const [managementTargets, setManagementTargets] = useState([])
  const [targetChangeNote, setTargetChangeNote] = useState('')
  const chatRef = useRef(null)
  const active = useMemo(() => topics.find(item => item._id === activeId) || null, [topics, activeId])
  const sendStalled = active?.generation?.status === 'running' && Date.now() - new Date(active.generation.startedAt).getTime() > 300000
  const participantNames = useMemo(() => active ? [...new Set([active.createdByName, ...(active.messages || []).filter(item => item.role === 'staff').map(item => item.staffName)].filter(Boolean))] : [], [active])
  const reviewTemplates = managedTemplates
  const isStageAssessmentTopic = active?.reviewType === 'assessment' || /阶段性.*评估/.test(`${active?.title || ''} ${active?.description || ''}`)

  const replaceTopic = topic => {
    setTopics(items => [topic, ...items.filter(item => item._id !== topic._id)])
    setActiveId(topic._id)
  }
  const load = async () => {
    setLoading(true)
    try {
      const [topicRes, assessmentRes, templateRes] = mode === 'specialty'
        ? await Promise.all([staffAPI.getAiCaseReviews(patientId), Promise.resolve({ data: [] }), staffAPI.getAiCaseReviewTemplates()])
        : await Promise.all([staffAPI.getAiCaseReviews(patientId), staffAPI.getPhaseAssessments(patientId, new URLSearchParams(window.location.search).get('phaseAssessmentId') || ''), Promise.resolve({ data: [] })])
      setTopics(topicRes.data || []); setManagedTemplates(templateRes.data || []); setReviewSettings(templateRes.settings || { allowCustomTopic: true })
      const requestedTopicId = new URLSearchParams(window.location.search).get('caseReviewId')
      if ((topicRes.data || []).some(item => item._id === requestedTopicId)) setActiveId(requestedTopicId)
      setAssessments(assessmentRes.data || [])
      setClosedLoop(assessmentRes.healthManagementEnabled === true)
      const targetId = new URLSearchParams(window.location.search).get('phaseAssessmentId')
      const target = (assessmentRes.data || []).find(item => item._id === targetId)
      if (target) {
        setAssessmentMode(target.assessmentMode || 'routine')
        setAssessments(items => [target, ...items.filter(item => item._id !== targetId)])
      }
      setAssessmentEdits(Object.fromEntries((assessmentRes.data || []).map(item => [item._id, item.content || ''])))
    } catch (err) { toast(err.message, 'error') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])
  useEffect(() => {
    setDraft(''); setFiles([]); setSendNotice(null); pendingSendRef.current = null
  }, [patientId])
  const acceptTopic = topic => {
    setTopics(items => [topic, ...items.filter(item => item._id !== topic._id)])
    const pending = pendingSendRef.current
    if (pending?.topicId === topic._id && topic.messages?.some(message => message.requestId === pending.requestId)) {
      setDraft(value => value === pending.content ? '' : value)
      setFiles(value => value === pending.attachments ? [] : value)
      pendingSendRef.current = null
      setSendNotice(null)
    }
  }
  const needsSendRefresh = topics.some(topic => topic.generation?.status === 'running') || !!sendNotice
  useEffect(() => {
    if (!needsSendRefresh) return
    let cancelled = false, refreshing = false
    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const res = await staffAPI.getAiCaseReviews(patientId)
        if (!cancelled) {
          setTopics(res.data || [])
          const pending = pendingSendRef.current
          const topic = (res.data || []).find(item => item._id === pending?.topicId)
          if (topic) acceptTopic(topic)
        }
      } catch { /* Keep the persisted send state visible; the next refresh can recover. */ }
      finally { refreshing = false }
    }
    const timer = setInterval(refresh, 2500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [patientId, needsSendRefresh])
  useEffect(() => {
    setConclusionText(active?.conclusion?.content || '')
    if (active?.annualPlanYear) setHeaderExpanded(true)
    setManagementTargets(active?.conclusion?.managementTargets || [])
    setTargetChangeNote('')
    setTimeout(() => { if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }) }, 30)
  }, [active?._id, active?.messages?.length])

  const createTopic = async () => {
    if (!form.title.trim()) return toast('请输入研判主题', 'error')
    const managementTargets = (form.managementTargets || []).filter(row => row.goal?.trim() || row.focus?.trim())
    if (managementTargets.some(row => !row.goal?.trim() || !row.focus?.trim())) return toast('拟目标和拟干预重点需成对填写', 'error')
    setBusy(true)
    try {
      const res = await staffAPI.createAiCaseReview(patientId, { ...form, managementTargets })
      replaceTopic(res.data); setShowCreate(false)
      setForm(f => ({ ...f, title: '', description: '', reviewType: 'custom', templateId: '', managementTargets: [{ goal: '', focus: '', nutritionRelevant: false }] }))
      if (['annual', 'checkup'].includes(res.data.reviewType) && res.data.contextScopes?.includes('reports')) {
        try {
          const started = await staffAPI.sendAiCaseReviewMessage(patientId, res.data._id, { autoStart: true, requestId: `auto_${res.data._id}` })
          replaceTopic(started.data)
        } catch (error) {
          try {
            const refreshed = await staffAPI.getAiCaseReviews(patientId)
            const current = refreshed.data?.find(item => item._id === res.data._id)
            if (current) replaceTopic(current)
          } catch { /* The saved topic remains available when the page reloads. */ }
          toast(`主题已建立，请核对自动研判状态：${error.message}`, 'error')
        }
      }
    }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const startAutomaticReview = async () => {
    if (!active || busy) return
    setBusy(true)
    try {
      const res = await staffAPI.sendAiCaseReviewMessage(patientId, active._id, { autoStart: true, requestId: `auto_${active._id}` })
      replaceTopic(res.data)
      toast('已开始从最近一次体检报告自动研判')
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const updateScopes = async contextScopes => {
    try { const res = await staffAPI.updateAiCaseReview(patientId, active._id, { contextScopes }); replaceTopic(res.data) }
    catch (err) { toast(err.message, 'error') }
  }
  const openTopicEdit = topic => {
    setActiveId(topic._id)
    setEditForm({ title: topic.title || '', description: topic.description || '', contextScopes: topic.contextScopes || [],
      managementTargets: topic.conclusion?.managementTargets?.length ? topic.conclusion.managementTargets.map(row => ({ goal: row.goal || '', focus: row.focus || '', nutritionRelevant: row.nutritionRelevant === true })) : [{ goal: '', focus: '', nutritionRelevant: false }], targetChangeNote: '' })
    setShowEdit(true)
  }
  const saveTopicEdit = async () => {
    if (!editForm.title.trim()) return toast('主题名称不能为空', 'error')
    const managementTargets = (editForm.managementTargets || []).filter(row => row.goal?.trim() || row.focus?.trim())
    if (managementTargets.some(row => !row.goal?.trim() || !row.focus?.trim())) return toast('拟目标和拟干预重点需成对填写', 'error')
    const targetsChanged = active.conclusion?.status === 'confirmed' && JSON.stringify(managementTargets) !== JSON.stringify((active.conclusion.managementTargets || []).map(row => ({ goal: row.goal, focus: row.focus, nutritionRelevant: row.nutritionRelevant === true })))
    if (targetsChanged && !editForm.targetChangeNote.trim()) return toast('请填写与客户沟通后的目标调整说明', 'error')
    setBusy(true)
    try { const res = await staffAPI.updateAiCaseReview(patientId, active._id, { ...editForm, managementTargets }); replaceTopic(res.data); setShowEdit(false); toast(targetsChanged ? '目标已调整并保留原确认版本' : '主题已修改') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const deleteTopic = async topic => {
    if (!window.confirm(`确定删除主题“${topic.title}”及其全部讨论吗？`)) return
    setBusy(true)
    try { await staffAPI.deleteAiCaseReview(patientId, topic._id); setTopics(items => items.filter(item => item._id !== topic._id)); if (activeId === topic._id) setActiveId(''); toast('主题已删除') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const editMessage = async message => {
    const content = window.prompt('修改讨论内容：', message.content)
    if (content === null || !content.trim() || content.trim() === message.content) return
    setBusy(true)
    try { const res = await staffAPI.updateAiCaseReviewMessage(patientId, active._id, message._id, { content }); replaceTopic(res.data); setConclusionText(''); toast('讨论内容已修改，请根据需要补充分析或重新整理结论') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const deleteMessage = async message => {
    const note = message.role === 'staff' ? '同时删除紧随其后的AI分析' : '删除这条AI分析'
    if (!window.confirm(`确定${note}吗？`)) return
    setBusy(true)
    try { const res = await staffAPI.deleteAiCaseReviewMessage(patientId, active._id, message._id); replaceTopic(res.data); setConclusionText(''); toast('讨论记录已删除，阶段性结论已失效，请重新整理') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
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
  const send = async (retryMessage = null) => {
    if (busy || sendingRef.current || !active || (active.generation?.status === 'running' && !(retryMessage && sendStalled))) return
    const content = retryMessage ? retryMessage.content : draft
    const attachments = retryMessage ? retryMessage.attachments || [] : files
    if (!content.trim() && !attachments.length) return
    const signature = JSON.stringify([patientId, active._id, content, attachments])
    const previous = pendingSendRef.current
    const requestId = retryMessage?.requestId || (previous?.signature === signature ? previous.requestId : crypto.randomUUID())
    const pending = { signature, requestId, topicId: active._id, patientId, content, attachments }
    pendingSendRef.current = pending
    sendingRef.current = true
    setSendNotice(null)
    setBusy(true)
    try {
      const res = await staffAPI.sendAiCaseReviewMessage(patientId, pending.topicId, { content, attachments, requestId })
      if (patientRef.current === patientId) acceptTopic(res.data)
    } catch (err) {
      if (patientRef.current === patientId) setSendNotice({ topicId: pending.topicId, text: `${err.message}。正在核对发送状态；再次发送会核对同一条消息。` })
    } finally { sendingRef.current = false; setBusy(false) }
  }
  const generateConclusion = async () => {
    setBusy(true)
    try { const res = await staffAPI.generateAiCaseReviewConclusion(patientId, active._id); replaceTopic(res.data); setConclusionText(res.data.conclusion?.content || ''); setManagementTargets(res.data.conclusion?.managementTargets || []) }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const confirmConclusion = async () => {
    if (!conclusionText.trim()) return toast('结论不能为空', 'error')
    const targetsChanged = active.conclusion?.status === 'confirmed' && JSON.stringify(managementTargets) !== JSON.stringify(active.conclusion.managementTargets || [])
    if (targetsChanged && !targetChangeNote.trim()) return toast('请填写与客户沟通后的目标调整说明', 'error')
    setBusy(true)
    try {
      const writeToPhaseAssessment = /阶段性.*评估/.test(`${active.title} ${active.description || ''}`)
      const res = await staffAPI.confirmAiCaseReviewConclusion(patientId, active._id, conclusionText, writeToPhaseAssessment, managementTargets, targetChangeNote)
      replaceTopic(res.data)
      if (res.archivedToPhaseAssessment) toast('结论已确认，并已写入阶段性健康评估')
      else {
        const target = active.templateSnapshot?.target || reviewTemplates.find(item => item.key === String(active.templateId || ''))?.target
          || (/年度管理研判/.test(active.title) ? '年度管理方案' : '对应业务方案')
        toast(`结论已确认，将仅用于${target}`)
      }
    }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const applyReviewTemplate = async key => {
    const item = reviewTemplates.find(v => v.key === key); if (!item || !active) return
    setBusy(true)
    try {
      const description = `${item.description}\n\n固定研判输出：${item.outputGuide || (item.key === 'daily' ? '问题要点、已确认事实、待补信息、人工决定的后续事项' : '研判依据、管理执行/问题分析、风险或数据缺口、待审核方案/下一步计划')}`
      const res = await staffAPI.updateAiCaseReview(patientId, active._id, { title: item.title, description, reviewType: item.reviewType || 'specialty', contextScopes: item.scopes })
      replaceTopic(res.data); toast(`已套用${item.label}模板`)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const generateAssessment = async (frequency = 'quarterly') => {
    setBusy(true)
    try {
      const res = await staffAPI.generatePhaseAssessment(patientId, assessmentMode, assessmentDomain, frequency)
      setAssessments(list => [res.data, ...list.filter(item => item._id !== res.data._id)])
      setAssessmentEdits(items => ({ ...items, [res.data._id]: res.data.content || '' }))
      toast(`${assessmentMode === 'intensive_nutrition' ? '强化干预' : '常规'}阶段评估草稿已生成，等待对应岗位审核`)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const reviewAssessment = async (assessment, action) => {
    const promptText = action === 'approve' ? '审核备注（可选）：' : action === 'escalate' ? '请说明需要健康顾问综合复核的问题：' : action === 'regenerate' ? '请填写需要AI修正的内容：' : '请填写退回原因：'
    const reviewNote = action === 'retry_archive' ? '' : window.prompt(promptText, '')
    if (reviewNote === null || (!['approve', 'retry_archive'].includes(action) && !reviewNote.trim())) return
    setBusy(true)
    try {
      const res = await staffAPI.reviewPhaseAssessment(patientId, assessment._id, { action, revision: assessment.__v, reviewNote, content: assessmentEdits[assessment._id] ?? assessment.content, clinicalRequired: action === 'escalate' })
      setAssessments(list => list.map(item => item._id === assessment._id ? res.data : item))
      setAssessmentEdits(values => ({ ...values, [assessment._id]: res.data.content || '' }))
      const message = res.data.status === 'archive_pending' ? '审核结果已保存，归档暂未完成，请重试归档' : action === 'regenerate' ? 'AI已重新生成草稿，等待对应岗位审核' : res.data.status === 'doctor_review' ? '已转健康顾问综合审核' : res.data.status === 'finalized' ? '阶段性评估已完成审核，并写入服务档案' : '阶段性评估已退回对应岗位'
      toast(message)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  if (loading) return <div className="card"><div className="card-body">正在加载专题研判资料…</div></div>
  const visibleAssessments = assessments.filter(item => (item.assessmentMode || 'routine') === assessmentMode)
  const currentAssessment = visibleAssessments.find(item => !String(item.periodKey || '').includes('-legacy-')) || null
  return <div style={{ display: 'grid', gridTemplateColumns: mode === 'assessment' ? '1fr' : '230px minmax(0, 1fr)', gap: 14, minHeight: mode === 'assessment' ? 0 : 760 }}>
    {mode !== 'specialty' && <div className="card" style={{ gridColumn: '1/-1', border: '1px solid #7C3AED55' }}>
      <div className="card-header" style={{ alignItems: 'flex-start' }}><div style={{ flex: 1 }}><div className="card-title">阶段性健康评估</div><div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>{closedLoop ? '基于已确认方案；常规采用自然季度，强化营养按干预开始日期计算' : '基于已确认方案；沿用原月度评估及营养师初审'}</div><div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className={`btn btn-sm ${assessmentMode === 'routine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAssessmentMode('routine')}>常规管理</button><button className={`btn btn-sm ${assessmentMode === 'intensive_nutrition' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAssessmentMode('intensive_nutrition')}>强化营养干预 · 12周</button></div><div style={{ marginTop: 9, padding: '8px 10px', background: assessmentMode === 'routine' ? '#EFF6FF' : '#EEF8F3', borderRadius: 8, fontSize: 12, color: '#4A6558' }}>{assessmentMode === 'routine' ? (closedLoop ? '来源：已确认年度管理方案；常规正式评估按季度，按领域交对应岗位审核。' : '来源：已确认年度管理方案；按原月度模板生成，营养师初审，需要时健康顾问复审。') : '来源：已确认强化营养干预方案及开始日期；第1—4周每周评估，第5—12周每2周评估，第12周形成总结。'}</div><StageWorkflow assessment={currentAssessment} /></div>{[...Object.keys(PHASE_ROLES), 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => generateAssessment()}>生成当前节点草稿</button>}</div>
      <div className="card-body" style={{ display: 'grid', gap: 12 }}>
        {closedLoop && assessmentMode === 'routine' && ['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => generateAssessment('yearly')}>生成年度总评草稿（进入第11个月）</button>}
        {closedLoop && assessmentMode === 'routine' && <label>评估领域 <select className="form-input" value={assessmentDomain} onChange={event => setAssessmentDomain(event.target.value)}>{Object.entries(PHASE_DOMAINS).filter(([key]) => ['familyDoctor', 'superadmin'].includes(staff?.role) || key === ({ nutritionist: 'nutrition', rehabSpecialist: 'exercise', tcmDoctor: 'tcm' })[staff?.role]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        {!visibleAssessments.length && <div style={{ color: '#8AA89C' }}>{assessmentMode === 'intensive_nutrition' ? '暂无强化干预评估。只有客户确认营养干预方案后，才能按12周节点生成。' : '暂无常规阶段性评估。试点阶段仅支持人工触发。'}</div>}
        {visibleAssessments.map(item => {
          const status = item.status === 'pending' ? 'nutrition_review' : item.status
          const primary = item.primaryReviewRole || 'nutritionist'
          const statusLabel = { nutrition_review: '待营养师初审', professional_review: `待${PHASE_ROLES[primary]}审核`, doctor_review: '待健康顾问审核', archive_pending: '已审核·待归档重试', finalized: '已写入服务档案', approved: '历史已审核', rejected: `已退回${PHASE_ROLES[primary]}` }[status] || status
          const canNutritionReview = [primary, 'superadmin'].includes(staff?.role) && ['nutrition_review', 'professional_review'].includes(status)
          const canRegenerate = [primary, 'superadmin'].includes(staff?.role) && status === 'rejected'
          const canRetryArchive = [item.finalReviewRole, 'superadmin'].includes(staff?.role) && status === 'archive_pending'
          const canDoctorReview = ['familyDoctor', 'superadmin'].includes(staff?.role) && status === 'doctor_review'
          const expanded = expandedAssessments[item._id] === true
          const evidenceCount = (item.evidenceSources || []).length
          const stageSections = splitStageAssessment(assessmentEdits[item._id] ?? item.content)
          const activeSectionIndex = activeAssessmentSections[item._id]
          const activeSection = Number.isInteger(activeSectionIndex) ? stageSections[activeSectionIndex] : null
          return <section key={item._id} id={`phase-assessment-${item._id}`} style={{ border: '1px solid #DCE8E1', borderRadius: 10, padding: 13, background: status === 'finalized' ? '#F2FAF6' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong style={{ color: '#155E48' }}>📊 {item.periodLabel}{item.assessmentMode === 'intensive_nutrition' ? '评估' : '阶段性健康评估'}</strong><span style={{ fontSize: 12, fontWeight: 700, color: status === 'doctor_review' ? '#B45309' : status === 'finalized' ? '#16845B' : '#7C3AED' }}>{statusLabel}</span></div>
            <div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>{PHASE_DOMAINS[item.assessmentDomain] || '历史营养评估'} · {item.templateSnapshot?.name || '模板驱动评估'} · {evidenceCount ? `${evidenceCount}项依据` : '依据待核实'}{['finalized', 'approved'].includes(status) ? ' · 归档位置：服务档案 / 阶段性评估' : ''}</div>
            {['finalized', 'approved'].includes(status) && onNavigate && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 9 }} onClick={() => onNavigate('serviceRecords')}>查看服务档案中的评估记录</button>}
            {status === 'archive_pending' && <div style={{ marginTop: 9, color: '#92400E', fontSize: 13 }}>审核结果已保存，无需重复审核。{canRetryArchive && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'retry_archive')}>重试归档</button>}</div>}
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
              {item.clinicalReview?.reasons?.length > 0 && <div style={{ marginTop: 8, padding: 8, borderRadius: 7, background: '#FFF8ED', color: '#92400E', fontSize: 12 }}>综合复核原因：{item.clinicalReview.reasons.join('；')}</div>}
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
              {item.professionalReview?.reviewedAt && <div style={{ marginTop: 7, fontSize: 12, color: '#65776F' }}>{PHASE_ROLES[primary]}：{item.professionalReview.reviewedByName || '-'} · {item.professionalReview.note || '无补充备注'}</div>}
              {item.doctorReview?.reviewedAt && <div style={{ marginTop: 5, fontSize: 12, color: '#65776F' }}>健康顾问复审：{item.doctorReview.reviewedByName || '-'} · {item.doctorReview.note || '无补充备注'}</div>}
              {canNutritionReview && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'approve')}>专业审核通过</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'escalate')}>转健康顾问复审</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'reject')}>退回AI调整</button></div>}
              {canRegenerate && <div style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'regenerate')}>按退回意见由AI重新生成</button></div>}
              {canDoctorReview && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'approve')}>审核通过并入档</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'return')}>{primary === 'familyDoctor' ? '退回AI调整' : `退回${PHASE_ROLES[primary]}`}</button></div>}
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
        {topics.map(topic => <div key={topic._id} style={{ border: topic._id === active?._id ? '1px solid #1E6B50' : '1px solid #E0D9CE', background: topic._id === active?._id ? '#EEF7F2' : '#fff', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
          <button type="button" onClick={() => setActiveId(value => value === topic._id ? '' : topic._id)} style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', padding: 11, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><span style={{ fontWeight: 700, color: '#1A2B24' }}>{topic.title}</span><span>{topic._id === active?._id ? '收起⌃' : '查看⌄'}</span></div>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 5 }}>{topic.status === 'concluded' ? '已形成确认结论' : `${topic.messages?.length || 0} 条讨论`} · {formatDateTime(topic.updatedAt)}</div>
            <div style={{ fontSize: 12, color: '#4A6558', marginTop: 5 }}>类型：{topicTypeLabel(topic)}</div>
          </button>
          {!topic.annualPlanYear && <div style={{ display: 'flex', gap: 6, padding: '0 10px 9px' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => openTopicEdit(topic)}>编辑</button><button type="button" className="btn btn-secondary btn-sm" style={{ color: '#B42318' }} onClick={() => deleteTopic(topic)}>删除</button></div>}
        </div>)}
      </div>
    </div>

    {active ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card"><div className="card-body" style={{ padding: headerExpanded ? 14 : '10px 14px' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{active.title}</div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', color: '#65776F', fontSize: 12, marginTop: 5 }}><span style={{ background: '#E8F4EE', color: '#176347', borderRadius: 12, padding: '2px 8px' }}>{topicTypeLabel(active)}</span><span>创建：{formatDateTime(active.createdAt)}</span><span>更新：{formatDateTime(active.updatedAt)}</span><span>参与人员：{participantNames.join('、') || '待记录'}</span></div></div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHeaderExpanded(value => !value)}>{headerExpanded ? '收起主题资料' : '展开主题资料'}</button>
        </div>
        {['familyDoctor','superadmin'].includes(staff?.role) && <ReviewPlanAmendment key={active._id} patientId={patientId} topicId={active._id} scope="topic" />}
        {headerExpanded && <>
        <div style={{ color: '#4A6558', fontSize: 13, marginTop: 9 }}>{active.description || '围绕该问题持续讨论，资料和结论均保存在客户专项资料库。'}</div>
        <div style={{ color: '#4A6558', fontSize: 12, marginTop: 7 }}>参与人员：{participantNames.join('、') || '待记录'} · 当前模型：{PROVIDER_LABEL}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCOPES.map(([key, label]) => {
          const checked = active.contextScopes?.includes(key)
          return <label key={key} style={{ fontSize: 12, border: `1px solid ${checked ? '#1E6B50' : '#D8E1DC'}`, color: checked ? '#1E6B50' : '#65776F', borderRadius: 16, padding: '5px 9px', cursor: active.annualPlanYear ? 'default' : 'pointer' }}><input type="checkbox" checked={checked} disabled={!!active.annualPlanYear} onChange={() => updateScopes(checked ? active.contextScopes.filter(v => v !== key) : [...active.contextScopes, key])} style={{ marginRight: 5 }} />{label}</label>
        })}</div>
        {!active.annualPlanYear && <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #E5ECE8' }}><div style={{ fontSize: 12, color: '#65776F', marginBottom: 7 }}>套用研判模板（可用于当前主题）</div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{reviewTemplates.map(item => <button key={item.key} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => applyReviewTemplate(item.key)}>{item.label}</button>)}</div></div>}
        </>}
      </div></div>

      <div className="card" style={{ flex: 1 }}><div ref={chatRef} className="card-body" style={{ height: 'clamp(560px, 66vh, 780px)', overflowY: 'auto', background: '#F7F8F6', padding: 16 }}>
        {!active.messages?.length && <div style={{ color: '#65776F', textAlign: 'center', paddingTop: 100 }}>尚未开始研判。{['annual', 'checkup'].includes(active.reviewType) && active.contextScopes?.includes('reports') && <div style={{ marginTop: 16 }}><button className="btn btn-primary" disabled={busy} onClick={startAutomaticReview}>从最近一次体检报告开始AI研判</button></div>}</div>}
        {(active.messages || []).map(message => <div key={message._id} style={{ display: 'flex', justifyContent: message.role === 'staff' ? 'flex-end' : 'flex-start', marginBottom: 14 }}><div style={{ maxWidth: '82%', background: message.role === 'staff' ? '#DDF2E7' : '#fff', border: '1px solid #DCE5E0', borderRadius: 12, padding: '10px 13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: '#8AA89C', marginBottom: 5 }}><span>{message.role === 'ai' ? `AI助手 · ${message.provider || ''}${message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)}秒` : ''}` : `${message.staffName} · ${message.staffRole}`} · {formatDateTime(message.createdAt)}</span><span>{message.role === 'staff' && <button type="button" onClick={() => editMessage(message)} style={{ border: 0, background: 'none', color: '#1E6B50', cursor: 'pointer' }}>编辑</button>}<button type="button" onClick={() => deleteMessage(message)} style={{ border: 0, background: 'none', color: '#B42318', cursor: 'pointer' }}>删除</button></span></div>
          <CleanText>{message.content}</CleanText>
          {!!message.attachments?.length && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>{message.attachments.map((file, index) => <a key={index} href={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} target="_blank" rel="noreferrer"><img src={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} alt={file.name || '附件'} style={{ width: 90, height: 72, objectFit: 'cover', borderRadius: 6 }} /></a>)}</div>}
          {!!message.contextSnapshot?.sources?.length && <details style={{ marginTop: 8, fontSize: 12, color: '#4A6558' }}><summary>本轮依据 {message.contextSnapshot.sources.length} 项资料</summary><div style={{ marginTop: 5 }}>{message.contextSnapshot.sources.map((s, i) => <div key={i}>· {s}</div>)}</div></details>}
          {message.role === 'ai' && ['familyDoctor','superadmin'].includes(staff?.role) && <ReviewPlanAmendment patientId={patientId} topicId={active._id} message={message} />}
        </div></div>)}
      </div></div>

      <div className="card"><div className="card-body" style={{ padding: 12 }}>
        {!!files.length && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{files.map((file, index) => <span key={index} style={{ fontSize: 12, background: '#EEF7F2', padding: '5px 8px', borderRadius: 6 }}>{file.name}<button onClick={() => setFiles(list => list.filter((_, i) => i !== index))} style={{ border: 0, background: 'none', cursor: 'pointer' }}>×</button></span>)}</div>}
        {active.generation?.status === 'running' && <div role="status" style={{ color: '#1E6B50', marginBottom: 8 }}>提问已保存，AI正在回复，结果会自动显示，无需重复发送。</div>}
        {(active.generation?.status === 'failed' || sendStalled) && <div role="alert" style={{ color: '#B42318', marginBottom: 8 }}>提问已保存，{sendStalled ? 'AI回复等待时间过长，可重试原消息' : `但AI回复失败：${active.generation.error || '请稍后重试'}`}。{(() => {
          const message = active.messages?.find(item => item.role === 'staff' && item.requestId === active.generation.requestId)
          return message && String(message.staff) === String(staff?._id) && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send(message)}>重试AI回复</button>
        })()}</div>}
        {sendNotice?.topicId === active._id && <div role="alert" style={{ color: '#B42318', marginBottom: 8 }}>{sendNotice.text}</div>}
        <textarea className="form-input" rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="补充本轮新信息或修订意见，AI将只分析新增变化，不再从头重复…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); send() } }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>添加图片<input type="file" accept="image/*" multiple hidden disabled={busy} onChange={uploadSelected} /></label><button className="btn btn-primary btn-sm" disabled={busy || active.generation?.status === 'running' || (!draft.trim() && !files.length)} onClick={() => send()}>{busy ? '处理中…' : active.generation?.status === 'running' ? 'AI回复中…' : '发送给AI'}</button></div>
      </div></div>

      {!!active.messages?.length && <div className="card"><div className="card-header"><div className="card-title">阶段性结论（当前有效信息）</div><button className="btn btn-secondary btn-sm" disabled={busy} onClick={generateConclusion}>AI整理结论</button></div><div className="card-body">
        <StructuredAssessment data={active.conclusion?.structured} />
        <textarea className="form-input" rows={10} value={conclusionText} onChange={e => setConclusionText(e.target.value)} placeholder="AI整理后由健康顾问复核确认；只有已确认结论会进入管理方案上下文。" />
        {!isStageAssessmentTopic && <div style={{ marginTop: 14, padding: 12, background: '#F4F8F5', borderRadius: 8 }}>
          <div style={{ fontWeight: 700 }}>管理目标与干预重点</div>
          <div style={{ fontSize: 12, color: '#62776A', margin: '4px 0 10px' }}>逐条确认后带入年度方案；勾选“营养相关”的条目也会带给营养师。数值尚未核实时可写方向，由对应专业人员核实基线和阶段目标。</div>
          {active.conclusion?.targetChangeNote && <div style={{ fontSize: 12, color: '#52685D', marginBottom: 8 }}>本版调整说明：{active.conclusion.targetChangeNote}</div>}
          {managementTargets.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'start', marginBottom: 8 }}>
            <input className="form-input" value={row.goal || ''} onChange={e => setManagementTargets(items => items.map((item, i) => i === index ? { ...item, goal: e.target.value } : item))} placeholder="管理目标，如控制体重或改善空腹血糖" />
            <input className="form-input" value={row.focus || ''} onChange={e => setManagementTargets(items => items.map((item, i) => i === index ? { ...item, focus: e.target.value } : item))} placeholder="干预重点，如膳食结构与运动" />
            <label style={{ whiteSpace: 'nowrap', paddingTop: 8 }}><input type="checkbox" checked={row.nutritionRelevant === true} onChange={e => setManagementTargets(items => items.map((item, i) => i === index ? { ...item, nutritionRelevant: e.target.checked } : item))} /> 营养相关</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManagementTargets(items => items.filter((_, i) => i !== index))}>删除</button>
          </div>)}
          <button type="button" className="btn btn-secondary btn-sm" disabled={managementTargets.length >= 12} onClick={() => setManagementTargets(items => [...items, { goal: '', focus: '', nutritionRelevant: false }])}>添加目标</button>
          {active.conclusion?.status === 'confirmed' && <div style={{ marginTop: 10 }}><label className="form-label">与客户沟通后的目标调整说明</label><textarea className="form-input" rows={2} maxLength={500} value={targetChangeNote} onChange={e => setTargetChangeNote(e.target.value)} placeholder="修改已确认目标时填写；系统保留上一版目标" /></div>}
          {!!active.conclusionHistory?.length && <details style={{ marginTop: 10, color: '#52685D', fontSize: 12 }}><summary>查看历史确认目标（{active.conclusionHistory.length}版）</summary>{active.conclusionHistory.slice().reverse().map((version, index) => <div key={index} style={{ borderTop: '1px solid #DCE8E1', paddingTop: 8, marginTop: 8 }}><div>{formatDateTime(version.confirmedAt)} · {version.confirmedByName || '健康顾问'}</div>{(version.managementTargets || []).map((row, rowIndex) => <div key={rowIndex}>{rowIndex + 1}. {row.goal}；干预重点：{row.focus}</div>)}{version.targetChangeNote && <div>调整说明：{version.targetChangeNote}</div>}</div>)}</details>}
        </div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><span style={{ fontSize: 12, color: active.conclusion?.status === 'confirmed' ? '#16845B' : '#8AA89C' }}>{isStageAssessmentTopic ? '研判结论仅供参考；正式阶段评估必须使用上方专业审核流程' : active.conclusion?.status === 'confirmed' ? `已由${active.conclusion.confirmedByName || '健康顾问'}确认` : '草稿不会进入任何正式方案'}</span>{!isStageAssessmentTopic && ['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy || !conclusionText.trim()} onClick={confirmConclusion}>{`确认并用于${active.templateSnapshot?.target || '对应方案'}`}</button>}</div>
      </div></div>}
    </div> : <div className="card"><div className="card-body" style={{ padding: 60, textAlign: 'center', color: '#8AA89C' }}>请先新建一个研判主题</div></div>}
    </>}

    {showCreate && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 620 }}><div className="modal-header"><div className="modal-title">新建专项研判主题</div><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div><div className="modal-body">
      <div className="form-group"><label className="form-label">研判主题</label><select className="form-input" defaultValue="" onChange={e => { const item = reviewTemplates.find(v => v.key === e.target.value); if (item) setForm(f => ({ ...f, title: item.title, description: item.outputGuide ? `${item.description}\n\n固定研判输出：${item.outputGuide}` : item.description, reviewType: item.reviewType || 'specialty', templateId: item.key, contextScopes: item.scopes })); else setForm(f => ({ ...f, reviewType: 'custom', templateId: '', title: '', description: '' })) }}>{reviewSettings.allowCustomTopic && <option value="">自定义主题</option>}{!reviewSettings.allowCustomTopic && <option value="">请选择主题</option>}{reviewTemplates.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select><div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>主题及其资料范围、输出结构由 Admin 后台统一设置。</div></div>
      <div className="form-group"><label className="form-label">主题名称</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：近期血压波动原因分析" /></div>
      <div className="form-group"><label className="form-label">问题说明</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">拟管理目标与拟干预重点</label><div style={{ fontSize: 12, color: '#65776F', marginBottom: 8 }}>可先填写研判方向；年度或体检主题也可留空，由AI根据最近一次已审核体检报告提出草稿。资料核实后仍须在结论处逐条确认。</div>
        {(form.managementTargets || []).map((row, index) => <div key={index} style={{ border: '1px solid #E1E9E3', borderRadius: 8, padding: 9, marginBottom: 8 }}>
          <input className="form-input" aria-label={`拟管理目标 ${index + 1}`} value={row.goal || ''} onChange={e => setForm(f => ({ ...f, managementTargets: f.managementTargets.map((item, i) => i === index ? { ...item, goal: e.target.value } : item) }))} placeholder="拟管理目标，如改善空腹血糖" style={{ marginBottom: 7 }} />
          <input className="form-input" aria-label={`拟干预重点 ${index + 1}`} value={row.focus || ''} onChange={e => setForm(f => ({ ...f, managementTargets: f.managementTargets.map((item, i) => i === index ? { ...item, focus: e.target.value } : item) }))} placeholder="拟干预重点，如核实饮食与运动执行情况" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}><label><input type="checkbox" checked={row.nutritionRelevant === true} onChange={e => setForm(f => ({ ...f, managementTargets: f.managementTargets.map((item, i) => i === index ? { ...item, nutritionRelevant: e.target.checked } : item) }))} /> 营养相关</label>{form.managementTargets.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, managementTargets: f.managementTargets.filter((_, i) => i !== index) }))}>删除</button>}</div>
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" disabled={form.managementTargets.length >= 12} onClick={() => setForm(f => ({ ...f, managementTargets: [...f.managementTargets, { goal: '', focus: '', nutritionRelevant: false }] }))}>添加一条</button>
      </div>
      <div className="form-group"><label className="form-label">测试模型</label><div className="form-input" style={{ background: '#F7F8F6', color: '#4A6558' }}>{PROVIDER_LABEL}</div></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={createTopic}>{['annual', 'checkup'].includes(form.reviewType) && form.contextScopes?.includes('reports') ? '创建并开始AI研判' : '创建主题'}</button></div></div></div>}
    {showEdit && active && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 620 }}><div className="modal-header"><div className="modal-title">编辑专项研判主题</div><button className="modal-close" onClick={() => setShowEdit(false)}>×</button></div><div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
      <div style={{ fontSize: 13, color: '#65776F', marginBottom: 12 }}>类型：{topicTypeLabel(active)}{active.templateSnapshot?.name ? ` · 模板：${active.templateSnapshot.name}` : ''}</div>
      <div className="form-group"><label className="form-label">主题名称</label><input className="form-input" value={editForm.title} onChange={e => setEditForm(value => ({ ...value, title: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">问题说明</label><textarea className="form-input" rows={5} value={editForm.description} onChange={e => setEditForm(value => ({ ...value, description: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">研判资料范围</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCOPES.map(([key, label]) => <label key={key} style={{ fontSize: 13 }}><input type="checkbox" checked={editForm.contextScopes.includes(key)} onChange={e => setEditForm(value => ({ ...value, contextScopes: e.target.checked ? [...value.contextScopes, key] : value.contextScopes.filter(item => item !== key) }))} /> {label}</label>)}</div></div>
      <div className="form-group"><label className="form-label">拟管理目标与拟干预重点</label>{active.conclusion?.status === 'confirmed' && <div style={{ fontSize: 12, color: '#65776F', marginBottom: 8 }}>可按客户沟通结果调整。保存后仍为健康顾问确认版，原目标保留在历史记录中。</div>}
        {(editForm.managementTargets || []).map((row, index) => <div key={index} style={{ border: '1px solid #E1E9E3', borderRadius: 8, padding: 9, marginBottom: 8 }}>
          <input className="form-input" aria-label={`编辑拟管理目标 ${index + 1}`} value={row.goal || ''} onChange={e => setEditForm(value => ({ ...value, managementTargets: value.managementTargets.map((item, i) => i === index ? { ...item, goal: e.target.value } : item) }))} placeholder="拟管理目标" style={{ marginBottom: 7 }} />
          <input className="form-input" aria-label={`编辑拟干预重点 ${index + 1}`} value={row.focus || ''} onChange={e => setEditForm(value => ({ ...value, managementTargets: value.managementTargets.map((item, i) => i === index ? { ...item, focus: e.target.value } : item) }))} placeholder="拟干预重点" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}><label><input type="checkbox" checked={row.nutritionRelevant === true} onChange={e => setEditForm(value => ({ ...value, managementTargets: value.managementTargets.map((item, i) => i === index ? { ...item, nutritionRelevant: e.target.checked } : item) }))} /> 营养相关</label>{editForm.managementTargets.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditForm(value => ({ ...value, managementTargets: value.managementTargets.filter((_, i) => i !== index) }))}>删除</button>}</div>
        </div>)}
        <button type="button" className="btn btn-secondary btn-sm" disabled={editForm.managementTargets.length >= 12} onClick={() => setEditForm(value => ({ ...value, managementTargets: [...value.managementTargets, { goal: '', focus: '', nutritionRelevant: false }] }))}>添加一条</button>
        {active.conclusion?.status === 'confirmed' && <div style={{ marginTop: 10 }}><label className="form-label">与客户沟通后的目标调整说明</label><textarea className="form-input" rows={2} maxLength={500} value={editForm.targetChangeNote} onChange={e => setEditForm(value => ({ ...value, targetChangeNote: e.target.value }))} placeholder="修改目标时填写，原确认版会保留" /></div>}
      </div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowEdit(false)}>取消</button><button className="btn btn-primary" disabled={busy || !editForm.title.trim()} onClick={saveTopicEdit}>保存修改</button></div></div></div>}
  </div>
}
