import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI, API_ORIGIN } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const CHECKIN_LABEL = { diet: '饮食', exercise: '运动', sleep: '睡眠', alcohol: '烟酒', weight: '体重', bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率', water: '饮水' }

// ── 生活方式表单子组件（定义在组件外，引用稳定，避免每次渲染重新挂载）─────
const LS_LABEL_STYLE = { fontSize: 12, color: '#8AA89C', marginBottom: 4, display: 'block' }

function LsRadio({ label, value, editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="radio" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value || '-'}</span>
      )}
    </div>
  )
}

function LsCheckbox({ label, value = [], editing, options, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
          {options.map(o => (
            <label key={o} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.includes(o)}
                onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(x => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 13, color: '#1A2B24' }}>{value.length ? value.join('、') : '-'}</span>
      )}
    </div>
  )
}

// 稳定的体检指标输入组件（定义在组件外避免焦点丢失）
function LabField({ label, unit, value, onChange, placeholder, type }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <input className="form-control" type={type || 'text'} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}
function LabTextarea({ label, unit, value, onChange, placeholder }) {
  return (
    <div>
      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
      <textarea className="form-control" rows={2} value={value} placeholder={placeholder || ''} onChange={onChange} style={{ fontSize: 13 }} />
    </div>
  )
}

function LsText({ label, value = '', editing, placeholder, multiline, onChange }) {
  return (
    <div>
      {label && <span style={LS_LABEL_STYLE}>{label}</span>}
      {editing ? (
        multiline
          ? <textarea className="form-control" rows={3} value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} style={{ resize: 'vertical' }} />
          : <input className="form-control" value={value} placeholder={placeholder || ''}
              onChange={e => onChange(e.target.value)} />
      ) : (
        <span style={{ fontSize: 13, color: value ? '#1A2B24' : '#ccc' }}>{value || '-'}</span>
      )}
    </div>
  )
}

// ── 简易 SVG 折线趋势图 ───────────────────────────────────────────
function MiniTrendChart({ data, color = '#1E6B50', label }) {
  if (!data || data.length < 2) return null;
  const W = 260, H = 80, PAD = 8;
  const vals = data.map(d => d.y);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = data.map((_, i) => PAD + (i / (data.length - 1)) * (W - PAD * 2));
  const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const last = data[data.length - 1];
  return (
    <div style={{ display: 'inline-block', marginRight: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <svg width={W} height={H} style={{ border: '1px solid #f0ece4', borderRadius: 8, background: '#faf9f6' }}>
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts} />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r="3" fill={color} />)}
        <text x={xs[xs.length-1]} y={ys[ys.length-1] - 6} textAnchor="middle" fontSize="10" fill={color}>{last.y}</text>
        <text x={PAD} y={H - 2} fontSize="9" fill="#aaa">{data[0].x}</text>
        <text x={W - PAD} y={H - 2} textAnchor="end" fontSize="9" fill="#aaa">{last.x}</text>
      </svg>
    </div>
  );
}

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const SERVICE_PACKAGE_LABELS = {
  health_prevention: '健康预防计划', chronic_stable: '慢病维稳计划',
  young_state: '健康年轻态计划', health_reshape: '健康重塑计划',
  pkg_1y: '年度服务包', pkg_6m: '半年服务包', pkg_3m: '季度服务包',
}
const getServicePackageLabel = (pkg) => SERVICE_PACKAGE_LABELS[pkg] || pkg || '-'
const STATUS_MAP = { completed: '已完成', missed: '未接通', planned: '计划中' }
const STATUS_COLOR = { completed: '#22A06B', missed: '#DC3545', planned: '#D97706' }
const PLAN_TYPE_LABEL = {
  annual_checkup:'年度体检方案', annual_mgmt:'年度管理方案',
  nutrition:'营养干预方案', medical_assist:'就医协助方案',
  tcm:'中医调理方案', rehab:'运动复健方案', psychology:'心理咨询方案',
  checkup:'体检方案', health:'健康管理方案', followup:'随访计划',
}
const PLAN_STATUS_COLOR = { draft:'#aaa', active:'#22A06B', completed:'#0077B6' }
const PLAN_STATUS_LABEL = { draft:'草稿', active:'进行中', completed:'已完成' }
const SR_TYPE_LABEL = {
  nutrition:'营养干预', disease_mgmt:'专病管理', medical_visit:'医院就医', routine:'日常随访',
  medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊',
}
const SR_CATEGORY = {
  nutrition:     '营养干预',
  disease_mgmt:  '专病管理', specialist: '专病管理', psychology: '专病管理', rehab: '专病管理', tcm: '专病管理',
  medical_visit: '医院就医', medical_escort: '医院就医',
  routine:       '日常随访',
}
const SR_CATEGORY_COLOR = { '营养干预':'#22A06B', '专病管理':'#0077B6', '医院就医':'#D97706', '日常随访':'#8A4AC7' }

// ── 开单弹窗 ─────────────────────────────────────────────
function RequisitionModal({ patientId, onClose, onSaved }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const timerRef = React.useRef()

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await staffAPI.getRequisitionItems(q)
      setSearchResults(res.data || [])
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }

  const handleSearchInput = e => {
    const q = e.target.value; setSearchQ(q)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(q), 300)
  }

  const addItem = (item) => {
    if (items.find(i => i.itemId === item._id)) return
    setItems(prev => [...prev, { itemType: item.type, itemId: item._id, itemName: item.name, notes: '' }])
    setSearchQ(''); setSearchResults([])
  }

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItemNotes = (idx, v) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: v } : it))

  const handleSave = async () => {
    if (!items.length) { setError('请至少添加一个检查项目'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createRequisition({ patientId, title: title || '检查开单', notes, items, dueDate: dueDate || null })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">新建检查开单</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">开单标题</label>
              <input className="form-input" placeholder="如：2026年5月体检开单" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">要求完成日期（可选）</label>
              <input className="form-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">整体备注（可选）</label>
              <input className="form-input" placeholder="整体注意事项..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* 搜索添加项目 */}
          <div>
            <label className="form-label">搜索并添加检查项目</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" placeholder="输入名称或助记码搜索..." value={searchQ} onChange={handleSearchInput} />
              {searching && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#aaa' }}>搜索中...</span>}
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                  {searchResults.map(item => (
                    <div key={item._id} onMouseDown={() => addItem(item)} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.type === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.type === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.typeName}</span>
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      {item.mnemonic && <span style={{ color: '#8AA89C', fontSize: 12 }}>{item.mnemonic}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 已选项目列表 */}
          {items.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2B24', marginBottom: 8 }}>已添加 {items.length} 个项目</div>
              {items.map((item, idx) => (
                <div key={idx} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.itemType === 'labTestOrder' ? '#EEF2FF' : '#F0FDF4', color: item.itemType === 'labTestOrder' ? '#4338CA' : '#166534', fontWeight: 600 }}>{item.itemType === 'labTestOrder' ? '检验' : '检查'}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{item.itemName}</span>
                    </div>
                    <input className="form-input" style={{ fontSize: 12 }} placeholder="注意事项（可选，如：空腹抽血）" value={item.notes} onChange={e => updateItemNotes(idx, e.target.value)} />
                  </div>
                  <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#DC3545', fontSize: 18, cursor: 'pointer', lineHeight: 1, flexShrink: 0, marginTop: 2 }}>✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', fontSize: 13, background: '#f9f7f3', borderRadius: 8 }}>
              请搜索并添加需要检查的项目
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !items.length}>
            {saving ? '创建中...' : `创建开单（${items.length} 项）`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')  // info | records | reports | medications | requisitions | plans | followups | serviceRecords | consumption | family | membership
  const [followUps, setFollowUps] = useState([])
  const [plans, setPlans] = useState([])
  const [reports, setReports] = useState([])
  const [serviceRecords, setServiceRecords] = useState([])
  const [patientReferrals, setPatientReferrals] = useState([])
  const [expandedReferralCats, setExpandedReferralCats] = useState({})
  const [patientOrders, setPatientOrders] = useState([])
  const [requisitions, setRequisitions] = useState([])
  const [showReqModal, setShowReqModal] = useState(false)
  const [showReferralModal, setShowReferralModal] = useState(false)
  const [showReportDetail, setShowReportDetail] = useState(null)
  const [reportDetailLoading, setReportDetailLoading] = useState(false)
  const [showSRDetail, setShowSRDetail] = useState(null)
  const [staffList, setStaffList] = useState([])
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpDetail, setFollowUpDetail] = useState(null)
  const [showUploadReport, setShowUploadReport] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editingBasicInfo, setEditingBasicInfo] = useState(false)
  const [basicInfoForm, setBasicInfoForm] = useState({})
  const [editingHealthNeeds, setEditingHealthNeeds] = useState(false)
  const [healthNeedsForm, setHealthNeedsForm] = useState({})
  const [editingTitleReportId, setEditingTitleReportId] = useState(null)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const [editingHealth, setEditingHealth] = useState(false)
  const [editingLifestyle, setEditingLifestyle] = useState(false)
  const [editingInsurance, setEditingInsurance] = useState(false)
  const [healthForm, setHealthForm] = useState({})
  const [lifestyleForm, setLifestyleForm] = useState({})
  const [insuranceForm, setInsuranceForm] = useState({})
  // 药物 & 营养素
  const [medications, setMedications] = useState([])
  const [supplements, setSupplements] = useState([])
  const [medSubTab, setMedSubTab] = useState('med') // 'med' | 'sup'
  const [showMedModal, setShowMedModal] = useState(false)
  const [showSupModal, setShowSupModal] = useState(false)
  const [editingMed, setEditingMed] = useState(null)
  const [editingSup, setEditingSup] = useState(null)
  const [medForm, setMedForm] = useState({})
  const [supForm, setSupForm] = useState({})
  const [medSaving, setMedSaving] = useState(false)
  // 专项筛查三层目录（动态加载）
  const [screeningTree, setScreeningTree] = useState([])
  // 专项筛查 L1/L2 横向 tab 激活状态
  const [screeningActiveL1, setScreeningActiveL1] = useState(null)  // l1key 或 '__other__'
  const [screeningActiveL2s, setScreeningActiveL2s] = useState({})
  // 专项筛查 & 打卡记录
  const [screeningItems, setScreeningItems] = useState([])
  const [screeningReports, setScreeningReports] = useState([])
  const [showScreeningForm, setShowScreeningForm] = useState(false)
  const [screeningForm, setScreeningForm] = useState({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
  const [screeningFiles, setScreeningFiles] = useState([])
  const [screeningSaving, setScreeningSaving] = useState(false)
  const [screeningSearchQ, setScreeningSearchQ] = useState('')
  const [screeningSearchResults, setScreeningSearchResults] = useState([])
  const [screeningSearching, setScreeningSearching] = useState(false)
  const [screeningAutoMatches, setScreeningAutoMatches] = useState([])  // L3选完后自动匹配的后台项目
  const [screeningSuggestKey, setScreeningSuggestKey] = useState(null) // 'lab-0' | 'exam-1' | 'func-2'
  const screeningL2SuggestData = useMemo(() => {
    if (!screeningForm.screeningL1 || !screeningForm.screeningL2) return null
    const l1 = screeningTree.find(n => String(n._id) === screeningForm.screeningL1)
    const l2 = l1?.children?.find(c => c.label === screeningForm.screeningL2)
    return {
      labOrders: (l2?.labOrders || []).map(o => typeof o === 'string' ? { name: o, subItems: [] } : o),
      examItems: (l2?.examItems || []).map(x => typeof x === 'string' ? { name: x, description: '', conclusion: '' } : x),
      funcItems: (l2?.funcItems || []).filter(Boolean)
    }
  }, [screeningTree, screeningForm.screeningL1, screeningForm.screeningL2])
  const [screeningAutoLoading, setScreeningAutoLoading] = useState(false)
  const [screeningLinkedItem, setScreeningLinkedItem] = useState(null)  // 已关联的后台项目
  const [expandedRecord, setExpandedRecord] = useState(null) // 展开详情的记录 _id
  const [expandedExamKey, setExpandedExamKey] = useState(null) // 展开的检查医嘱子项 key
  const [editingScreeningId, setEditingScreeningId] = useState(null) // 编辑中的记录 _id
  const [previewImageUrl, setPreviewImageUrl] = useState(null) // 灯箱预览
  const screeningSearchTimer = useRef(null)
  const [healthRecords, setHealthRecords] = useState([])
  // 趋势图
  const [trendRecords, setTrendRecords] = useState(null) // null=未加载，[]+=已加载
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendStartDate, setTrendStartDate] = useState('')
  const [trendEndDate, setTrendEndDate] = useState('')
  const [showAllLab, setShowAllLab] = useState(false)
  // 健康评分
  const [scoreLoading, setScoreLoading] = useState(false)
  const [editingLabValues, setEditingLabValues] = useState(false)
  const [labNewRecord, setLabNewRecord] = useState(false) // true=新增记录 false=编辑当前
  const [labForm, setLabForm] = useState({})
  const [editingDiseaseSeverity, setEditingDiseaseSeverity] = useState(false)
  const [severityForm, setSeverityForm] = useState({})
  // 4.2 身体成分
  const [editingBodyComp, setEditingBodyComp] = useState(false)
  const [bodyCompNewRecord, setBodyCompNewRecord] = useState(false)
  const [bodyCompForm, setBodyCompForm] = useState({})
  const [editingHistoryIndex, setEditingHistoryIndex] = useState(null)
  const [historyEditForm, setHistoryEditForm] = useState({})
  // 4.4 AI健康汇总
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [editingAISummary, setEditingAISummary] = useState(false)
  const [aiSummaryForm, setAiSummaryForm] = useState({})

  const load = async () => {
    try {
      const [res, scrRes] = await Promise.allSettled([
        staffAPI.getPatient(id),
        staffAPI.getScreeningReports(id),
      ])
      if (res.status === 'fulfilled') {
        setData(res.value.data)
        setEditForm(buildEditForm(res.value.data.user))
        setBasicInfoForm(buildBasicInfoForm(res.value.data.user))
        setHealthNeedsForm(buildHealthNeedsForm(res.value.data.user))
        setHealthForm(buildHealthForm(res.value.data.user))
        setLifestyleForm(buildLifestyleForm(res.value.data.user))
        setInsuranceForm(buildInsuranceForm(res.value.data.user))
        setLabForm(res.value.data.user.labValues || {})
        setSeverityForm(res.value.data.user.chronicDiseaseSeverity || {})
        setBodyCompForm(res.value.data.user.bodyComposition || {})
        setAiSummaryForm(res.value.data.user.aiHealthSummary || {})
      } else {
        throw res.reason
      }
      if (scrRes.status === 'fulfilled') setScreeningReports(scrRes.value.data || [])
    } catch (err) {
      toast(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFollowUps = async () => {
    try {
      const res = await staffAPI.getPatientFollowUps(id)
      setFollowUps(res.data.followUps)
    } catch {}
  }

  const loadPlans = async () => {
    try { const res = await staffAPI.getPatientPlans(id); setPlans(res.data) } catch {}
  }
  const loadReports = async () => {
    try { const res = await staffAPI.getPatientReports(id); setReports(res.data) } catch {}
  }
  const loadServiceRecords = async () => {
    try { const res = await staffAPI.getPatientServiceRecords(id); setServiceRecords(res.data) } catch {}
  }
  const loadPatientReferrals = async () => {
    try { const res = await staffAPI.getPatientReferrals(id); setPatientReferrals(res.data?.referrals || []) } catch {}
  }
  const loadRequisitions = async () => {
    try { const res = await staffAPI.getPatientRequisitions(id); setRequisitions(res.data) } catch {}
  }
  const loadMedications = async () => {
    try { const r = await staffAPI.getPatientMedications(id); setMedications(r.data || []) } catch {}
  }
  const loadSupplements = async () => {
    try { const r = await staffAPI.getPatientSupplements(id); setSupplements(r.data || []) } catch {}
  }
  const loadScreening = async () => {
    try {
      const [sr, hr, scr, tree] = await Promise.allSettled([
        staffAPI.getPatientScreening(id),
        staffAPI.getPatientHealthRecords(id, { limit: 30 }),
        staffAPI.getScreeningReports(id),
        staffAPI.getScreeningTree(),
      ])
      if (sr.status === 'fulfilled') setScreeningItems(sr.value.data || [])
      if (hr.status === 'fulfilled') setHealthRecords(hr.value.data || [])
      if (scr.status === 'fulfilled') setScreeningReports(scr.value.data || [])
      if (tree.status === 'fulfilled') setScreeningTree(tree.value.data || [])
    } catch {}
  }

  const [reportScreeningData, setReportScreeningData] = useState([])

  const openReportDetail = (r) => {
    // 立即显示弹窗（用列表里已有的数据）
    setShowReportDetail(r)
    setReportScreeningData([])
    setReportDetailLoading(true)

    // 背景异步：拉完整报告详情
    staffAPI.getReport(r._id)
      .then(res => setShowReportDetail(res.data))
      .catch(() => { /* 保持列表数据，下方会显示加载失败提示 */ })
      .finally(() => setReportDetailLoading(false))

    // 背景异步：拉专项筛查匹配数据（不阻塞弹窗）
    const reportTitle = r.title || ''
    const reportDate  = r.checkDate || r.date || ''
    staffAPI.getScreeningReports(id)
      .then(res => {
        const all = res.data || []
        const matched = all.filter(s => {
          const l2 = s.screeningL2 || s.title || ''
          const l2Match = l2 === reportTitle || l2.includes(reportTitle) || reportTitle.includes(l2)
          if (!l2Match) return false
          if (!reportDate || !s.checkDate) return true
          return Math.abs(new Date(reportDate) - new Date(s.checkDate)) / 86400000 <= 30
        })
        setReportScreeningData(matched)
      })
      .catch(() => {})
  }
  useEffect(() => { load() }, [id])
  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
  }, [])
  useEffect(() => {
    if (tab === 'followups') loadFollowUps()
    else if (tab === 'plans') loadPlans()
    else if (tab === 'reports') {
      loadReports()
      // 体检报告排序也需要 screeningTree，按需加载
      if (screeningTree.length === 0) {
        staffAPI.getScreeningTree().then(r => setScreeningTree(r.data || [])).catch(() => {})
      }
    }
    else if (tab === 'serviceRecords') loadServiceRecords()
    else if (tab === 'referrals') loadPatientReferrals()
    else if (tab === 'requisitions') loadRequisitions()
    else if (tab === 'medications') { loadMedications(); loadSupplements() }
    else if (tab === 'records') loadScreening()
    else if (tab === 'consumption') staffAPI.getPatientOrders(id).then(r => setPatientOrders(r.data || [])).catch(() => {})
  }, [tab])

  const buildEditForm = (u) => ({
    chronicDiseases: u.chronicDiseases || [],
    memberType: u.memberType || '',
    patientType: u.patientType || '',
    source: u.source || '',
    remark: u.remark || '',
    contactPhone2: u.contactPhone2 || '',
    contactName: u.contactName || '',
    deliveryAddress: u.deliveryAddress || '',
    assignedHealthManager:    u.assignedHealthManager?._id    || '',
    assignedFamilyDoctor:     u.assignedFamilyDoctor?._id     || '',
    assignedNutritionist:     u.assignedNutritionist?._id     || '',
    assignedSpecialist:       u.assignedSpecialist?._id       || '',
    assignedTcmDoctor:        u.assignedTcmDoctor?._id        || '',
    assignedPsychologist:     u.assignedPsychologist?._id     || '',
    assignedRehabSpecialist:  u.assignedRehabSpecialist?._id  || '',
    assignedMedicalAssistant: u.assignedMedicalAssistant?._id || '',
    servicePackage: u.servicePackage || '',
    serviceExpiry: u.serviceExpiry || '',
    serviceStartDate: u.serviceStartDate || '',
  })

  const buildBasicInfoForm = (u) => ({
    name: u.name || '',
    gender: u.gender || '未知',
    birthDate: u.birthDate || '',
    idNumber: u.idNumber || '',
    maritalStatus: u.maritalStatus || '',
    ethnicity: u.ethnicity || '',
    workplace: u.workplace || '',
    occupation: u.occupation || '',
    education: u.education || '',
    hasAnnualCheckup: u.hasAnnualCheckup || '',
    height: u.height || '',
    weight: u.weight || '',
    address: u.address || '',
    contactPhone: u.contactPhone || '',
  })

  const handleSaveBasicInfo = async () => {
    try {
      await staffAPI.updatePatient(id, basicInfoForm)
      toast('基本信息已保存')
      setEditingBasicInfo(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveHealthNeeds = async () => {
    try {
      await staffAPI.updatePatient(id, healthNeedsForm)
      toast('健康需求已保存')
      setEditingHealthNeeds(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const buildHealthForm = (u) => ({
    bloodTypeABO: u.bloodTypeABO || '',
    bloodTypeRH: u.bloodTypeRH || '',
    traumaHistory: u.traumaHistory || '',
    transfusionHistory: u.transfusionHistory || '',
    poisoningHistory: u.poisoningHistory || '',
    infectiousHistory: u.infectiousHistory || '',
    vaccinationHistory: u.vaccinationHistory || '',
    otherDiseaseHistory: u.otherDiseaseHistory || '',
    healthProfile: {
      drugAllergy: u.healthProfile?.drugAllergy || '',
      foodAllergy: u.healthProfile?.foodAllergy || '',
      pastHistory: u.healthProfile?.pastHistory || '',
      medicHistory: u.healthProfile?.medicHistory || '',
      surgeryHistory: u.healthProfile?.surgeryHistory || '',
      menstrualHistory: u.healthProfile?.menstrualHistory || '',
      maritalHistory: u.healthProfile?.maritalHistory || '',
      sexualHistory: u.healthProfile?.sexualHistory || '',
      familyHistoryNote: u.healthProfile?.familyHistoryNote || '',
      supplementHistory: u.healthProfile?.supplementHistory || '',
      recentSymptoms: u.healthProfile?.recentSymptoms || [],
      recentMedication: u.healthProfile?.recentMedication || '',
      recentSupplement: u.healthProfile?.recentSupplement || '',
    },
  })

  const buildHealthNeedsForm = (u) => ({
    healthConcern: u.healthConcern || '',
    healthConcernFor: u.healthConcernFor || '',
    expectedService: u.expectedService || '',
    hasHomeMonitor: u.hasHomeMonitor || '',
    hasMedicineCabinet: u.hasMedicineCabinet || '',
  })

  const buildLifestyleForm = (u) => ({
    lifestyle: {
      diet: u.lifestyle?.diet || '',
      exercise: u.lifestyle?.exercise || '',
      sleep: u.lifestyle?.sleep || '',
      water: u.lifestyle?.water || '',
      alcohol: u.lifestyle?.alcohol || '',
      smoking: u.lifestyle?.smoking || '',
      bowel: u.lifestyle?.bowel || '',
      mood: u.lifestyle?.mood || '',
    },
    lifestyle_data: u.lifestyle_data || {},
  })

  // 生活方式：自动生成综合概述
  const buildLifestyleSummary = (d) => {
    const flags = []
    // 三餐：少吃或不吃
    const meals = ['breakfast', 'lunch', 'dinner']
    const missedMeals = meals.filter(m => d[`${m}Detail`] === '少吃' || d[`${m}Detail`] === '不吃')
    if (missedMeals.length > 0) flags.push('三餐不规律或经常少吃/不吃某一餐')
    // 能量摄入不足/节食：有2餐及以上少吃或不吃
    const severelyMissed = meals.filter(m => d[`${m}Detail`] === '不吃')
    const lightMissed = meals.filter(m => d[`${m}Detail`] === '少吃')
    if (severelyMissed.length >= 1 || lightMissed.length >= 2) flags.push('每日摄入能量不足/节食')
    // 外卖/外食频率高：应酬≥3次/周，或三餐中≥2餐为外卖/饭店
    const eatOutMeals = meals.filter(m => d[`${m}Detail`] === '外卖' || d[`${m}Detail`] === '饭店或外卖')
    const highEntertainment = d.entertainment === '3-5次/周' || d.entertainment === '6-7次/周'
    if (eatOutMeals.length >= 2 || highEntertainment) flags.push('外卖/外食频率高（每周≥5次）')
    // 饮水不足
    if (d.dailyWater === '1500毫升内') flags.push('饮水量不足（＜1500毫升/天）')
    // 蔬菜摄入不足
    if (d.dailyVegetables && (d.dailyVegetables === '300克以内' || d.dailyVegetables === '几乎不吃')) {
      flags.push('蔬菜、水果、粗杂粮、奶制品摄入不足')
    }
    // 主食过多
    if (d.dailyStaple === '400克以上') flags.push('精制主食摄入过多')
    // 不良饮食习惯
    const badHabits = d.badDietHabits || []
    if (badHabits.length > 0) flags.push('存在不良饮食习惯（油炸、甜品、腌制、重油、偏咸、夜宵等）')
    // 作息/运动
    if (d.scheduleRegularity === '不规律' || d.exerciseFrequency === '无') flags.push('作息不规律或运动不足')
    // 过敏/忌口
    const hasAllergy = (d.foodAllergens || []).some(a => a !== '无') || d.dietaryRestrictions === '有'
    if (hasAllergy) flags.push('有食物过敏、忌口或营养干预史')
    if (d.nutritionHistory && d.nutritionHistory.trim()) flags.push('有食物过敏、忌口或营养干预史')
    // 排便
    if (d.bowelRegularity === '便秘/腹泻') flags.push('排便不规律或便秘')
    else if (d.bowelRegularity === '偶尔不规律') flags.push('排便偶有不规律')
    // 心理压力
    if (d.psychStress && d.psychStress !== '正常') flags.push('存在心理压力或情绪问题')
    return [...new Set(flags)]
  }

  // 生活方式：活动标签页
  const [lifestyleTab, setLifestyleTab] = useState('diet')

  const buildInsuranceForm = (u) => ({
    basic_insurance: u.basic_insurance || '',
    commercial_medical: u.commercial_medical || '',
    critical_illness: u.critical_illness || '',
  })

  const handleSave = async () => {
    try {
      await staffAPI.updatePatient(id, editForm)
      toast('保存成功')
      setEditing(false)
      load()
    } catch (err) {
      toast(err.message || '保存失败')
    }
  }

  const handleSaveInsurance = async () => {
    try {
      await staffAPI.updatePatient(id, {
        basic_insurance: insuranceForm.basic_insurance,
        commercial_medical: insuranceForm.commercial_medical,
        critical_illness: insuranceForm.critical_illness,
      })
      toast('医疗保障信息已保存')
      setEditingInsurance(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveHealth = async () => {
    try {
      await staffAPI.updatePatient(id, healthForm)
      toast('健康档案已保存')
      setEditingHealth(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLifestyle = async () => {
    try {
      const d = lifestyleForm.lifestyle_data || {}
      if (!d.summaryOverride) {
        const flags = buildLifestyleSummary(d)
        lifestyleForm.lifestyle_data = { ...d, autoSummaryFlags: flags }
      }
      await staffAPI.updatePatient(id, lifestyleForm)
      await staffAPI.recalculateScore(id)
      toast('生活方式已保存，评分已更新')
      setEditingLifestyle(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveLabValues = async () => {
    try {
      const payload = { labValues: labForm }
      if (labNewRecord) payload._addLabHistory = true
      await staffAPI.updatePatient(id, payload)
      await staffAPI.recalculateScore(id)
      toast(labNewRecord ? '新增体检记录已保存，评分已更新' : '体检指标已保存，评分已更新')
      setEditingLabValues(false)
      setLabNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  const handleSaveDiseaseSeverity = async () => {
    try {
      await staffAPI.updatePatient(id, { chronicDiseaseSeverity: severityForm })
      await staffAPI.recalculateScore(id)
      toast('慢病分级已保存，评分已更新')
      setEditingDiseaseSeverity(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 3.1 档案审核
  const handleArchiveReview = async () => {
    try {
      await staffAPI.archiveReview(id, 'approve')
      toast('档案已审核确认')
      load()
    } catch (err) { toast(err.message || '审核失败') }
  }

  // 4.2 身体成分
  const handleSaveBodyComp = async () => {
    try {
      const payload = { bodyComposition: bodyCompForm }
      if (bodyCompNewRecord) payload._addBodyCompHistory = true
      await staffAPI.updatePatient(id, payload)
      toast(bodyCompNewRecord ? '新增身体成分记录已保存' : '身体成分数据已保存')
      setEditingBodyComp(false)
      setBodyCompNewRecord(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.4 AI汇总
  const handleGenerateAISummary = async () => {
    try {
      setAiSummaryLoading(true)
      const res = await staffAPI.generateAIHealthSummary(id)
      setAiSummaryForm(res.data)
      toast('AI分析已生成')
      load()
    } catch (err) { toast(err.message || 'AI生成失败，请确认 ANTHROPIC_API_KEY 已配置') }
    finally { setAiSummaryLoading(false) }
  }

  const handleSaveAISummary = async (approve = false) => {
    try {
      const payload = { ...aiSummaryForm, ...(approve ? { action: 'approve' } : {}) }
      await staffAPI.updateAIHealthSummary(id, payload)
      toast(approve ? '分析报告已审核确认' : '分析报告已保存')
      setEditingAISummary(false)
      load()
    } catch (err) { toast(err.message || '保存失败') }
  }

  // 4.3 录入筛查结果
  const handleSaveScreeningRecord = async () => {
    if (!screeningForm.screeningL1) return toast('请选择筛查大类')
    if (!screeningForm.screeningL2) return toast('请选择具体分类')
    try {
      setScreeningSaving(true)
      // 编译三类项目到后端字段
      // 把检验医嘱（含子项目）打平为 reportItems
      const flatLabItems = (screeningForm.reportItems || []).flatMap(order =>
        order.subItems && order.subItems.length > 0
          ? order.subItems.map(sub => ({ name: sub.name, value: sub.value || '', unit: sub.unit || '', referenceRange: sub.referenceRange || '', status: sub.status || 'normal', orderName: order.name }))
          : [{ name: order.name, value: order.value || '', unit: order.unit || '', referenceRange: order.referenceRange || '', status: order.status || 'normal', orderName: '' }]
      )
      const funcAsReportItems = (screeningForm.funcTestItems || []).map(f => ({ name: f.name, value: f.result || '', unit: '', referenceRange: '', status: 'unknown', itemType: 'data' }))
      const allReportItems = [...flatLabItems, ...funcAsReportItems]
      const examDesc = (screeningForm.examOrderItems || []).map(e => { if (!e.name) return ''; return e.description ? `【${e.name}】\n${e.description}` : `【${e.name}】` }).filter(Boolean).join('\n\n') || screeningForm.examDescription || ''
      const examConc = (screeningForm.examOrderItems || []).map(e => { if (!e.name) return ''; return e.conclusion ? `【${e.name}】\n${e.conclusion}` : `【${e.name}】` }).filter(Boolean).join('\n\n') || screeningForm.examConclusion || ''
      const allL3Names = [...(screeningForm.reportItems || []).map(r => r.name), ...(screeningForm.examOrderItems || []).map(e => e.name), ...(screeningForm.funcTestItems || []).map(f => f.name)].filter(Boolean)
      const payload = { ...screeningForm, reportItems: allReportItems, examDescription: examDesc, examConclusion: examConc, screeningL3Items: allL3Names }
      if (editingScreeningId) {
        await staffAPI.updateScreeningRecord(id, editingScreeningId, payload, screeningFiles)
        toast('筛查结果已更新')
      } else {
        await staffAPI.createScreeningRecord(id, payload, screeningFiles)
        toast('筛查结果已录入')
      }
      setShowScreeningForm(false)
      setEditingScreeningId(null)
      setScreeningForm({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
      setScreeningFiles([])
      setScreeningLinkedItem(null)
      setScreeningAutoMatches([])
      loadScreening()
    } catch (err) { toast(err.message || '录入失败') }
    finally { setScreeningSaving(false) }
  }

  const handleRecalculateScore = async () => {
    try {
      setScoreLoading(true)
      await staffAPI.recalculateScore(id)
      toast('健康评分已重新计算')
      load()
    } catch (err) {
      toast(err.message || '计算失败')
    } finally {
      setScoreLoading(false)
    }
  }

  const handleFollowUpCreated = () => {
    setShowFollowUpModal(false)
    toast('随访记录已保存')
    loadFollowUps()
    load()
  }

  const handleAudit = async (action) => {
    try {
      setAuditLoading(true)
      await staffAPI.auditReport(showReportDetail._id, { action, rejectReason })
      toast(action === 'approve' ? '已审核通过' : '已驳回')
      setShowReportDetail(null)
      setRejectReason('')
      setShowRejectInput(false)
      loadReports()
    } catch (err) {
      toast(err.message || '操作失败')
    } finally {
      setAuditLoading(false)
    }
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!data) return <div className="page">会员不存在</div>

  const { user, recentFollowUps, recentRecords } = data
  const age = user.age ? `${user.age}岁` : '-'
  const bmi = user.height && user.weight
    ? (user.weight / Math.pow(user.height / 100, 2)).toFixed(1)
    : null

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/patients')}>← 返回</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {user.name}
              {user.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>VIP</span>}
            </h1>
            <p className="page-subtitle">{user.phone} · {user.gender} · {age}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowReferralModal(true)}>🔀 转介</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMessageModal(true)}>💬 发消息</button>
        </div>
      </div>

      {/* 慢病标签 */}
      {user.chronicDiseases?.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.chronicDiseases.map(d => (
            <span key={d} className="badge badge-danger">{d}</span>
          ))}
        </div>
      )}

      {/* 服务效期提示 */}
      {user.serviceExpiry && (() => {
        const left = Math.ceil((new Date(user.serviceExpiry) - new Date()) / (1000 * 60 * 60 * 24))
        if (left > 30) return null
        const color = left <= 0 ? '#DC3545' : left <= 7 ? '#DC3545' : '#D97706'
        const bg = left <= 0 ? '#FEF2F2' : left <= 7 ? '#FEF2F2' : '#FFFBEB'
        return (
          <div style={{ marginBottom: 12, padding: '10px 16px', background: bg, borderRadius: 8, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{left <= 0 ? '🔴' : '⏰'}</span>
            <div>
              <span style={{ color, fontWeight: 600, fontSize: 14 }}>
                {left <= 0 ? '会员服务已到期' : `会员服务还剩 ${left} 天到期`}
              </span>
              <span style={{ color: '#666', fontSize: 13, marginLeft: 10 }}>
                {getServicePackageLabel(user.servicePackage)} · 到期：{new Date(user.serviceExpiry).toLocaleDateString('zh-CN')}
              </span>
            </div>
          </div>
        )
      })()}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { key: 'info',          label: '基本信息' },
          { key: 'records',       label: '健康档案' },
          { key: 'reports',       label: '体检报告' },
          { key: 'ai',            label: 'AI分析及方案' },
          { key: 'medications',   label: '药物及营养素' },
          { key: 'requisitions',  label: '检查开单' },
          { key: 'plans',         label: '管理方案' },
          { key: 'followups',     label: '随访记录' },
          { key: 'serviceRecords', label: '服务记录' },
          { key: 'referrals',     label: '转介记录' },
          { key: 'consumption',   label: '消费记录' },
          { key: 'family',        label: '家庭信息' },
          { key: 'membership',    label: '会员信息' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Info Tab ── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 基本资料 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">基本资料</div>
              {!editingBasicInfo
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(true); setBasicInfoForm(buildBasicInfoForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveBasicInfo}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBasicInfo(false); setBasicInfoForm(buildBasicInfoForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingBasicInfo ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'name', label: '姓名' },
                    { key: 'idNumber', label: '身份证号' },
                    { key: 'birthDate', label: '出生日期', type: 'date' },
                    { key: 'height', label: '身高(cm)', type: 'number' },
                    { key: 'weight', label: '体重(kg)', type: 'number' },
                    { key: 'address', label: '联系地址' },
                    { key: 'contactPhone', label: '联系电话' },
                    { key: 'workplace', label: '所在企业' },
                    { key: 'occupation', label: '所在行业' },
                  ].map(({ key, label, type }) => (
                    <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      <input className="form-input" type={type || 'text'} value={basicInfoForm[key] || ''}
                        onChange={e => setBasicInfoForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>性别</label>
                    <select className="form-input" value={basicInfoForm.gender || '未知'} onChange={e => setBasicInfoForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="未知">未知</option><option value="男">男</option><option value="女">女</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>婚姻状况</label>
                    <select className="form-input" value={basicInfoForm.maritalStatus || ''} onChange={e => setBasicInfoForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                      <option value="">未填写</option><option>未婚</option><option>已婚</option><option>离异</option><option>丧偶</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>民族</label>
                    <input className="form-input" value={basicInfoForm.ethnicity || ''} onChange={e => setBasicInfoForm(f => ({ ...f, ethnicity: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>学历</label>
                    <select className="form-input" value={basicInfoForm.education || ''} onChange={e => setBasicInfoForm(f => ({ ...f, education: e.target.value }))}>
                      <option value="">未填写</option>
                      {['小学','初中','高中','大专','本科','硕士','博士'].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>是否每年健康体检</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={basicInfoForm.hasAnnualCheckup === v} onChange={() => setBasicInfoForm(f => ({ ...f, hasAnnualCheckup: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="姓名" value={user.name} />
                  <InfoRow label="手机号" value={user.phone} />
                  <InfoRow label="性别" value={user.gender} />
                  <InfoRow label="年龄" value={age} />
                  <InfoRow label="身高" value={user.height ? `${user.height} cm` : '-'} />
                  <InfoRow label="体重" value={user.weight ? `${user.weight} kg` : '-'} />
                  {bmi && <InfoRow label="BMI" value={bmi} />}
                  <InfoRow label="身份证" value={user.idNumber || '-'} />
                  <InfoRow label="婚姻状况" value={user.maritalStatus || '-'} />
                  <InfoRow label="民族" value={user.ethnicity || '-'} />
                  <InfoRow label="学历" value={user.education || '-'} />
                  <InfoRow label="所在企业" value={user.workplace || '-'} />
                  <InfoRow label="所在行业" value={user.occupation || '-'} />
                  <InfoRow label="每年体检" value={user.hasAnnualCheckup || '-'} />
                </>
              )}
            </div>
          </div>

          {/* 管理信息（可编辑） */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">管理信息</div>
              {!editing
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditForm(buildEditForm(user)) }}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">紧急联系电话</label>
                    <input className="form-input" value={editForm.contactPhone2}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone2: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">紧急联系人</label>
                    <input className="form-input" value={editForm.contactName}
                      onChange={e => setEditForm(f => ({ ...f, contactName: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">配送地址</label>
                    <input className="form-input" value={editForm.deliveryAddress}
                      onChange={e => setEditForm(f => ({ ...f, deliveryAddress: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员类型</label>
                    <select className="form-input" value={editForm.memberType || ''}
                      onChange={e => setEditForm(f => ({ ...f, memberType: e.target.value }))}>
                      <option value="">-- 未设置 --</option>
                      <option value="优享">优享</option>
                      <option value="悦享">悦享</option>
                      <option value="尊享">尊享</option>
                      <option value="卓越">卓越</option>
                    </select>
                  </div>
                  {[
                    { label: '家庭医师',  field: 'assignedFamilyDoctor',     role: 'familyDoctor' },
                    { label: '营养师',    field: 'assignedNutritionist',     role: 'nutritionist' },
                    { label: '健管专员',  field: 'assignedHealthManager',    role: 'healthManager' },
                    { label: '专科医师',  field: 'assignedSpecialist',       role: 'specialist' },
                    { label: '中医师',    field: 'assignedTcmDoctor',        role: 'tcmDoctor' },
                    { label: '心理咨询师',field: 'assignedPsychologist',     role: 'psychologist' },
                    { label: '运动复健师',field: 'assignedRehabSpecialist',  role: 'rehabSpecialist' },
                    { label: '就医专员',  field: 'assignedMedicalAssistant', role: 'medicalAssistant' },
                  ].map(({ label, field, role }) => (
                    <div key={field} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <select className="form-input" value={editForm[field]}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}>
                        <option value="">-- 未分配 --</option>
                        {staffList.filter(s => s.role === role).map(s => (
                          <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务包</label>
                    <input className="form-input" placeholder="如：年度服务包" value={editForm.servicePackage}
                      onChange={e => setEditForm(f => ({ ...f, servicePackage: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务开始时间</label>
                    <input className="form-input" type="date" value={editForm.serviceStartDate}
                      onChange={e => setEditForm(f => ({ ...f, serviceStartDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">服务到期时间</label>
                    <input className="form-input" type="date" value={editForm.serviceExpiry}
                      onChange={e => setEditForm(f => ({ ...f, serviceExpiry: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">会员来源</label>
                    <input className="form-input" value={editForm.source}
                      onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">备注</label>
                    <textarea className="form-input" rows={3} value={editForm.remark}
                      onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="紧急联系电话" value={user.contactPhone2 || '-'} />
                  <InfoRow label="紧急联系人" value={user.contactName || '-'} />
                  <InfoRow label="配送地址" value={user.deliveryAddress || '-'} />
                  <InfoRow label="会员类型" value={user.memberType || '-'} />
                  <InfoRow label="家庭医师"   value={user.assignedFamilyDoctor?.name     || '-'} />
                  <InfoRow label="营养师"     value={user.assignedNutritionist?.name     || '-'} />
                  <InfoRow label="健管专员"   value={user.assignedHealthManager?.name    || '-'} />
                  {user.assignedSpecialist       && <InfoRow label="专科医师"   value={user.assignedSpecialist?.name      || '-'} />}
                  {user.assignedTcmDoctor        && <InfoRow label="中医师"     value={user.assignedTcmDoctor?.name       || '-'} />}
                  {user.assignedPsychologist     && <InfoRow label="心理咨询师" value={user.assignedPsychologist?.name    || '-'} />}
                  {user.assignedRehabSpecialist  && <InfoRow label="运动复健师" value={user.assignedRehabSpecialist?.name || '-'} />}
                  {user.assignedMedicalAssistant && <InfoRow label="就医专员"   value={user.assignedMedicalAssistant?.name|| '-'} />}
                  <InfoRow label="正式客户" value={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: user.isRegisteredClient ? '#22A06B' : '#aaa', fontWeight: 600 }}>
                        {user.isRegisteredClient ? '✓ 是（隐藏365入口）' : '否'}
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={async () => {
                        try {
                          await staffAPI.updatePatient(user._id, { isRegisteredClient: !user.isRegisteredClient })
                          toast(`已${!user.isRegisteredClient ? '标记为正式客户' : '取消正式客户标记'}`)
                          load()
                        } catch (e) { toast(e.message) }
                      }}>切换</button>
                    </span>
                  } />
                  <InfoRow label="会员来源" value={user.source || '-'} />
                  <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
                  <InfoRow label="服务开始" value={user.serviceStartDate || '-'} />
                  <InfoRow label="服务到期" value={user.serviceExpiry || '-'} />
                  <InfoRow label="健康评分" value={(() => {
                    const s = user.healthScore
                    const g = user.healthScoreDetail?.grade
                    if (!s) return '-'
                    const c = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[g] || '#8AA89C'
                    return <span>{s}分 {g && <span style={{ marginLeft: 6, padding: '1px 8px', borderRadius: 10, background: c + '20', color: c, fontSize: 12, fontWeight: 600 }}>{g}</span>}</span>
                  })()} />
                  {user.remark && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>
                      📝 {user.remark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 医疗保障信息 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">医疗保障信息</div>
              {!editingInsurance
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(true); setInsuranceForm(buildInsuranceForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveInsurance}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingInsurance(false); setInsuranceForm(buildInsuranceForm(user)) }}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingInsurance ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>基础医疗保障（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['城镇医疗保险', '居民医疗保险', '自费'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_basic" value={opt}
                            checked={insuranceForm.basic_insurance === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, basic_insurance: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>商业医疗险（四选一）</label>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {['百万医疗险', '高端医疗险（亚洲版）', '高端医疗险（全球版）', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_commercial" value={opt}
                            checked={insuranceForm.commercial_medical === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, commercial_medical: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>重疾险（三选一）</label>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {['大陆险', '港险', '未购买'].map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                          <input type="radio" name="ins_critical" value={opt}
                            checked={insuranceForm.critical_illness === opt}
                            onChange={() => setInsuranceForm(p => ({ ...p, critical_illness: opt }))} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>基础医疗保障：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.basic_insurance || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>医疗险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.commercial_medical || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>重疾险：</span>
                    <span style={{ fontSize: 13, color: '#1A2B24' }}>{user.critical_illness || '-'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 健康需求 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">健康需求</div>
              {!editingHealthNeeds
                ? <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealthNeeds(true); setHealthNeedsForm(buildHealthNeedsForm(user)) }}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveHealthNeeds}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealthNeeds(false)}>取消</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editingHealthNeeds ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'healthConcern', label: '关注的健康问题', rows: 2 },
                    { key: 'healthConcernFor', label: '更关注谁的健康', rows: 1 },
                    { key: 'expectedService', label: '期望家庭医师服务', rows: 2 },
                    { key: 'hasHomeMonitor', label: '居家检测设备', rows: 2 },
                  ].map(({ key, label, rows }) => (
                    <div key={key}>
                      <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                      {rows > 1
                        ? <textarea className="form-input" rows={rows} value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                        : <input className="form-input" value={healthNeedsForm[key] || ''} onChange={e => setHealthNeedsForm(f => ({ ...f, [key]: e.target.value }))} />
                      }
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>居家小药箱</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {['是','否'].map(v => (
                        <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" checked={healthNeedsForm.hasMedicineCabinet === v} onChange={() => setHealthNeedsForm(f => ({ ...f, hasMedicineCabinet: v }))} />{v}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {[
                    ['关注的健康问题', user.healthConcern],
                    ['更关注谁的健康', user.healthConcernFor],
                    ['期望服务', user.expectedService],
                    ['居家检测设备', user.hasHomeMonitor],
                    ['居家小药箱', user.hasMedicineCabinet],
                  ].map(([label, val]) => val ? (
                    <div key={label} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f5f2ec' }}>
                      <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 90 }}>{label}：</span>
                      <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{val}</span>
                    </div>
                  ) : null)}
                  {!user.healthConcern && !user.expectedService && (
                    <div style={{ color: '#ccc', fontSize: 13 }}>暂未填写</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 最近随访 */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">最近随访</div>
            </div>
            <div className="card-body">
              {recentFollowUps?.length > 0 ? (
                recentFollowUps.map(f => (
                  <div key={f._id} style={{
                    padding: '12px 0', borderBottom: '1px solid #f0ece4',
                    display: 'flex', gap: 16, alignItems: 'flex-start'
                  }}>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontSize: 12, minWidth: 50 }}>
                      {STATUS_MAP[f.status]}
                    </span>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>
                      {new Date(f.date).toLocaleDateString('zh-CN')}
                    </span>
                    <span style={{ fontSize: 12, color: '#4A6558' }}>[{TYPE_MAP[f.type]}]</span>
                    <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{f.content || '无内容'}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{f.staffId?.name}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
                  暂无随访记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {tab === 'records' && (
        <>
        {/* ── 整体档案审核状态（顶部） ── */}
        <div style={{ marginBottom: 16, padding: '10px 16px', background: user.archiveReviewStatus === 'reviewed' ? '#F0FDF4' : '#FFFBEB', borderRadius: 8, border: `1px solid ${user.archiveReviewStatus === 'reviewed' ? '#BBF7D0' : '#FDE68A'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#4A6558' }}>
            健康档案整体审核状态：
            <span style={{ marginLeft: 6, fontWeight: 600, color: user.archiveReviewStatus === 'reviewed' ? '#22A06B' : '#D97706' }}>
              {user.archiveReviewStatus === 'reviewed' ? '✓ 已审核' : '待审核'}
            </span>
            {user.archiveReviewedAt && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#aaa' }}>
                审核时间：{new Date(user.archiveReviewedAt).toLocaleDateString('zh-CN')}
              </span>
            )}
            <span style={{ marginLeft: 12, fontSize: 12, color: '#8AA89C' }}>（对基础资料、健康档案、管理信息、医疗保障、生活方式、健康需求等全部内容进行整体审核）</span>
          </div>
          {user.archiveReviewStatus !== 'reviewed' ? (
            <button className="btn btn-primary btn-sm" onClick={handleArchiveReview}>审核确认</button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={async () => { await staffAPI.archiveReview(id, 'reset'); toast('已重置为待审核'); load() }}>重置审核</button>
          )}
        </div>

        {/* ── 初始健康数据录入 ── */}
        <InitialHealthRecordForm patientId={user._id} onSaved={() => load()} toast={toast} />

        {/* ── 健康评分卡片 ── */}
        {(() => {
          const detail = user.healthScoreDetail || {}
          const score = user.healthScore || 0
          const grade = detail.grade || (score >= 90 ? '优' : score >= 75 ? '良' : score >= 60 ? '中' : score > 0 ? '差' : '-')
          const gradeColor = { '优': '#22A06B', '良': '#1E6B50', '中': '#D97706', '差': '#DC3545' }[grade] || '#8AA89C'
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">健康评分</div>
                <button className="btn btn-primary btn-sm" onClick={handleRecalculateScore} disabled={scoreLoading}>
                  {scoreLoading ? '计算中...' : '重新计算'}
                </button>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {score > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
                    {/* 总分 */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 48, fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 4 }}>满分100</div>
                      <div style={{ marginTop: 8, padding: '3px 12px', background: gradeColor + '20', borderRadius: 12, color: gradeColor, fontWeight: 600, fontSize: 15, display: 'inline-block' }}>
                        {grade}
                      </div>
                    </div>
                    {/* 分项明细 */}
                    {detail.deductions && (
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分构成</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                          {[
                            ['基础健康分（初始60）', `${60 + (detail.deductions?.chronic || 0) + (detail.deductions?.lab || 0)}`],
                            ['生活方式分（初始40）', `${40 + (detail.deductions?.lifestyle || 0)}`],
                            ['慢性病扣分', `${detail.deductions?.chronic || 0}`],
                            ['体检指标扣分', `${detail.deductions?.lab || 0}`],
                            ['生活方式扣分', `${detail.deductions?.lifestyle || 0}`],
                            ['年龄性别调整', `${detail.ageGenderAdj >= 0 ? '+' : ''}${detail.ageGenderAdj || 0}`],
                          ].map(([label, val]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', borderBottom: '1px solid #f0ede6' }}>
                              <span style={{ color: '#4A6558' }}>{label}</span>
                              <span style={{ fontWeight: 600, color: String(val).startsWith('-') ? '#DC3545' : '#1A2B24' }}>{val}</span>
                            </div>
                          ))}
                        </div>
                        {detail.calculatedAt && (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>
                            计算时间：{new Date(detail.calculatedAt).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    )}
                    {/* 趋势 */}
                    {user.scoreHistory?.length >= 2 && (
                      <div>
                        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>评分趋势</div>
                        {(() => {
                          const hist = [...(user.scoreHistory || [])].slice(-8).reverse()
                          const W = 180, H = 60, PAD = 6
                          const vals = hist.map(h => h.score)
                          const min = Math.min(...vals, 0), max = Math.max(...vals, 100)
                          const range = max - min || 1
                          const xs = hist.map((_, i) => PAD + (i / Math.max(hist.length - 1, 1)) * (W - PAD * 2))
                          const ys = vals.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))
                          const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
                          return (
                            <svg width={W} height={H} style={{ display: 'block' }}>
                              <polyline fill="none" stroke="#1E6B50" strokeWidth="2" points={pts} />
                              {hist.map((h, i) => (
                                <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill="#1E6B50" />
                              ))}
                            </svg>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                    暂无评分，请先录入体检指标和生活方式数据，然后点击「重新计算」
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── 基本档案 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">基本档案</div>
            {!editingHealth
              ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingHealth(true)}>编辑</button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveHealth}>保存</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditingHealth(false); setHealthForm(buildHealthForm(user)) }}>取消</button>
                </div>
            }
          </div>
          <div className="card-body">
            {editingHealth ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>血型 ABO</label>
                    <select className="form-control" value={healthForm.bloodTypeABO || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeABO: e.target.value }))}>
                      <option value="">未知</option>
                      {['A','B','O','AB'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>RH 血型</label>
                    <select className="form-control" value={healthForm.bloodTypeRH || ''} onChange={e => setHealthForm(p => ({ ...p, bloodTypeRH: e.target.value }))}>
                      <option value="">未知</option>
                      <option value="阳性">阳性</option>
                      <option value="阴性">阴性</option>
                    </select>
                  </div>
                </div>
                {[
                  { key: 'drugAllergy', label: '药物过敏', nested: true },
                  { key: 'foodAllergy', label: '食物过敏', nested: true },
                  { key: 'pastHistory', label: '既往史', nested: true },
                  { key: 'medicHistory', label: '是否长期服用中药或西药', nested: true },
                  { key: 'supplementHistory', label: '是否有长期服用营养补剂', nested: true },
                  { key: 'surgeryHistory', label: '手术史', nested: true },
                  { key: 'traumaHistory', label: '外伤史', nested: false },
                  { key: 'transfusionHistory', label: '输血史', nested: false },
                  { key: 'poisoningHistory', label: '中毒史', nested: false },
                  { key: 'infectiousHistory', label: '传染病史', nested: false },
                  { key: 'vaccinationHistory', label: '预防接种史', nested: false },
                  { key: 'otherDiseaseHistory', label: '其他特殊疾病史', nested: false },
                  { key: 'familyHistoryNote', label: '家族史', nested: true },
                  ...(user.gender === '女' ? [
                    { key: 'sexualHistory', label: '是否有性生活史', nested: true },
                    { key: 'menstrualHistory', label: '月经史', nested: true },
                    { key: 'maritalHistory', label: '生育史', nested: true },
                  ] : []),
                ].map(({ key, label, nested }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                    <textarea className="form-control" rows={2} value={nested ? (healthForm.healthProfile?.[key] || '') : (healthForm[key] || '')}
                      onChange={e => {
                        if (nested) setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))
                        else setHealthForm(p => ({ ...p, [key]: e.target.value }))
                      }}
                    />
                  </div>
                ))}
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginTop: 8, marginBottom: 4 }}>近期健康状态</div>
                <div>
                  <label style={{ fontSize: 12, color: '#8AA89C' }}>最近3个月躯体症状</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(() => {
                      const symptoms = healthForm.healthProfile?.recentSymptoms || []
                      const noSymptom = symptoms.includes('无躯体症状')
                      const otherEntry = symptoms.find(s => s.startsWith('其他'))
                      const otherText = otherEntry ? otherEntry.replace(/^其他[:：]?/, '') : ''
                      const OPTS = ['头痛','头晕','胸闷','乏力','失眠','焦虑/抑郁','消化不良','关节疼痛','皮肤问题']
                      const updateSymptoms = (next) => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, recentSymptoms: next } }))
                      return (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${noSymptom ? '#1E6B50' : '#E0D9CE'}`, background: noSymptom ? '#E8F5EF' : '#fff', color: noSymptom ? '#1E6B50' : '#4A6558' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={noSymptom}
                              onChange={e => updateSymptoms(e.target.checked ? ['无躯体症状'] : [])} />
                            无躯体症状
                          </label>
                          {OPTS.map(s => {
                            const checked = !noSymptom && symptoms.includes(s)
                            return (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${checked ? '#1E6B50' : '#E0D9CE'}`, background: checked ? '#E8F5EF' : '#fff', color: checked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={checked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状')
                                    updateSymptoms(e.target.checked ? [...cur, s] : cur.filter(x => x !== s))
                                  }} />{s}
                              </label>
                            )
                          })}
                          {(() => {
                            const otherChecked = !noSymptom && symptoms.some(s => s.startsWith('其他'))
                            return (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, border: `1px solid ${otherChecked ? '#1E6B50' : '#E0D9CE'}`, background: otherChecked ? '#E8F5EF' : '#fff', color: otherChecked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={otherChecked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                    updateSymptoms(e.target.checked ? [...cur, '其他'] : cur)
                                  }} />
                                其他
                                {otherChecked && (
                                  <input
                                    type="text"
                                    placeholder="请说明"
                                    value={otherText}
                                    onClick={e => e.preventDefault()}
                                    onChange={e => {
                                      const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                      const text = e.target.value
                                      updateSymptoms([...cur, text ? `其他：${text}` : '其他'])
                                    }}
                                    style={{ marginLeft: 4, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 100, color: '#1A2B24' }}
                                  />
                                )}
                              </label>
                            )
                          })()}
                        </>
                      )
                    })()}
                  </div>
                </div>
                {[
                  { key: 'recentMedication', label: '最近1个月是否服用中药或西药' },
                  { key: 'recentSupplement', label: '最近1个月是否服用营养补剂' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label style={{ fontSize: 12, color: '#8AA89C' }}>{label}</label>
                    <textarea className="form-control" rows={2} value={healthForm.healthProfile?.[key] || ''}
                      onChange={e => setHealthForm(p => ({ ...p, healthProfile: { ...p.healthProfile, [key]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            ) : (() => {
              const Field = ({ label, val, full }) => !val ? null : (
                <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', gap: 0, flexDirection: 'column', padding: '4px 0' }}>
                  <span style={{ fontSize: 11, color: '#8AA89C', marginBottom: 1 }}>{label}</span>
                  <span style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.4 }}>{val}</span>
                </div>
              )
              const SecTitle = ({ title }) => (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, fontWeight: 600, color: '#1E6B50', borderBottom: '1px solid #f0ece4', paddingBottom: 4, marginTop: 6 }}>{title}</div>
              )
              const bloodType = [user.bloodTypeABO, user.bloodTypeRH].filter(Boolean).join(' ')
              const symptoms = (user.healthProfile?.recentSymptoms || []).join('、')
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
                  <SecTitle title="基础信息" />
                  <Field label="血型" val={bloodType || '-'} />
                  <Field label="药物过敏" val={user.healthProfile?.drugAllergy} />
                  <Field label="食物过敏" val={user.healthProfile?.foodAllergy} />

                  <SecTitle title="病史" />
                  <Field label="既往史" val={user.healthProfile?.pastHistory} full />
                  <Field label="手术史" val={user.healthProfile?.surgeryHistory} />
                  <Field label="外伤史" val={user.traumaHistory} />
                  <Field label="输血史" val={user.transfusionHistory} />
                  <Field label="中毒史" val={user.poisoningHistory} />
                  <Field label="传染病史" val={user.infectiousHistory} />
                  <Field label="预防接种史" val={user.vaccinationHistory} />
                  <Field label="其他特殊疾病史" val={user.otherDiseaseHistory} full />
                  <Field label="家族史" val={user.healthProfile?.familyHistoryNote} full />

                  <SecTitle title="用药及补剂" />
                  <Field label="长期用药（中/西药）" val={user.healthProfile?.medicHistory} />
                  <Field label="长期服用营养补剂" val={user.healthProfile?.supplementHistory} />

                  {user.gender === '女' && <>
                    <SecTitle title="女性专项" />
                    <Field label="性生活史" val={user.healthProfile?.sexualHistory} />
                    <Field label="月经史" val={user.healthProfile?.menstrualHistory} />
                    <Field label="生育史" val={user.healthProfile?.maritalHistory} />
                  </>}

                  <SecTitle title="近期健康状态" />
                  <Field label="躯体症状" val={symptoms} full />
                  <Field label="近期用药（中/西药）" val={user.healthProfile?.recentMedication} />
                  <Field label="近期营养补剂" val={user.healthProfile?.recentSupplement} />
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 生活方式（膳食调查基础资料）── 位于健康档案顶部，打卡数据在下方 */}
        {(() => {
          const ld = editingLifestyle ? (lifestyleForm.lifestyle_data || {}) : (user.lifestyle_data || {})
          const setLd = (patch) => setLifestyleForm(p => ({ ...p, lifestyle_data: { ...(p.lifestyle_data || {}), ...patch } }))
          const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 20px', marginBottom: 12 }
          const secTitle = { fontWeight: 600, fontSize: 13, color: '#1E6B50', margin: '12px 0 8px' }
          const tabBtnStyle = (k) => ({
            padding: '6px 14px', fontSize: 13, cursor: 'pointer',
            color: lifestyleTab === k ? '#1E6B50' : '#8AA89C',
            fontWeight: lifestyleTab === k ? 600 : 400,
            background: 'none', border: 'none',
            borderBottom: lifestyleTab === k ? '2px solid #1E6B50' : '2px solid transparent',
          })
          return (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">生活方式（膳食调查）</div>
                {!editingLifestyle
                  ? <button className="btn btn-secondary btn-sm" onClick={() => { setLifestyleTab('diet'); setEditingLifestyle(true) }}>编辑</button>
                  : <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleSaveLifestyle}>保存</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLifestyle(false); setLifestyleForm(buildLifestyleForm(user)) }}>取消</button>
                    </div>
                }
              </div>
              <div className="card-body">
                {/* 子板块 Tab 导航 */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e0d9ce', marginBottom: 16, overflowX: 'auto' }}>
                  {[
                    { key: 'diet', label: '膳食调查' },
                    { key: 'exercise', label: '运动与作息' },
                    { key: 'alcohol', label: '烟酒与应酬' },
                    { key: 'nutrition', label: '营养素与过敏' },
                    { key: 'summary', label: '综合概述' },
                  ].map(t => (
                    <button key={t.key} style={tabBtnStyle(t.key)} onClick={() => setLifestyleTab(t.key)}>{t.label}</button>
                  ))}
                </div>

                {/* ── 膳食调查 ── */}
                {lifestyleTab === 'diet' && (
                  <div>
                    <div style={secTitle}>三餐与加餐</div>
                    <div style={row2}>
                      <LsText label="早餐时间" value={ld.breakfastTime} editing={editingLifestyle} placeholder="如 07:30" onChange={v => setLd({ breakfastTime: v })} />
                      <LsRadio label="早餐就餐方式" value={ld.breakfastDetail} editing={editingLifestyle} options={['居家', '外卖', '少吃', '不吃']} onChange={v => setLd({ breakfastDetail: v })} />
                      <LsText label="早餐品类描述" value={ld.breakfastDesc} editing={editingLifestyle} placeholder="如 粥、鸡蛋、包子" onChange={v => setLd({ breakfastDesc: v })} />
                      <div>
                        <LsRadio label="上午加餐" value={ld.morningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ morningSnack: v })} />
                        {(ld.morningSnack === '是' || !editingLifestyle) && (
                          <LsText label="上午加餐品类" value={ld.morningSnackDesc} editing={editingLifestyle} placeholder="如 坚果、水果" onChange={v => setLd({ morningSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="午餐时间" value={ld.lunchTime} editing={editingLifestyle} placeholder="如 12:00" onChange={v => setLd({ lunchTime: v })} />
                      <LsRadio label="午餐就餐方式" value={ld.lunchDetail} editing={editingLifestyle} options={['居家', '饭店或外卖', '少吃', '不吃']} onChange={v => setLd({ lunchDetail: v })} />
                      <LsText label="午餐品类描述" value={ld.lunchDesc} editing={editingLifestyle} placeholder="如 米饭、炒菜、汤" onChange={v => setLd({ lunchDesc: v })} />
                      <div>
                        <LsRadio label="下午加餐" value={ld.afternoonSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ afternoonSnack: v })} />
                        {(ld.afternoonSnack === '是' || !editingLifestyle) && (
                          <LsText label="下午加餐品类" value={ld.afternoonSnackDesc} editing={editingLifestyle} placeholder="如 酸奶、饼干" onChange={v => setLd({ afternoonSnackDesc: v })} />
                        )}
                      </div>
                    </div>
                    <div style={row2}>
                      <LsText label="晚餐时间" value={ld.dinnerTime} editing={editingLifestyle} placeholder="如 18:30" onChange={v => setLd({ dinnerTime: v })} />
                      <LsRadio label="晚餐就餐方式" value={ld.dinnerDetail} editing={editingLifestyle} options={['居家', '饭店或外卖', '少吃', '不吃']} onChange={v => setLd({ dinnerDetail: v })} />
                      <LsText label="晚餐品类描述" value={ld.dinnerDesc} editing={editingLifestyle} placeholder="如 蔬菜、豆腐、汤" onChange={v => setLd({ dinnerDesc: v })} />
                      <div>
                        <LsRadio label="晚间加餐" value={ld.eveningSnack} editing={editingLifestyle} options={['是', '否']} onChange={v => setLd({ eveningSnack: v })} />
                        {(ld.eveningSnack === '是' || !editingLifestyle) && (
                          <LsText label="晚间加餐品类" value={ld.eveningSnackDesc} editing={editingLifestyle} placeholder="如 牛奶、坚果" onChange={v => setLd({ eveningSnackDesc: v })} />
                        )}
                      </div>
                    </div>

                    <div style={secTitle}>食物摄入量</div>
                    <div style={row3}>
                      <LsRadio label="每日主食摄入量" value={ld.dailyStaple} editing={editingLifestyle} options={['250克以内', '250-400克', '400克以上', '几乎不吃']} onChange={v => setLd({ dailyStaple: v })} />
                      <LsRadio label="每日蔬菜摄入量" value={ld.dailyVegetables} editing={editingLifestyle} options={['500克及以上', '300-500克', '300克以内', '几乎不吃']} onChange={v => setLd({ dailyVegetables: v })} />
                      <LsRadio label="每日荤菜摄入量" value={ld.dailyMeat} editing={editingLifestyle} options={['80克以内', '80-150克', '150克及以上', '几乎不吃']} onChange={v => setLd({ dailyMeat: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="吃水果频次" value={ld.fruitFrequency} editing={editingLifestyle} options={['3天/周及以上', '每天吃', '几乎不吃']} onChange={v => setLd({ fruitFrequency: v })} />
                      <LsRadio label="水果摄入量" value={ld.fruitAmount} editing={editingLifestyle} options={['200克以内', '200-350克', '350克以上']} onChange={v => setLd({ fruitAmount: v })} />
                      <LsRadio label="鸡蛋摄入频次" value={ld.eggFrequency} editing={editingLifestyle} options={['1-3天/周', '3-5天/周', '每天都吃']} onChange={v => setLd({ eggFrequency: v })} />
                      <LsRadio label="鸡蛋摄入量" value={ld.eggAmount} editing={editingLifestyle} options={['1个', '2-3个', '4个以上']} onChange={v => setLd({ eggAmount: v })} />
                      <LsRadio label="奶制品摄入量" value={ld.dairyAmount} editing={editingLifestyle} options={['＜300毫升/天', '300-500毫升/天', '＞500毫升', '几乎不喝']} onChange={v => setLd({ dairyAmount: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="坚果摄入频次" value={ld.nutFrequency} editing={editingLifestyle} options={['一周2-3天', '每天吃', '几乎不吃']} onChange={v => setLd({ nutFrequency: v })} />
                      <LsRadio label="坚果摄入量" value={ld.nutAmount} editing={editingLifestyle} options={['10克', '20-30克', '50克以上']} onChange={v => setLd({ nutAmount: v })} />
                      <LsRadio label="粗杂粮摄入频次" value={ld.grainFrequency} editing={editingLifestyle} options={['每天吃', '1-2天/周', '3天/周及以上', '几乎不吃']} onChange={v => setLd({ grainFrequency: v })} />
                      <LsRadio label="粗杂粮摄入量" value={ld.grainAmount} editing={editingLifestyle} options={['50-100克', '100-200克', '200-250克', '300克以上']} onChange={v => setLd({ grainAmount: v })} />
                    </div>

                    <div style={secTitle}>饮食习惯</div>
                    <div style={row2}>
                      <LsRadio label="忌口" value={ld.dietaryRestrictions} editing={editingLifestyle} options={['无', '有']} onChange={v => setLd({ dietaryRestrictions: v })} />
                      <LsText label="忌口具体说明" value={ld.dietaryRestrictionsDesc} editing={editingLifestyle} placeholder="如 不吃海鲜、不吃辣" onChange={v => setLd({ dietaryRestrictionsDesc: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="不良饮食习惯（可多选）" value={ld.badDietHabits || []} editing={editingLifestyle}
                        options={['三餐不规律', '常吃夜宵', '常吃外卖', '进餐速度过快', '常吃油炸食品', '常吃甜品及含糖饮料', '常吃腌制食品', '常吃动物内脏', '饮食重油', '口味偏咸']}
                        onChange={v => setLd({ badDietHabits: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainment} editing={editingLifestyle} options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']} onChange={v => setLd({ entertainment: v })} />
                  </div>
                )}

                {/* ── 运动与作息 ── */}
                {lifestyleTab === 'exercise' && (
                  <div>
                    <div style={secTitle}>运动</div>
                    <div style={row3}>
                      <LsText label="运动类型" value={ld.exerciseType} editing={editingLifestyle} placeholder="如 跑步、瑜伽、游泳" onChange={v => setLd({ exerciseType: v })} />
                      <LsRadio label="运动频率" value={ld.exerciseFrequency} editing={editingLifestyle} options={['1-2天/周', '3-5天/周', '6-7天/周', '无']} onChange={v => setLd({ exerciseFrequency: v })} />
                      <LsText label="每次时长（分钟）" value={ld.exerciseDuration} editing={editingLifestyle} placeholder="如 30" onChange={v => setLd({ exerciseDuration: v })} />
                    </div>
                    <div style={secTitle}>作息</div>
                    <div style={row3}>
                      <LsText label="起床时间" value={ld.wakeTime} editing={editingLifestyle} placeholder="如 07:00" onChange={v => setLd({ wakeTime: v })} />
                      <LsText label="入睡时间" value={ld.sleepTime} editing={editingLifestyle} placeholder="如 23:00" onChange={v => setLd({ sleepTime: v })} />
                      <LsRadio label="作息规律性" value={ld.scheduleRegularity} editing={editingLifestyle} options={['规律', '不规律']} onChange={v => setLd({ scheduleRegularity: v })} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <LsText label="备注" value={ld.exerciseRemark} editing={editingLifestyle}
                        placeholder="如：膝盖有伤，不适合跑步；夜班工作，作息不规律" onChange={v => setLd({ exerciseRemark: v })} />
                    </div>
                  </div>
                )}

                {/* ── 烟酒与应酬 ── */}
                {lifestyleTab === 'alcohol' && (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <LsRadio label="吸烟情况" value={ld.smokingStatus} editing={editingLifestyle}
                        options={['＜10支/日', '10-20支/日', '20-30支/日', '30支以上/日', '不吸烟', '戒烟']}
                        onChange={v => setLd({ smokingStatus: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="饮酒频率" value={ld.drinkingFrequency} editing={editingLifestyle}
                        options={['＜1天/周', '1-3天/周', '3天/周及以上', '每天喝', '不喝酒']}
                        onChange={v => setLd({ drinkingFrequency: v })} />
                      <LsCheckbox label="饮酒类型" value={ld.drinkingType || []} editing={editingLifestyle}
                        options={['红酒', '白酒', '啤酒', '其它']}
                        onChange={v => setLd({ drinkingType: v })} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <LsText label="饮酒量" value={ld.drinkingAmount} editing={editingLifestyle}
                        placeholder="如：每次100ml、每次2两" onChange={v => setLd({ drinkingAmount: v })} />
                    </div>
                    <LsRadio label="应酬频率" value={ld.entertainmentFreq} editing={editingLifestyle}
                      options={['1-2次/周', '3-5次/周', '6-7次/周', '无或偶尔']}
                      onChange={v => setLd({ entertainmentFreq: v })} />
                  </div>
                )}

                {/* ── 营养素与过敏 ── */}
                {lifestyleTab === 'nutrition' && (
                  <div>
                    <div style={row3}>
                      <LsText label="营养干预史" value={ld.nutritionHistory} editing={editingLifestyle} placeholder="描述既往营养干预情况" multiline onChange={v => setLd({ nutritionHistory: v })} />
                      <LsText label="每日膳食摄入量评估" value={ld.dailyDietAssessment} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ dailyDietAssessment: v })} />
                      <LsText label="营养素摄入概况" value={ld.nutrientOverview} editing={editingLifestyle} placeholder="描述" multiline onChange={v => setLd({ nutrientOverview: v })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <LsCheckbox label="食物过敏源（可多选）" value={ld.foodAllergens || []} editing={editingLifestyle}
                        options={['无', '海鲜', '坚果', '奶制品', '蛋类', '芒果', '其它']}
                        onChange={v => setLd({ foodAllergens: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="麸质过敏" value={ld.glutenAllergy} editing={editingLifestyle} options={['是', '否', '不详']} onChange={v => setLd({ glutenAllergy: v })} />
                      <LsRadio label="每日饮水量" value={ld.dailyWater} editing={editingLifestyle}
                        options={['1500毫升内', '1500-1700毫升', '1800-2000毫升', '2500毫升', '3000毫升以上']}
                        onChange={v => setLd({ dailyWater: v })} />
                    </div>
                    <div style={row2}>
                      <LsRadio label="心理压力" value={ld.psychStress} editing={editingLifestyle}
                        options={['正常', '中等压力/焦虑', '严重抑郁/焦虑']}
                        onChange={v => setLd({ psychStress: v })} />
                      <LsRadio label="排便规律性" value={ld.bowelRegularity} editing={editingLifestyle}
                        options={['规律（1-2次/日）', '偶尔不规律', '便秘/腹泻']}
                        onChange={v => setLd({ bowelRegularity: v })} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <LsText label="大便形状" value={ld.bowelShape} editing={editingLifestyle}
                        placeholder="如：成形香蕉形、松散、稀水样" onChange={v => setLd({ bowelShape: v })} />
                    </div>
                  </div>
                )}

                {/* ── 综合概述 ── */}
                {lifestyleTab === 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* 基本生活记录（新增会员时填写的简要描述） */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 10 }}>基本生活记录</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                        {[
                          { key: 'diet',     label: '饮食习惯',       placeholder: '如：清淡为主' },
                          { key: 'exercise', label: '运动习惯',       placeholder: '如：每周跑步3次' },
                          { key: 'sleep',    label: '睡眠习惯',       placeholder: '如：23:00入睡，7小时' },
                          { key: 'water',    label: '饮水情况',       placeholder: '如：每日2000ml' },
                          { key: 'smoking',  label: '吸烟情况',       placeholder: '如：不吸烟' },
                          { key: 'alcohol',  label: '饮酒情况',       placeholder: '如：偶尔饮酒' },
                          { key: 'bowel',    label: '排便情况',       placeholder: '如：每日1次，成形' },
                          { key: 'mood',     label: '情绪状态',       placeholder: '如：情绪稳定，偶有焦虑' },
                        ].map(({ key, label, placeholder }) => (
                          <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}</label>
                            {editingLifestyle ? (
                              <input className="form-input" placeholder={placeholder}
                                value={lifestyleForm.lifestyle?.[key] || ''}
                                onChange={e => setLifestyleForm(f => ({ ...f, lifestyle: { ...f.lifestyle, [key]: e.target.value } }))}
                                style={{ fontSize: 13 }} />
                            ) : (
                              <div style={{ fontSize: 13, color: lifestyleForm.lifestyle?.[key] ? '#1A2B24' : '#bbb', padding: '6px 0', borderBottom: '1px solid #f0ede8' }}>
                                {lifestyleForm.lifestyle?.[key] || '未填写'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 自动生成概述 */}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 6 }}>膳食调查概述</div>
                      <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>
                        系统根据膳食调查问卷自动生成，医护可手动覆盖。
                      </div>
                      {editingLifestyle ? (
                        <div>
                          <div style={{ marginBottom: 10 }}>
                            <LsText label="手动概述（填写后覆盖自动生成，留空则用自动结果）"
                              value={ld.summaryOverride || ''} editing multiline
                              placeholder="留空则使用自动生成概述"
                              onChange={v => setLd({ summaryOverride: v })} />
                          </div>
                          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 8 }}>预览（自动生成）：</div>
                          <div style={{ marginTop: 6 }}>
                            {buildLifestyleSummary(ld).length > 0
                              ? buildLifestyleSummary(ld).map((f, i) => (
                                  <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                                ))
                              : <div style={{ fontSize: 13, color: '#aaa' }}>暂无自动生成内容。</div>
                            }
                          </div>
                        </div>
                      ) : (
                        <div>
                          {ld.summaryOverride ? (
                            <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{ld.summaryOverride}</div>
                          ) : (
                            (ld.autoSummaryFlags || buildLifestyleSummary(ld)).length > 0
                              ? (ld.autoSummaryFlags || buildLifestyleSummary(ld)).map((f, i) => (
                                  <div key={i} style={{ fontSize: 13, color: '#4A6558', padding: '3px 0' }}>☑ {f}</div>
                                ))
                              : <div style={{ fontSize: 13, color: '#aaa' }}>暂无概述，请先填写膳食调查各板块。</div>
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </div>
          )
        })()}


        {/* ── 4.3 专项筛查结果（三层目录树） ── */}
        {(() => {
          const STATUS_TEXT = { normal: '正常', abnormal: '异常', attention: '注意', unknown: '' }
          const STATUS_COLOR_MAP = { normal: '#22A06B', abnormal: '#DC3545', attention: '#D97706', unknown: '#8AA89C' }

          // 构建三层树：{ l1key: { l2label: { l3label: records[] } } }
          const treeData = {}
          screeningReports.forEach(r => {
            const l1 = r.screeningL1 || r.screeningCategory || 'other'
            const l2 = r.screeningL2 || r.title || '未分类'
            const l3 = r.screeningL3 || r.title || '未命名'
            if (!treeData[l1]) treeData[l1] = {}
            if (!treeData[l1][l2]) treeData[l1][l2] = {}
            if (!treeData[l1][l2][l3]) treeData[l1][l2][l3] = []
            treeData[l1][l2][l3].push(r)
          })
          // 按日期倒序
          Object.values(treeData).forEach(l2map =>
            Object.values(l2map).forEach(l3map =>
              Object.values(l3map).forEach(arr =>
                arr.sort((a, b) => (a.checkDate || a.createdAt || 0) < (b.checkDate || b.createdAt || 0) ? 1 : -1)
              )
            )
          )

          const handleEditScreening = r => {
            // 解析 examDescription/examConclusion 回 examOrderItems
            const parseExamItems = (desc, conc) => {
              if (!desc && !conc) return []
              const parts = (desc || '').split('\n\n').map(b => b.trim()).filter(Boolean)
              const concParts = (conc || '').split('\n\n').map(b => b.trim())
              const len = Math.max(parts.length, concParts.length)
              return Array.from({ length: len }, (_, i) => {
                const part = parts[i] || ''
                const concPart = concParts[i] || ''
                const m = part.match(/^【(.+?)】/) || concPart.match(/^【(.+?)】/)
                const name = m ? m[1] : `检查项${i + 1}`
                const description = part.replace(/^【.+?】\n?/, '').trim()
                const conclusion = concPart.replace(/^【.+?】\n?/, '').trim()
                return { name, description, conclusion }
              })
            }
            const savedLabItems = (r.reportItems || []).filter(i => i.itemType !== 'data')
            const funcItems = (r.reportItems || []).filter(i => i.itemType === 'data').map(i => ({ name: i.name, result: i.value || '' }))
            const examItems = parseExamItems(r.examDescription, r.examConclusion)
            // 按 orderName 还原分组（orderName 为空说明是旧数据或手动添加的单项）
            const orderMap = {}
            const orderKeys = []
            savedLabItems.forEach(item => {
              const key = item.orderName || ''
              if (!orderMap[key]) { orderMap[key] = []; orderKeys.push(key) }
              orderMap[key].push(item)
            })
            const labItems = orderKeys.flatMap(key => {
              const items = orderMap[key]
              if (!key) {
                // 无 orderName：每个子项作为独立 order 卡片
                return items.map(i => ({ name: i.name, subItems: [], value: i.value || '', unit: i.unit || '', referenceRange: i.referenceRange || '', status: i.status || 'normal' }))
              }
              // 有 orderName：还原为一个 order 含 subItems
              return [{ name: key, subItems: items.map(i => ({ name: i.name, value: i.value || '', unit: i.unit || '', referenceRange: i.referenceRange || '', status: i.status || 'normal' })), value: '', unit: '', referenceRange: '', status: 'normal' }]
            })
            setScreeningForm({
              title: r.title || '', screeningCategory: r.screeningCategory || '',
              screeningL1: r.screeningL1 || '', screeningL2: r.screeningL2 || '',
              screeningL3: r.screeningL3 || '', screeningL3Items: r.screeningL3Items || [],
              checkDate: r.checkDate || '', hospital: r.hospital || '', note: r.note || '',
              reportItems: labItems, examOrderItems: examItems, funcTestItems: funcItems,
              examDescription: r.examDescription || '', examConclusion: r.examConclusion || '',
              linkedItemType: null,
            })
            setEditingScreeningId(r._id)
            setScreeningFiles([])
            setShowScreeningForm(true)
          }

          const handleDeleteScreening = async (r) => {
            if (!window.confirm(`确认删除「${r.title || r.screeningL2}」的筛查记录？`)) return
            try {
              await staffAPI.deleteScreeningRecord(id, r._id)
              toast('已删除')
              loadScreening()
            } catch (err) { toast(err.message || '删除失败') }
          }

          const renderRecord = (r, color) => {
            const isExpanded = expandedRecord === r._id
            // 多文件优先，向下兼容旧 fileUrl
            const allUrls = (r.fileUrls && r.fileUrls.length > 0)
              ? r.fileUrls
              : (r.fileUrl ? [r.fileUrl] : [])
            const resolvedUrls = allUrls.map(u => u.startsWith('/') ? API_ORIGIN + u : u)
            const fullUrl = resolvedUrls[0] || null
            const labItems = (r.reportItems || []).filter(i => i.itemType !== 'data')
            const funcItems = (r.reportItems || []).filter(i => i.itemType === 'data')
            const hasExam = r.examDescription || r.examConclusion
            const totalCount = labItems.length + funcItems.length + (hasExam ? 1 : 0)
            return (
              <div key={r._id} style={{ padding: '6px 0 6px 12px', borderLeft: `2px solid ${color}40`, marginBottom: 2 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div onClick={() => setExpandedRecord(isExpanded ? null : r._id)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', userSelect: 'none', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {r.checkDate || (r.createdAt && new Date(r.createdAt).toLocaleDateString('zh-CN'))}
                    </span>
                    {r.hospital && <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>📍 {r.hospital}</span>}
                    {r.note && <span style={{ fontSize: 12, color: '#4A6558', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</span>}
                    {totalCount > 0 && <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>{totalCount} 项</span>}
                    <span style={{ fontSize: 11, color: '#8AA89C', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                  <button onClick={() => handleEditScreening(r)}
                    style={{ background: 'none', border: '1px solid #E0D9CE', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#4A6558', cursor: 'pointer', flexShrink: 0 }}>编辑</button>
                  <button onClick={() => handleDeleteScreening(r)}
                    style={{ background: 'none', border: '1px solid #DC3545', borderRadius: 4, fontSize: 11, padding: '1px 6px', color: '#DC3545', cursor: 'pointer', flexShrink: 0 }}>删除</button>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 8 }}>
                    {r.note && <div style={{ fontSize: 12, color: '#4A6558', marginBottom: 6 }}>结论：{r.note}</div>}
                    {/* 检验医嘱 */}
                    {labItems.length > 0 && (() => {
                      // 按 orderName 分组，无 orderName 的归入 '' 组
                      const groupMap = {}
                      const groupKeys = []
                      labItems.forEach(item => {
                        const key = item.orderName || ''
                        if (!groupMap[key]) { groupMap[key] = []; groupKeys.push(key) }
                        groupMap[key].push(item)
                      })
                      const renderItemRows = (items) => items.map((item, j) => (
                        <tr key={j} style={{ background: item.status === 'abnormal' ? '#FFF5F5' : 'transparent', borderBottom: '1px solid #f0ece4' }}>
                          <td style={{ padding: '4px 8px', color: '#1A2B24' }}>{item.name}</td>
                          <td style={{ padding: '4px 8px', fontWeight: 600, color: STATUS_COLOR_MAP[item.status] || '#1A2B24' }}>
                            {item.value}{item.unit && <span style={{ fontWeight: 400, color: '#8AA89C', marginLeft: 2 }}>{item.unit}</span>}
                          </td>
                          <td style={{ padding: '4px 8px', color: '#8AA89C' }}>{item.referenceRange || '-'}</td>
                          <td style={{ padding: '4px 8px', color: STATUS_COLOR_MAP[item.status] || '#8AA89C' }}>{STATUS_TEXT[item.status] || '-'}</td>
                        </tr>
                      ))
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1E6B50', marginBottom: 4 }}>检验医嘱</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f5f2ec' }}>
                                {['项目','结果','参考范围','状态'].map(h => (
                                  <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#4A6558', borderBottom: '1px solid #E0D9CE' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {groupKeys.map(key => (
                                key
                                  ? [
                                    <tr key={`g-${key}`} style={{ background: '#E8F5EF' }}>
                                      <td colSpan={4} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, color: '#1E6B50' }}>{key}</td>
                                    </tr>,
                                    ...renderItemRows(groupMap[key])
                                  ]
                                  : renderItemRows(groupMap[key])
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                    {/* 检查医嘱 */}
                    {hasExam && (() => {
                      const descBlocks = (r.examDescription || '').split('\n\n').map(b => b.trim()).filter(Boolean)
                      const concBlocks = (r.examConclusion || '').split('\n\n').map(b => b.trim()).filter(Boolean)
                      // 以描述块为主，兼容只有结论的情况
                      const blocks = descBlocks.length >= concBlocks.length ? descBlocks : concBlocks
                      const parsed = blocks.map((block, i) => {
                        const descBlock = (descBlocks[i] || '').trim()
                        const concBlock = (concBlocks[i] || '').trim()
                        const nameM = descBlock.match(/^【(.+?)】/) || concBlock.match(/^【(.+?)】/)
                        const name = nameM ? nameM[1] : `检查项${i+1}`
                        const desc = descBlock.replace(/^【.+?】\n?/, '').trim()
                        const conc = concBlock.replace(/^【.+?】\n?/, '').trim()
                        return { name, desc, conc }
                      })
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', marginBottom: 4 }}>检查医嘱</div>
                          {parsed.map((item, i) => {
                            const examKey = `${r._id}_exam_${i}`
                            const isOpen = expandedExamKey === examKey
                            const hasDetail = item.desc || item.conc
                            return (
                              <div key={i} style={{ border: '1px solid #BFDBFE', borderRadius: 6, marginBottom: 4, overflow: 'hidden' }}>
                                <div
                                  onClick={() => hasDetail && setExpandedExamKey(isOpen ? null : examKey)}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#EFF6FF', cursor: hasDetail ? 'pointer' : 'default' }}>
                                  <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: 12 }}>{item.name}</span>
                                  {hasDetail && <span style={{ fontSize: 11, color: '#93C5FD' }}>{isOpen ? '▲' : '▼'}</span>}
                                </div>
                                {isOpen && hasDetail && (
                                  <div style={{ padding: '6px 10px', fontSize: 12, background: '#fff' }}>
                                    {item.desc && <div style={{ color: '#374151', marginBottom: 4 }}><span style={{ color: '#6B7280' }}>描述：</span>{item.desc}</div>}
                                    {item.conc && <div style={{ color: '#374151' }}><span style={{ color: '#6B7280' }}>结论：</span>{item.conc}</div>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {/* 功能医学检测 */}
                    {funcItems.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#7C3AED', marginBottom: 4 }}>功能医学检测</div>
                        {funcItems.map((item, j) => (
                          <div key={j} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0ece4' }}>
                            <span style={{ color: '#1A2B24', flex: 1 }}>{item.name}</span>
                            <span style={{ color: '#4A6558' }}>{item.value || '-'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {resolvedUrls.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {resolvedUrls.map((url, idx) => {
                          const isPdf = url.endsWith('.pdf') || (idx === 0 && r.mimeType === 'application/pdf')
                          return isPdf ? (
                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', textDecoration: 'none' }}>
                              📄 {resolvedUrls.length > 1 ? `PDF ${idx + 1}` : '查看报告 PDF'}
                            </a>
                          ) : (
                            <button key={idx} onClick={() => setPreviewImageUrl(url)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, border: '1px solid #BBF7D0', background: '#F0FDF4', fontSize: 12, color: '#1E6B50', cursor: 'pointer' }}>
                              🖼 {resolvedUrls.length > 1 ? `图片 ${idx + 1}` : '查看报告图片'}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          const hasAny = screeningReports.length > 0
          return (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">专项筛查结果</div>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setScreeningForm({ title: '', screeningCategory: '', screeningL1: '', screeningL2: '', screeningL3: '', screeningL3Items: [], checkDate: '', hospital: '', note: '', reportItems: [], examOrderItems: [], funcTestItems: [], examDescription: '', examConclusion: '', linkedItemType: null })
                  setScreeningFiles([])
                  setEditingScreeningId(null)
                  setScreeningLinkedItem(null)
                  setScreeningAutoMatches([])
                  setShowScreeningForm(true)
                }}>+ 录入筛查结果</button>
              </div>
              {!hasAny ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无专项筛查记录，点击「录入筛查结果」添加</div>
              ) : (() => {
                const L1_COLORS = ['#7C3AED','#DC3545','#D97706','#0369A1','#0891B2','#1E6B50','#9D174D']
                const knownL1s = new Set(screeningTree.map(n => String(n._id)))
                const legacyMap = Object.fromEntries(Object.entries(treeData).filter(([k]) => !knownL1s.has(k)))
                const hasLegacy = Object.keys(legacyMap).length > 0

                // 所有可选 L1 tab：tree 里有数据的 + 旧数据汇总为"其他"
                const availL1s = [
                  ...screeningTree.filter(n => treeData[String(n._id)]).map((n, idx) => ({
                    key: String(n._id), label: n.label, node: n,
                    color: L1_COLORS[idx % L1_COLORS.length], isLegacy: false,
                  })),
                  ...(hasLegacy ? [{ key: '__legacy__', label: '其他', node: null, color: '#8AA89C', isLegacy: true }] : []),
                ]
                const activeL1Key = (screeningActiveL1 && availL1s.find(x => x.key === screeningActiveL1))
                  ? screeningActiveL1 : availL1s[0]?.key
                const activeL1 = availL1s.find(x => x.key === activeL1Key)

                // 选中 L1 的 L2 内容
                const renderL1Content = () => {
                  if (!activeL1) return null
                  const { key, node, color, isLegacy } = activeL1
                  if (isLegacy) {
                    // 旧数据：展示所有 legacy L1 的 L2 tabs（合并到一层）
                    const allLegacyL2 = []
                    Object.entries(legacyMap).forEach(([, l2map]) => {
                      Object.entries(l2map).forEach(([l2Label, l3map]) => {
                        allLegacyL2.push([l2Label, l3map])
                      })
                    })
                    const activeL2 = screeningActiveL2s['__legacy__'] || allLegacyL2[0]?.[0]
                    return (
                      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #f0ece4', padding: '4px 8px', background: '#faf9f6', gap: 2 }}>
                          {allLegacyL2.map(([l2]) => {
                            const isA = l2 === activeL2
                            return (
                              <button key={l2} type="button"
                                onClick={() => setScreeningActiveL2s(prev => ({ ...prev, '__legacy__': l2 }))}
                                style={{ padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isA ? color : '#8AA89C', fontWeight: isA ? 700 : 400, borderBottom: isA ? `2px solid ${color}` : '2px solid transparent' }}>
                                {l2}
                              </button>
                            )
                          })}
                        </div>
                        {allLegacyL2.filter(([l2]) => l2 === activeL2).map(([l2, l3map]) => (
                          <div key={l2} style={{ padding: '12px 16px' }}>
                            {Object.entries(l3map).map(([l3, records]) => (
                              <div key={l3} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 4 }}>▶ {l3} ({records.length} 次)</div>
                                <div style={{ paddingLeft: 14 }}>{records.map(r => renderRecord(r, color))}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  // 正常 tree L1
                  const l2map = treeData[key]
                  if (!l2map) return null
                  const treeL2Order = (node.children || []).map(c => c.label)
                  const sortedL2 = [
                    ...treeL2Order.filter(k => l2map[k]).map(k => [k, l2map[k]]),
                    ...Object.entries(l2map).filter(([k]) => !treeL2Order.includes(k)),
                  ]
                  const activeL2 = screeningActiveL2s[key] || sortedL2[0]?.[0]
                  return (
                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #f0ece4', padding: '4px 8px', background: '#faf9f6', gap: 2 }}>
                        {sortedL2.map(([l2Label]) => {
                          const isActive = l2Label === activeL2
                          return (
                            <button key={l2Label} type="button"
                              onClick={() => setScreeningActiveL2s(prev => ({ ...prev, [key]: l2Label }))}
                              style={{ padding: '8px 14px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isActive ? color : '#8AA89C', fontWeight: isActive ? 700 : 400, borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent', transition: 'all 0.15s' }}>
                              {l2Label}
                            </button>
                          )
                        })}
                      </div>
                      {sortedL2.filter(([l2Label]) => l2Label === activeL2).map(([l2Label, l3map]) => (
                        <div key={l2Label} style={{ padding: '12px 16px' }}>
                          {Object.entries(l3map).map(([l3Label, records]) => (
                            <div key={l3Label} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#4A6558', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color, fontSize: 10 }}>▶</span>
                                {l3Label}
                                <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>({records.length} 次)</span>
                              </div>
                              <div style={{ paddingLeft: 14 }}>{records.map(r => renderRecord(r, color))}</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                }

                return (
                  <div>
                    {/* L1 横向 Tab 行 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '2px solid #f0ece4', marginBottom: 12, gap: 0 }}>
                      {availL1s.map(({ key, label, color }) => {
                        const isA = key === activeL1Key
                        return (
                          <button key={key} type="button"
                            onClick={() => setScreeningActiveL1(key)}
                            style={{ padding: '10px 18px', fontSize: 13, border: 'none', cursor: 'pointer', background: 'none', whiteSpace: 'nowrap', flexShrink: 0, color: isA ? color : '#8AA89C', fontWeight: isA ? 700 : 400, borderBottom: isA ? `2px solid ${color}` : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    {/* 当前 L1 内容 */}
                    {renderL1Content()}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* 录入筛查结果 Modal */}
        {showScreeningForm && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScreeningForm(false) }}>
            <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header" style={{ flexShrink: 0 }}>
                <h3 className="modal-title">{editingScreeningId ? '修改筛查结果' : '录入筛查结果'}</h3>
                <button className="modal-close" onClick={() => { setShowScreeningForm(false); setEditingScreeningId(null) }}>✕</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flex: 1 }}>
                {/* 三级联动选择（从管理端动态加载） */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">第一层：筛查大类 *</label>
                  <select className="form-input" value={screeningForm.screeningL1}
                    onChange={e => {
                      const l1 = e.target.value
                      setScreeningForm(f => ({ ...f, screeningL1: l1, screeningL2: '', screeningL3: '', title: '', screeningCategory: l1 }))
                    }}>
                    <option value="">请选择</option>
                    {screeningTree.map(n => <option key={String(n._id)} value={String(n._id)}>{n.label}</option>)}
                  </select>
                </div>
                {screeningForm.screeningL1 && (() => {
                  const l1Node = screeningTree.find(n => String(n._id) === screeningForm.screeningL1)
                  if (!l1Node) return null
                  return (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">第二层：具体分类 *</label>
                      <select className="form-input" value={screeningForm.screeningL2}
                        onChange={e => {
                          const l2 = e.target.value
                          const l2Node = l1Node.children.find(c => c.label === l2)
                          const labOrders = l2Node?.labOrders || []
                          const examItems = l2Node?.examItems || []
                          const funcItems = l2Node?.funcItems || []
                          const allNames = [...labOrders.map(o => o.name || o), ...examItems.map(x => x.name), ...funcItems]
                          setScreeningForm(f => ({ ...f, screeningL2: l2, screeningL3: '', screeningL3Items: allNames, title: l2, reportItems: labOrders.map(o => { const order = typeof o === 'string' ? { name: o, subItems: [] } : o; return { name: order.name, subItems: (order.subItems || []).map(s => ({ name: s.name, value: '', unit: s.unit || '', referenceRange: s.referenceRange || '', status: 'normal' })), value: '', unit: '', referenceRange: '', status: 'normal' } }), examOrderItems: examItems.map(x => ({ name: x.name, description: x.description || '', conclusion: x.conclusion || '' })), funcTestItems: funcItems.map(name => ({ name, result: '' })), examDescription: '', examConclusion: '', linkedItemType: null }))
                        }}>
                        <option value="">请选择</option>
                        {l1Node.children.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                      </select>
                    </div>
                  )
                })()}
                {/* 已选路径 */}
                {screeningForm.screeningL2 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#E8F5EF', borderRadius: 6, border: '1px solid #BBF7D0', fontSize: 12, color: '#1E6B50' }}>
                    <span>✓</span>
                    <span style={{ color: '#8AA89C' }}>
                      {screeningTree.find(n => String(n._id) === screeningForm.screeningL1)?.label}
                      {' › '}
                    </span>
                    <span style={{ fontWeight: 600 }}>{screeningForm.screeningL2}</span>
                    {(screeningForm.screeningL3Items || []).length > 0 && (
                      <span style={{ color: '#8AA89C' }}>（{screeningForm.screeningL3Items.length} 项）</span>
                    )}
                  </div>
                )}

                {/* ── 检验医嘱 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#1E6B50', fontWeight: 700 }}>
                        检验医嘱
                        {screeningForm.reportItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.reportItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, reportItems: [{ name: '', subItems: [], value: '', unit: '', referenceRange: '', status: 'normal' }, ...f.reportItems] }))
                          setScreeningSuggestKey('lab-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.reportItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无检验医嘱项目</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {screeningForm.reportItems.map((order, oi) => {
                          const hasSubItems = order.subItems && order.subItems.length > 0
                          const updateOrder = patch => setScreeningForm(f => { const a = [...f.reportItems]; a[oi] = { ...a[oi], ...patch }; return { ...f, reportItems: a } })
                          const updateSub = (si, patch) => setScreeningForm(f => { const a = [...f.reportItems]; const subs = [...a[oi].subItems]; subs[si] = { ...subs[si], ...patch }; a[oi] = { ...a[oi], subItems: subs }; return { ...f, reportItems: a } })
                          const STATUS_OPTIONS = [['normal','正常'],['abnormal','异常'],['attention','注意']]
                          return (
                            <div key={oi} style={{ border: '1px solid #BBF7D0', borderRadius: 8, background: '#fff', position: 'relative', zIndex: screeningSuggestKey === `lab-${oi}` ? 100 : 1 }}>
                              {/* 医嘱标题行 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#E8F5EF', borderBottom: hasSubItems ? '1px solid #BBF7D0' : 'none' }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                  <input className="form-input" style={{ width: '100%', fontWeight: 600, fontSize: 13, background: 'transparent', border: '1px solid transparent', padding: '2px 6px' }}
                                    placeholder="检验医嘱名称（可搜索）" value={order.name}
                                    onChange={e => { updateOrder({ name: e.target.value }); setScreeningSuggestKey(`lab-${oi}`) }}
                                    onFocus={() => setScreeningSuggestKey(`lab-${oi}`)}
                                    onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `lab-${oi}` ? null : k), 150)} />
                                  {screeningSuggestKey === `lab-${oi}` && (() => {
                                    const q = order.name.toLowerCase()
                                    const hits = (screeningL2SuggestData?.labOrders || []).filter(o2 => o2.name.toLowerCase().includes(q) && o2.name !== order.name)
                                    if (!hits.length) return null
                                    return (
                                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #BBF7D0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                                        {hits.map((hit, hi) => (
                                          <div key={hi} onMouseDown={() => {
                                            updateOrder({ name: hit.name, subItems: (hit.subItems || []).map(s => ({ name: s.name, value: '', unit: s.unit || '', referenceRange: s.referenceRange || '', status: 'normal' })) })
                                            setScreeningSuggestKey(null)
                                          }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#E8F5EF'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                            {hit.name}
                                            {hit.subItems?.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C' }}>{hit.subItems.length}项</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                </div>
                                {!hasSubItems && (
                                  <>
                                    <input className="form-input" style={{ width: 70, padding: '2px 6px', fontSize: 12 }} placeholder="结果" value={order.value || ''}
                                      onChange={e => updateOrder({ value: e.target.value })} />
                                    <input className="form-input" style={{ width: 60, padding: '2px 6px', fontSize: 12 }} placeholder="单位" value={order.unit || ''}
                                      onChange={e => updateOrder({ unit: e.target.value })} />
                                    <select className="form-input" style={{ width: 72, padding: '2px 4px', fontSize: 12 }} value={order.status || 'normal'}
                                      onChange={e => updateOrder({ status: e.target.value })}>
                                      {STATUS_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  </>
                                )}
                                <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
                                  onClick={() => setScreeningForm(f => ({ ...f, reportItems: f.reportItems.filter((_, i) => i !== oi) }))}>✕</button>
                              </div>
                              {/* 子项目表格 */}
                              {hasSubItems && (
                                <div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr', gap: 0, background: '#f5f2ec', padding: '3px 10px', fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>
                                    <span>指标名称</span><span>结果</span><span>单位</span><span>参考范围</span><span>状态</span>
                                  </div>
                                  {order.subItems.map((sub, si) => (
                                    <div key={si} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 1fr', gap: 4, padding: '4px 10px', borderTop: '1px solid #f0ece4', alignItems: 'center' }}>
                                      <span style={{ fontSize: 12, color: '#1A2B24' }}>{sub.name}</span>
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="结果" value={sub.value || ''}
                                        onChange={e => updateSub(si, { value: e.target.value })} />
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="单位" value={sub.unit || ''}
                                        onChange={e => updateSub(si, { unit: e.target.value })} />
                                      <input className="form-input" style={{ padding: '2px 6px', fontSize: 12 }} placeholder="参考范围" value={sub.referenceRange || ''}
                                        onChange={e => updateSub(si, { referenceRange: e.target.value })} />
                                      <select className="form-input" style={{ padding: '2px 4px', fontSize: 12 }} value={sub.status || 'normal'}
                                        onChange={e => updateSub(si, { status: e.target.value })}>
                                        {STATUS_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                                      </select>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 检查医嘱 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#0369A1', fontWeight: 700 }}>
                        检查医嘱
                        {screeningForm.examOrderItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.examOrderItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, examOrderItems: [{ name: '', description: '', conclusion: '' }, ...f.examOrderItems] }))
                          setScreeningSuggestKey('exam-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.examOrderItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无检查医嘱项目</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {screeningForm.examOrderItems.map((item, idx) => (
                          <div key={idx} style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', background: '#EFF6FF' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input className="form-input" style={{ width: '100%', fontWeight: 600, fontSize: 13 }} placeholder="检查项目名称（可搜索）" value={item.name}
                                  onChange={e => { setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], name: e.target.value }; return { ...f, examOrderItems: a } }); setScreeningSuggestKey(`exam-${idx}`) }}
                                  onFocus={() => setScreeningSuggestKey(`exam-${idx}`)}
                                  onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `exam-${idx}` ? null : k), 150)} />
                                {screeningSuggestKey === `exam-${idx}` && (() => {
                                  const q = item.name.toLowerCase()
                                  const hits = (screeningL2SuggestData?.examItems || []).filter(x => x.name.toLowerCase().includes(q) && x.name !== item.name)
                                  if (!hits.length) return null
                                  return (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #BFDBFE', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 }}>
                                      {hits.map((hit, hi) => (
                                        <div key={hi} onMouseDown={() => {
                                          setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], name: hit.name, description: hit.description || '', conclusion: hit.conclusion || '' }; return { ...f, examOrderItems: a } })
                                          setScreeningSuggestKey(null)
                                        }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                          {hit.name}
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                              <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 4px', flexShrink: 0 }}
                                onClick={() => setScreeningForm(f => ({ ...f, examOrderItems: f.examOrderItems.filter((_, i) => i !== idx) }))}>✕</button>
                            </div>
                            <textarea className="form-input" rows={2} style={{ fontSize: 12, marginBottom: 4 }} placeholder="检查描述（检查目的、注意事项等）"
                              value={item.description}
                              onChange={e => setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], description: e.target.value }; return { ...f, examOrderItems: a } })} />
                            <textarea className="form-input" rows={2} style={{ fontSize: 12 }} placeholder="诊断结论（如：未见明显异常）"
                              value={item.conclusion}
                              onChange={e => setScreeningForm(f => { const a = [...f.examOrderItems]; a[idx] = { ...a[idx], conclusion: e.target.value }; return { ...f, examOrderItems: a } })} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── 功能医学检测 ── */}
                {screeningForm.screeningL2 && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="form-label" style={{ marginBottom: 0, color: '#7C3AED', fontWeight: 700 }}>
                        功能医学检测
                        {screeningForm.funcTestItems.length > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>（{screeningForm.funcTestItems.length} 项）</span>}
                      </label>
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setScreeningForm(f => ({ ...f, funcTestItems: [{ name: '', result: '' }, ...f.funcTestItems] }))
                          setScreeningSuggestKey('func-0')
                        }}>
                        + 手动添加
                      </button>
                    </div>
                    {screeningForm.funcTestItems.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#aaa', padding: '4px 0' }}>该分类无功能医学检测项目</div>
                    ) : (
                      <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 0, background: '#f5f2ec', padding: '4px 8px', fontSize: 11, color: '#8AA89C', fontWeight: 600 }}>
                          <span>检测项目</span><span>检测结果</span><span />
                        </div>
                        {screeningForm.funcTestItems.map((item, idx) => (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr auto', gap: 4, padding: '4px 8px', borderTop: '1px solid #f0ece4', alignItems: 'center' }}>
                            <div style={{ position: 'relative' }}>
                              <input className="form-input" style={{ padding: '3px 6px', fontSize: 12, width: '100%' }} placeholder="检测项目名称" value={item.name}
                                onChange={e => { setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], name: e.target.value }; return { ...f, funcTestItems: a } }); setScreeningSuggestKey(`func-${idx}`) }}
                                onFocus={() => setScreeningSuggestKey(`func-${idx}`)}
                                onBlur={() => setTimeout(() => setScreeningSuggestKey(k => k === `func-${idx}` ? null : k), 150)} />
                              {screeningSuggestKey === `func-${idx}` && (() => {
                                const q = item.name.toLowerCase()
                                const hits = (screeningL2SuggestData?.funcItems || []).filter(n => n.toLowerCase().includes(q) && n !== item.name)
                                if (!hits.length) return null
                                return (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E9D5FF', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto', marginTop: 2 }}>
                                    {hits.map((hit, hi) => (
                                      <div key={hi} onMouseDown={() => {
                                        setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], name: hit }; return { ...f, funcTestItems: a } })
                                        setScreeningSuggestKey(null)
                                      }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: '#1A2B24', borderBottom: '1px solid #f0ece4' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                        {hit}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                            <input className="form-input" style={{ padding: '3px 6px', fontSize: 12 }} placeholder="检测结果" value={item.result}
                              onChange={e => setScreeningForm(f => { const a = [...f.funcTestItems]; a[idx] = { ...a[idx], result: e.target.value }; return { ...f, funcTestItems: a } })} />
                            <button type="button" style={{ background: 'none', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                              onClick={() => setScreeningForm(f => ({ ...f, funcTestItems: f.funcTestItems.filter((_, i) => i !== idx) }))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查日期</label>
                    <input className="form-input" type="date" value={screeningForm.checkDate}
                      onChange={e => setScreeningForm(f => ({ ...f, checkDate: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">检查机构</label>
                    <input className="form-input" placeholder="如：北京协和医院" value={screeningForm.hospital}
                      onChange={e => setScreeningForm(f => ({ ...f, hospital: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">主要结论/备注</label>
                  <textarea className="form-input" rows={2} placeholder="如：未见明显异常；左叶结节3mm，建议随访" value={screeningForm.note}
                    onChange={e => setScreeningForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">上传报告（图片或 PDF，可多选）</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                    multiple
                    style={{ display: 'none' }}
                    id="screening-file-input"
                    onChange={e => {
                      const picked = Array.from(e.target.files || [])
                      setScreeningFiles(prev => [...prev, ...picked])
                      e.target.value = ''
                    }}
                  />
                  <div style={{ marginTop: 4 }}>
                    <label htmlFor="screening-file-input" style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: 8, border: '1px solid #E0D9CE', background: '#fff', fontSize: 13, color: '#4A6558', display: 'inline-block' }}>
                      + 选择文件
                    </label>
                    {screeningFiles.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {screeningFiles.map((f, i) => (
                          <span key={i} style={{ fontSize: 12, color: '#1E6B50', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {f.type === 'application/pdf' ? '📄' : '🖼'} {f.name}
                            <button onClick={() => setScreeningFiles(prev => prev.filter((_, j) => j !== i))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC3545', fontSize: 12, padding: 0 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {screeningFiles.length === 0 && <span style={{ fontSize: 12, color: '#8AA89C', marginLeft: 10 }}>未选择文件</span>}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowScreeningForm(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleSaveScreeningRecord} disabled={screeningSaving}>
                  {screeningSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 体检关键指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">体检关键指标</div>
            {!editingLabValues ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setLabNewRecord(false); setLabForm(user.labValues || {}); setEditingLabValues(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setLabNewRecord(true); setLabForm({}); setEditingLabValues(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {labNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增复查记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveLabValues}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingLabValues(false); setLabNewRecord(false); setLabForm(user.labValues || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingLabValues ? (
              <div>
                <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>填写最近一次体检结果（用于健康评分，留空表示正常）</div>
                <div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>体征 / 血压</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="体重" unit="kg" placeholder="如 65" value={labForm.weight || ''} onChange={e => setLabForm(f => ({ ...f, weight: e.target.value }))} />
                    <LabField label="收缩压 SBP" unit="mmHg" placeholder="如 120" value={labForm.sbp || ''} onChange={e => setLabForm(f => ({ ...f, sbp: e.target.value }))} />
                    <LabField label="舒张压 DBP" unit="mmHg" placeholder="如 80" value={labForm.dbp || ''} onChange={e => setLabForm(f => ({ ...f, dbp: e.target.value }))} />
                    <LabField label="腰围" unit="cm" placeholder="如 80" value={labForm.waist || ''} onChange={e => setLabForm(f => ({ ...f, waist: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>血糖 / 血脂</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="空腹血糖 FPG" unit="mmol/L" placeholder="如 5.6" value={labForm.fpg || ''} onChange={e => setLabForm(f => ({ ...f, fpg: e.target.value }))} />
                    <LabField label="糖化血红蛋白 HbA1c" unit="%" placeholder="如 5.4" value={labForm.hba1c || ''} onChange={e => setLabForm(f => ({ ...f, hba1c: e.target.value }))} />
                    <LabField label="总胆固醇 TC" unit="mmol/L" placeholder="如 4.8" value={labForm.tc || ''} onChange={e => setLabForm(f => ({ ...f, tc: e.target.value }))} />
                    <LabField label="低密度脂蛋白 LDL-C" unit="mmol/L" placeholder="如 2.8" value={labForm.ldl || ''} onChange={e => setLabForm(f => ({ ...f, ldl: e.target.value }))} />
                    <LabField label="高密度脂蛋白 HDL-C" unit="mmol/L" placeholder="如 1.3" value={labForm.hdl || ''} onChange={e => setLabForm(f => ({ ...f, hdl: e.target.value }))} />
                    <LabField label="甘油三酯 TG" unit="mmol/L" placeholder="如 1.2" value={labForm.tg || ''} onChange={e => setLabForm(f => ({ ...f, tg: e.target.value }))} />
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>肝肾 / 代谢</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px', marginBottom: 16 }}>
                    <LabField label="谷丙转氨酶 ALT" unit="U/L" placeholder="如 25" value={labForm.alt || ''} onChange={e => setLabForm(f => ({ ...f, alt: e.target.value }))} />
                    <LabField label="谷草转氨酶 AST" unit="U/L" placeholder="如 22" value={labForm.ast || ''} onChange={e => setLabForm(f => ({ ...f, ast: e.target.value }))} />
                    <LabField label="γ-谷氨酰转肽酶 GGT" unit="U/L" placeholder="如 30" value={labForm.ggt || ''} onChange={e => setLabForm(f => ({ ...f, ggt: e.target.value }))} />
                    <LabField label="血肌酐" unit="μmol/L" placeholder="如 75" value={labForm.cr || ''} onChange={e => setLabForm(f => ({ ...f, cr: e.target.value }))} />
                    <LabField label="尿酸 UA" unit="μmol/L" placeholder="如 350" value={labForm.ua || ''} onChange={e => setLabForm(f => ({ ...f, ua: e.target.value }))} />
                    <LabField label="同型半胱氨酸 Hcy" unit="μmol/L" placeholder="如 10" value={labForm.hcy || ''} onChange={e => setLabForm(f => ({ ...f, hcy: e.target.value }))} />
                    <LabField label="脂蛋白磷脂酶A2 Lp-PLA2" unit="ng/mL" placeholder="如 180" value={labForm.lpla2 || ''} onChange={e => setLabForm(f => ({ ...f, lpla2: e.target.value }))} />
                    <div>
                      <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>肾功能（CKD分期）</span>
                      <select className="form-control" value={labForm.ckdStage || ''}
                        onChange={e => setLabForm(f => ({ ...f, ckdStage: e.target.value }))} style={{ fontSize: 13 }}>
                        <option value="">正常/未查</option>
                        <option value="1">1期（轻度）</option>
                        <option value="2">2期（轻中度）</option>
                        <option value="3">3期（中度）</option>
                        <option value="4">4期（重度）</option>
                        <option value="5">5期（终末期）</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8, fontWeight: 600 }}>超声</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 16 }}>
                    <LabTextarea label="肝脏超声" placeholder="如：脂肪肝（轻度）" value={labForm.liverUs || ''} onChange={e => setLabForm(f => ({ ...f, liverUs: e.target.value }))} />
                    <LabTextarea label="颈动脉超声" placeholder="如：内膜增厚，IMT 0.9mm" value={labForm.carotiUs || ''} onChange={e => setLabForm(f => ({ ...f, carotiUs: e.target.value }))} />
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>检测日期</span>
                    <input className="form-control" type="date" value={labForm.labDate || ''}
                      onChange={e => setLabForm(f => ({ ...f, labDate: e.target.value }))} style={{ fontSize: 13, width: 200 }} />
                  </div>
                </div>
              </div>
            ) : (() => {
              // ── 从专项筛查 reportItems 派生指标值 ──
              // 按检查日期倒序，每个 key 取最新一条
              const REPORT_KEY_MAP = {
                fpg:   ['空腹血糖','空腹葡萄糖','GLU','FPG','Glu(空腹)'],
                hba1c: ['糖化血红蛋白','HbA1c','HBA1C','HbA1c(%)'],
                tc:    ['总胆固醇','TC','CHOL','胆固醇'],
                tg:    ['甘油三酯','TG','三酰甘油','TRIG'],
                ldl:   ['低密度脂蛋白','LDL','LDL-C','LDL-胆固醇'],
                hdl:   ['高密度脂蛋白','HDL','HDL-C','HDL-胆固醇'],
                alt:   ['谷丙转氨酶','ALT','丙氨酸转氨酶','丙氨酸氨基转移酶'],
                ast:   ['谷草转氨酶','AST','天冬氨酸转氨酶','门冬氨酸氨基转移酶'],
                ggt:   ['γ-谷氨酰转肽酶','GGT','γ-GT','γGT','谷氨酰转肽酶'],
                ua:    ['尿酸','UA','SUA'],
                cr:    ['血肌酐','肌酐','CREA','Cr','Scr'],
                hcy:   ['同型半胱氨酸','Hcy','HCY'],
                lpla2: ['Lp-PLA2','脂蛋白磷脂酶A2','LPLA2'],
                sbp:   ['收缩压','SBP','收缩压(mmHg)'],
                dbp:   ['舒张压','DBP','舒张压(mmHg)'],
                weight:['体重','Weight','BW'],
              }
              // 超声：按标题匹配整条报告的 note
              const US_TITLE_MAP = {
                liverUs:  ['肝脏超声','肝胆超声','腹部超声','肝脏彩超','肝胆彩超'],
                carotiUs: ['颈动脉超声','颈动脉彩超','颈部血管超声'],
              }
              // 排序报告（最新在前）
              const sortedReports = [...screeningReports].sort((a, b) =>
                new Date(b.checkDate || b.createdAt || 0) - new Date(a.checkDate || a.createdAt || 0)
              )
              // 从 reportItems 派生数值指标
              const derived = {}
              for (const [key, names] of Object.entries(REPORT_KEY_MAP)) {
                for (const report of sortedReports) {
                  const item = (report.reportItems || []).find(ri =>
                    names.some(n => ri.name && ri.name.includes(n))
                  )
                  if (item && item.value) {
                    derived[key] = {
                      value: item.value,
                      unit: item.unit || '',
                      date: report.checkDate || report.date || '',
                      source: report.title || '专项筛查',
                      abnormal: item.status === 'abnormal',
                    }
                    break
                  }
                }
              }
              // 从报告标题派生超声文字
              for (const [key, titles] of Object.entries(US_TITLE_MAP)) {
                for (const report of sortedReports) {
                  if (titles.some(t => (report.title || '').includes(t))) {
                    const text = report.note || (report.reportItems || []).map(ri => ri.name + (ri.value ? '：' + ri.value : '')).join('；')
                    if (text) {
                      derived[key] = { value: text, date: report.checkDate || '', source: report.title }
                      break
                    }
                  }
                }
              }

              // 合并：labValues 优先（手动录入），derived 作为来源补充展示
              const lv = user.labValues || {}
              const history = user.labHistory || []
              const gender = user.gender === '女' ? 'F' : 'M'
              const ABNORMAL_KEYWORDS = ['异常','增生','结节','增厚','囊肿','脂肪肝','钙化','斑块','狭窄','病变','硬化','肿大','回声','低回声']

              // 17 项指标定义：key / label / unit / 判断函数
              const LAB_DEFS = [
                { key: 'weight',  label: '体重',           unit: 'kg',     check: () => null },  // 个体化，仅展示
                { key: 'sbp',     label: '收缩压',          unit: 'mmHg',   check: v => parseFloat(v) >= 130 },
                { key: 'dbp',     label: '舒张压',          unit: 'mmHg',   check: v => parseFloat(v) >= 80 },
                { key: 'fpg',     label: '空腹血糖',        unit: 'mmol/L', check: v => parseFloat(v) > 6.1,  ref: '≤6.1' },
                { key: 'hba1c',   label: 'HbA1c',          unit: '%',      check: v => parseFloat(v) >= 6.5,  ref: '<6.5' },
                { key: 'tc',      label: '总胆固醇 TC',     unit: 'mmol/L', check: v => parseFloat(v) >= 5.2,  ref: '<5.2' },
                { key: 'tg',      label: '甘油三酯 TG',     unit: 'mmol/L', check: v => parseFloat(v) >= 1.7,  ref: '<1.7' },
                { key: 'ldl',     label: 'LDL-C',          unit: 'mmol/L', check: v => parseFloat(v) >= 3.4,  ref: '<3.4' },
                { key: 'hdl',     label: 'HDL-C',          unit: 'mmol/L', check: v => parseFloat(v) < (gender === 'F' ? 1.3 : 1.0), ref: gender === 'F' ? '≥1.3' : '≥1.0' },
                { key: 'ua',      label: '尿酸 UA',         unit: 'μmol/L', check: v => parseFloat(v) > (gender === 'F' ? 360 : 420), ref: gender === 'F' ? '≤360' : '≤420' },
                { key: 'cr',      label: '血肌酐',           unit: 'μmol/L', check: v => parseFloat(v) > (gender === 'F' ? 97 : 106),  ref: gender === 'F' ? '≤97' : '≤106' },
                { key: 'alt',     label: 'ALT',             unit: 'U/L',    check: v => parseFloat(v) > 40,    ref: '≤40' },
                { key: 'ast',     label: 'AST',             unit: 'U/L',    check: v => parseFloat(v) > 40,    ref: '≤40' },
                { key: 'ggt',     label: 'GGT',             unit: 'U/L',    check: v => parseFloat(v) > 50,    ref: '≤50' },
                { key: 'hcy',     label: '同型半胱氨酸 Hcy', unit: 'μmol/L', check: v => parseFloat(v) > 15,    ref: '≤15' },
                { key: 'lpla2',   label: 'Lp-PLA2',         unit: 'ng/mL',  check: v => parseFloat(v) > 200,   ref: '≤200' },
                { key: 'liverUs', label: '肝脏超声',         unit: '',       isText: true, check: v => ABNORMAL_KEYWORDS.some(kw => v.includes(kw)) },
                { key: 'carotiUs',label: '颈动脉超声',       unit: '',       isText: true, check: v => ABNORMAL_KEYWORDS.some(kw => v.includes(kw)) },
              ]

              // 只从专项筛查派生值，不读 labValues
              const getVal = (key) => {
                if (derived[key]) return { val: derived[key].value, sourceLabel: derived[key].source || '筛查', date: derived[key].date || '' }
                return null
              }

              // 趋势：从所有筛查报告里按时间收集该 key 的历次值（旧→新）
              const trendData = (key) => {
                const names = REPORT_KEY_MAP[key] || []
                if (!names.length) return []
                const pts = []
                ;[...sortedReports].reverse().forEach(report => {
                  const item = (report.reportItems || []).find(ri => names.some(n => ri.name && ri.name.includes(n)))
                  if (item && item.value && parseFloat(item.value)) {
                    const d = report.checkDate || report.date || ''
                    const dateStr = d ? new Date(d).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '?'
                    pts.push({ x: dateStr, y: parseFloat(item.value) })
                  }
                })
                return pts
              }

              // 有值的项（仅筛查派生）
              const filledDefs = LAB_DEFS.filter(d => getVal(d.key) !== null)
              const abnormalDefs = filledDefs.filter(d => {
                const v = getVal(d.key)
                return v && d.check && d.check(v.val)
              })
              const hasData = filledDefs.length > 0

              // 展示的项（默认只显示异常，有体重就加上）
              const displayDefs = showAllLab ? filledDefs : [
                ...abnormalDefs,
                ...(getVal('weight') ? [LAB_DEFS.find(d => d.key === 'weight')] : []),
              ].filter((d, i, arr) => d && arr.findIndex(x => x && x.key === d.key) === i)

              if (!hasData) return (
                <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
                  暂无筛查指标数据，请在「专项筛查结果」中录入报告项目
                </div>
              )

              return (
                <div>
                  {/* 摘要行 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {abnormalDefs.length > 0
                        ? <span style={{ fontSize: 13, fontWeight: 600, color: '#DC3545' }}>⚠️ {abnormalDefs.length} 项异常</span>
                        : <span style={{ fontSize: 13, color: '#22A06B', fontWeight: 600 }}>✓ 所有指标正常</span>}
                      <span style={{ fontSize: 12, color: '#aaa' }}>来自专项筛查，共 {filledDefs.length} 项</span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAllLab(s => !s)}>
                      {showAllLab ? '只看异常' : `查看全部 ${filledDefs.length} 项`}
                    </button>
                  </div>

                  {displayDefs.length === 0 && !showAllLab && (
                    <div style={{ fontSize: 13, color: '#22A06B', textAlign: 'center', padding: '12px 0' }}>✓ 所有指标均在正常范围内</div>
                  )}

                  {/* 数值指标卡片 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 12px' }}>
                    {displayDefs.filter(d => d && !d.isText).map(d => {
                      const cur = getVal(d.key)
                      if (!cur) return null
                      const { val, sourceLabel, date } = cur
                      const isAbnormal = d.check && d.check(val)
                      const pts = trendData(d.key)
                      const bgColor = isAbnormal ? '#FEF2F2' : d.key === 'weight' ? '#f9f7f3' : '#f0faf5'
                      const borderColor = isAbnormal ? '#DC3545' : d.key === 'weight' ? '#aaa' : '#22A06B'
                      const textColor = isAbnormal ? '#DC3545' : '#1A2B24'
                      return (
                        <div key={d.key} style={{ padding: '10px 12px', background: bgColor, borderRadius: 8, borderLeft: `3px solid ${borderColor}` }}>
                          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{d.label}</span>
                            {d.ref && <span style={{ color: isAbnormal ? '#DC354560' : '#8AA89C' }}>参考 {d.ref}</span>}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: textColor }}>
                            {val} <span style={{ fontSize: 11, fontWeight: 400, color: '#8AA89C' }}>{d.unit}</span>
                          </div>
                          {sourceLabel && <div style={{ fontSize: 10, color: '#8AA89C', marginTop: 2 }}>{sourceLabel}{date ? `  ${date}` : ''}</div>}
                          {pts.length >= 2 && (
                            <div style={{ marginTop: 4 }}>
                              <MiniTrendChart data={pts} color={borderColor} label="" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* 文字指标（超声） */}
                  {(() => {
                    const textDefs = displayDefs.filter(d => d && d.isText)
                    if (!textDefs.length) return null
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 8 }}>
                        {textDefs.map(d => {
                          const cur = getVal(d.key)
                          if (!cur) return null
                          const { val, sourceLabel, date } = cur
                          const isAbnormal = d.check && d.check(val)
                          return (
                            <div key={d.key} style={{ padding: '8px 12px', background: isAbnormal ? '#FEF2F2' : '#f9f7f3', borderRadius: 8, borderLeft: `3px solid ${isAbnormal ? '#DC3545' : '#aaa'}` }}>
                              <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                                <span>{d.label}</span>
                                <span style={{ fontSize: 10 }}>{sourceLabel}{date ? `  ${date}` : ''}</span>
                              </div>
                              <div style={{ fontSize: 13, color: isAbnormal ? '#DC3545' : '#1A2B24', fontWeight: isAbnormal ? 600 : 400 }}>{val}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {lv.labDate && <div style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>检测日期：{lv.labDate}</div>}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 4.2 身体成分指标 ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">身体成分指标</div>
            {!editingBodyComp ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}); setEditingBodyComp(true) }}>编辑当前</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setBodyCompNewRecord(true); setBodyCompForm({}); setEditingBodyComp(true) }}>+ 新增记录</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {bodyCompNewRecord && <span style={{ fontSize: 12, color: '#1E6B50', fontWeight: 600 }}>新增测量记录</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSaveBodyComp}>保存</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditingBodyComp(false); setBodyCompNewRecord(false); setBodyCompForm(user.bodyComposition || {}) }}>取消</button>
              </div>
            )}
          </div>
          <div style={{ padding: '12px 20px' }}>
            {editingBodyComp ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                {[
                  { label: '骨骼肌量', field: 'skelMuscle', unit: 'kg', placeholder: '如 28.5' },
                  { label: '内脏脂肪等级/指数', field: 'visceralFat', unit: '', placeholder: '如 9级 或 指数110' },
                  { label: '体脂率', field: 'bodyFatRate', unit: '%', placeholder: '如 25.3' },
                ].map(({ label, field, unit, placeholder }) => (
                  <div key={field}>
                    <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>{label}{unit ? ` (${unit})` : ''}</span>
                    <input className="form-control" value={bodyCompForm[field] || ''} placeholder={placeholder}
                      onChange={e => setBodyCompForm(f => ({ ...f, [field]: e.target.value }))} style={{ fontSize: 13 }} />
                  </div>
                ))}
                <div>
                  <span style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 3 }}>测量日期</span>
                  <input className="form-control" type="date" value={bodyCompForm.measuredAt || ''}
                    onChange={e => setBodyCompForm(f => ({ ...f, measuredAt: e.target.value }))} style={{ fontSize: 13 }} />
                </div>
              </div>
            ) : (
              <div>
                {user.bodyComposition && (user.bodyComposition.skelMuscle || user.bodyComposition.visceralFat || user.bodyComposition.bodyFatRate) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 16px' }}>
                    {[
                      ['骨骼肌量', user.bodyComposition.skelMuscle, 'kg'],
                      ['内脏脂肪', user.bodyComposition.visceralFat, ''],
                      ['体脂率', user.bodyComposition.bodyFatRate, '%'],
                    ].filter(([,v]) => v != null && v !== '').map(([label, val, unit]) => (
                      <div key={label} style={{ padding: '6px 10px', background: '#f9f7f3', borderRadius: 8, borderLeft: '3px solid #1E6B50' }}>
                        <div style={{ fontSize: 11, color: '#8AA89C' }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{val}{unit && <span style={{ fontSize: 11, fontWeight: 400 }}> {unit}</span>}</div>
                      </div>
                    ))}
                    {user.bodyComposition.measuredAt && (
                      <div style={{ fontSize: 12, color: '#aaa', gridColumn: 'span 3', marginTop: 4 }}>测量日期：{user.bodyComposition.measuredAt}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>暂无身体成分数据，点击「编辑」录入</div>
                )}
                {/* 历史记录 */}
                {!editingBodyComp && (user.bodyCompHistory || []).length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0ece4', paddingTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 8 }}>历史记录（{(user.bodyCompHistory || []).length} 条）</div>
                    {[...(user.bodyCompHistory || [])].reverse().map((h, i) => {
                      const realIndex = (user.bodyCompHistory || []).length - 1 - i;
                      const isEditingThis = editingHistoryIndex === realIndex;
                      return (
                        <div key={i} style={{ fontSize: 12, color: '#4A6558', padding: '6px 0', borderBottom: '1px solid #f9f7f3' }}>
                          {isEditingThis ? (
                            <div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                                {[
                                  { label: '骨骼肌量(kg)', field: 'skelMuscle' },
                                  { label: '内脏脂肪', field: 'visceralFat' },
                                  { label: '体脂率(%)', field: 'bodyFatRate' },
                                ].map(({ label, field }) => (
                                  <div key={field}>
                                    <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 2 }}>{label}</div>
                                    <input className="form-control" style={{ fontSize: 12, padding: '3px 6px' }}
                                      value={historyEditForm[field] || ''}
                                      onChange={e => setHistoryEditForm(f => ({ ...f, [field]: e.target.value }))} />
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <div style={{ fontSize: 11, color: '#8AA89C' }}>测量日期</div>
                                <input className="form-control" type="date" style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
                                  value={historyEditForm.measuredAt || ''}
                                  onChange={e => setHistoryEditForm(f => ({ ...f, measuredAt: e.target.value }))} />
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={async () => {
                                  await staffAPI.editBodyCompHistory(id, realIndex, historyEditForm);
                                  setEditingHistoryIndex(null);
                                  load();
                                  toast('记录已更新');
                                }}>保存</button>
                                <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => setEditingHistoryIndex(null)}>取消</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ color: '#aaa', minWidth: 90 }}>{h.measuredAt || (h.recordedAt ? new Date(h.recordedAt).toLocaleDateString('zh-CN') : '-')}</span>
                              {h.skelMuscle && <span>骨骼肌: {h.skelMuscle}kg</span>}
                              {h.visceralFat && <span>内脏脂肪: {h.visceralFat}</span>}
                              {h.bodyFatRate && <span>体脂率: {h.bodyFatRate}%</span>}
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                <button style={{ fontSize: 11, color: '#1E6B50', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                  onClick={() => { setEditingHistoryIndex(realIndex); setHistoryEditForm({ ...h }); }}>编辑</button>
                                <button style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                                  onClick={async () => {
                                    if (!window.confirm('确定删除这条记录？')) return;
                                    await staffAPI.deleteBodyCompHistory(id, realIndex);
                                    load();
                                    toast('记录已删除');
                                  }}>删除</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 慢病分级 ── */}
        {user.chronicDiseases?.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div className="card-title">慢病分级（用于评分）</div>
              {!editingDiseaseSeverity
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditingDiseaseSeverity(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveDiseaseSeverity}>保存</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditingDiseaseSeverity(false); setSeverityForm(user.chronicDiseaseSeverity || {}) }}>取消</button>
                  </div>
              }
            </div>
            <div style={{ padding: '12px 20px' }}>
              <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 10 }}>设置每种慢性病的严重程度，影响基础健康分扣分幅度</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                {user.chronicDiseases.map(disease => (
                  <div key={disease}>
                    <div style={{ fontSize: 13, color: '#1A2B24', fontWeight: 500, marginBottom: 4 }}>{disease}</div>
                    {editingDiseaseSeverity ? (
                      <select className="form-control" style={{ fontSize: 13 }}
                        value={severityForm[disease] || 1}
                        onChange={e => setSeverityForm(f => ({ ...f, [disease]: parseInt(e.target.value) }))}>
                        <option value={1}>一级（早/轻症，无并发症）</option>
                        <option value={2}>二级（中症，有并发症风险）</option>
                        <option value={3}>三级（重症/终末期）</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 13, color: '#4A6558' }}>
                        {['一级（轻症）','二级（中症）','三级（重症）'][(user.chronicDiseaseSeverity?.[disease] || 1) - 1]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 健康趋势图 */}
        {(() => {
          const srcRecords = trendRecords ?? recentRecords ?? [];
          const TYPE_COLORS = { bloodPressure: '#DC3545', bloodSugar: '#D97706', weight: '#0077B6', heartRate: '#7C3AED', sleep: '#059669', mood: '#B45309' };

          const buildCharts = (records) => {
            const byType = {};
            records.forEach(r => {
              if (!byType[r.type]) byType[r.type] = [];
              const dateStr = new Date(r.recordedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
              let y = r.type === 'bloodPressure' ? (r.extra?.sys || 0) : parseFloat(r.value) || 0;
              if (y > 0) byType[r.type].push({ x: dateStr, y });
            });
            return Object.entries(byType).filter(([, arr]) => arr.length >= 2).reverse();
          };

          const charts = buildCharts(srcRecords);

          const loadTrend = async () => {
            setTrendLoading(true);
            try {
              const params = { limit: 500 };
              if (trendStartDate) params.startDate = trendStartDate;
              if (trendEndDate) params.endDate = trendEndDate;
              const res = await staffAPI.getPatientHealthRecords(id, params);
              setTrendRecords(res.data || []);
            } catch { /* ignore */ }
            finally { setTrendLoading(false); }
          };

          const exportCSV = () => {
            const rows = [['日期', '类型', '数值', '单位']];
            srcRecords.forEach(r => {
              const date = new Date(r.recordedAt).toLocaleString('zh-CN');
              const label = RECORD_TYPE_LABEL[r.type] || r.type;
              const val = r.type === 'bloodPressure' ? `${r.extra?.sys || ''}/${r.extra?.dia || ''}` : (r.value || '');
              rows.push([date, label, val, r.unit || '']);
            });
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `健康数据_${user.name || id}_${new Date().toLocaleDateString('zh-CN')}.csv`;
            a.click();
          };

          const downloadCharts = () => {
            const wrap = document.getElementById('trend-chart-wrap');
            if (!wrap) return;
            const svgs = wrap.querySelectorAll('svg');
            if (!svgs.length) return;
            // 合并所有 SVG 为一个并下载
            const W = 280, rowH = 120, pad = 16;
            const total = svgs.length;
            const svgContent = Array.from(svgs).map((svg, i) => {
              const inner = svg.innerHTML;
              return `<g transform="translate(0,${i * rowH})">${inner}</g>`;
            }).join('');
            const combined = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total * rowH + pad}" style="background:#faf9f6">${svgContent}</svg>`;
            const blob = new Blob([combined], { type: 'image/svg+xml' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `趋势图_${user.name || id}_${new Date().toLocaleDateString('zh-CN')}.svg`;
            a.click();
          };

          return (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div className="card-title">健康数据趋势</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input type="date" className="form-control" style={{ width: 136, fontSize: 12, padding: '4px 8px' }}
                    value={trendStartDate} onChange={e => setTrendStartDate(e.target.value)} placeholder="开始日期" />
                  <span style={{ fontSize: 12, color: '#aaa' }}>—</span>
                  <input type="date" className="form-control" style={{ width: 136, fontSize: 12, padding: '4px 8px' }}
                    value={trendEndDate} onChange={e => setTrendEndDate(e.target.value)} placeholder="结束日期" />
                  <button className="btn btn-primary btn-sm" onClick={loadTrend} disabled={trendLoading}>
                    {trendLoading ? '加载中…' : '查询'}
                  </button>
                  {srcRecords.length > 0 && <>
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV} title="导出 CSV">导出数据</button>
                    {charts.length > 0 && <button className="btn btn-secondary btn-sm" onClick={downloadCharts} title="下载趋势图">下载图表</button>}
                  </>}
                </div>
              </div>
              {trendLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>加载中…</div>
              ) : charts.length >= 1 ? (
                <div id="trend-chart-wrap" style={{ padding: '12px 16px', overflowX: 'auto' }}>
                  {charts.map(([type, arr]) => (
                    <MiniTrendChart key={type} data={[...arr].reverse()} color={TYPE_COLORS[type] || '#1E6B50'} label={RECORD_TYPE_LABEL[type] || type} />
                  ))}
                </div>
              ) : (
                <div style={{ padding: '16px 20px', fontSize: 13, color: '#aaa' }}>
                  {trendRecords !== null ? '所选时间段内无趋势数据（需同类型至少2条记录）' : '选择时间段后点击查询，或查看默认最近30条数据'}
                </div>
              )}
            </div>
          );
        })()}

        {/* 日常健康打卡数据 */}
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><div className="card-title">日常健康打卡数据（最近30条）</div></div>
          {recentRecords?.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>数值 / 备注</th>
                  <th>图片</th>
                  <th>记录时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map(r => {
                  const imgUrl = r.imageUrl || r.extra?.imageUrl || ''
                  return (
                    <tr key={r._id}>
                      <td><span className="badge badge-info">{RECORD_TYPE_LABEL[r.type] || r.type}</span></td>
                      <td>{formatRecordValue(r)}</td>
                      <td>
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt="打卡图片"
                            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid #E0D9CE' }}
                            onClick={() => setPreviewImageUrl(imgUrl)}
                          />
                        ) : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ color: '#8AA89C', fontSize: 13 }}>
                        {new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康打卡记录</div>
          )}
        </div>
        </>
      )}

      {/* ── AI Tab ── */}
      {tab === 'ai' && (() => {
        const ais = user.aiHealthSummary || {}
        const hasData = ais.trend || ais.risks || ais.plan
        return (
          <div>
            {/* AI汇总分析 */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">AI汇总分析</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!editingAISummary && hasData && (
                    <button className="btn btn-secondary btn-sm" onClick={() => { setAiSummaryForm({ ...ais }); setEditingAISummary(true) }}>编辑</button>
                  )}
                  {editingAISummary && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingAISummary(false)}>取消</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleSaveAISummary(false)}>保存草稿</button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISummary(true)}>审核确认</button>
                    </>
                  )}
                  <button className="btn btn-primary btn-sm" disabled={aiSummaryLoading} onClick={handleGenerateAISummary}>
                    {aiSummaryLoading ? '生成中...' : (hasData ? '重新生成' : '生成AI分析')}
                  </button>
                </div>
              </div>
              <div style={{ padding: '12px 20px' }}>
                {hasData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {ais.approvedAt && (
                      <div style={{ fontSize: 12, color: '#22A06B', background: '#E8F5EF', borderRadius: 6, padding: '4px 10px' }}>
                        ✓ 已审核确认 {ais.approvedBy && `by ${ais.approvedBy}`} · {new Date(ais.approvedAt).toLocaleDateString('zh-CN')}
                      </div>
                    )}
                    {[
                      { key: 'trend', label: 'AI汇总分析：健康趋势', color: '#0077B6' },
                      { key: 'risks', label: 'AI汇总分析：风险提示', color: '#DC3545' },
                    ].map(({ key, label, color }) => (
                      <div key={key}>
                        <div style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        {editingAISummary ? (
                          <textarea className="form-control" rows={4} value={aiSummaryForm[key] || ''}
                            onChange={e => setAiSummaryForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ fontSize: 13 }} />
                        ) : (
                          <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.7, background: '#f9f7f3', borderRadius: 8, padding: '8px 12px', whiteSpace: 'pre-wrap', borderLeft: `3px solid ${color}` }}>
                            {ais[key]}
                          </div>
                        )}
                      </div>
                    ))}
                    {ais.generatedAt && (
                      <div style={{ fontSize: 12, color: '#aaa' }}>生成时间：{new Date(ais.generatedAt).toLocaleString('zh-CN')}</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                    点击「生成AI分析」，自动读取体检指标和健康档案，生成健康趋势分析和风险提示
                  </div>
                )}
              </div>
            </div>

            {/* AI管理方案 */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">AI管理方案</div>
                {!editingAISummary && hasData && ais.plan && (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setAiSummaryForm({ ...ais }); setEditingAISummary(true) }}>编辑方案</button>
                )}
              </div>
              <div style={{ padding: '12px 20px' }}>
                {ais.plan ? (
                  <div>
                    {editingAISummary ? (
                      <textarea className="form-control" rows={8} value={aiSummaryForm.plan || ''}
                        onChange={e => setAiSummaryForm(f => ({ ...f, plan: e.target.value }))}
                        style={{ fontSize: 13 }} />
                    ) : (
                      <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.8, background: '#f9f7f3', borderRadius: 8, padding: '12px 16px', whiteSpace: 'pre-wrap', borderLeft: '3px solid #1E6B50' }}>
                        {ais.plan}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 10 }}>
                      家庭医师/营养师审核确认后方案生效，供客户查阅。
                    </div>
                    {editingAISummary && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingAISummary(false)}>取消</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSaveAISummary(false)}>保存草稿</button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSaveAISummary(true)}>审核确认</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                    请先在「AI汇总分析」中点击「生成AI分析」，系统同步生成管理方案初稿，家庭医师/营养师审核确认后生效。
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Medications Tab ── */}
      {tab === 'medications' && (
        <div>
          {/* 子 tab 切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[{ key: 'med', label: '💊 药物管理' }, { key: 'sup', label: '🥗 营养素管理' }].map(t => (
              <button key={t.key}
                className={`btn btn-sm ${medSubTab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMedSubTab(t.key)}>{t.label}</button>
            ))}
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
              onClick={() => { if (medSubTab === 'med') { setMedForm({ name:'', brandName:'', dosage:'', method:'口服', frequency:'每日1次', timing:'', startDate:'', endDate:'', purpose:'', note:'' }); setEditingMed(null); setShowMedModal(true) } else { setSupForm({ name:'', brand:'', dosage:'', method:'随餐', frequency:'每日1次', startDate:'', endDate:'', purpose:'', note:'' }); setEditingSup(null); setShowSupModal(true) } }}>
              ＋ 新增{medSubTab === 'med' ? '药物' : '营养素'}
            </button>
          </div>

          {medSubTab === 'med' && (
            <div className="card" style={{ padding: 0 }}>
              {medications.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无用药记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>药品名称（化学名）</th><th>商品名</th><th>剂量</th><th>用法/频次</th><th>服用目的</th><th>开始日期</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {medications.map(m => (
                      <tr key={m._id}>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        <td style={{ color: '#666' }}>{m.brandName || '-'}</td>
                        <td>{m.dosage}</td>
                        <td style={{ fontSize: 12 }}>{m.method} · {m.frequency}{m.timing ? ` · ${m.timing}` : ''}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{m.purpose || m.note || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{m.startDate || '-'}{m.endDate ? ` → ${m.endDate}` : ''}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: m.stopped ? '#aaa' : '#22A06B' }}>
                            {m.stopped ? '已停用' : '服用中'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                              setMedForm({ name: m.name, brandName: m.brandName || '', dosage: m.dosage, method: m.method || '口服', frequency: m.frequency, timing: m.timing || '', startDate: m.startDate || '', endDate: m.endDate || '', purpose: m.purpose || '', note: m.note || '' })
                              setEditingMed(m._id); setShowMedModal(true)
                            }}>编辑</button>
                            {!m.stopped && (
                              <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                onClick={async () => { if (window.confirm('确认停用此药物？')) { await staffAPI.updatePatientMedication(id, m._id, { stopped: true }); loadMedications() } }}>
                                停用
                              </button>
                            )}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => { if (window.confirm('确认删除？')) { await staffAPI.deletePatientMedication(id, m._id); loadMedications() } }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {medSubTab === 'sup' && (
            <div className="card" style={{ padding: 0 }}>
              {supplements.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无营养素记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>营养素名称</th><th>品牌</th><th>剂量</th><th>用法/频次</th><th>补充目的</th><th>开始日期</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {supplements.map(s => (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td style={{ color: '#666' }}>{s.brand || '-'}</td>
                        <td>{s.dosage}</td>
                        <td style={{ fontSize: 12 }}>{s.method} · {s.frequency}</td>
                        <td style={{ fontSize: 12, color: '#4A6558' }}>{s.purpose || s.note || '-'}</td>
                        <td style={{ fontSize: 12, color: '#8AA89C' }}>{s.startDate || '-'}{s.endDate ? ` → ${s.endDate}` : ''}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: s.stopped ? '#aaa' : '#22A06B' }}>
                            {s.stopped ? '已停用' : '补充中'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => {
                              setSupForm({ name: s.name, brand: s.brand || '', dosage: s.dosage, method: s.method || '随餐', frequency: s.frequency, startDate: s.startDate || '', endDate: s.endDate || '', purpose: s.purpose || '', note: s.note || '' })
                              setEditingSup(s._id); setShowSupModal(true)
                            }}>编辑</button>
                            {!s.stopped && (
                              <button className="btn btn-sm" style={{ background: '#fff8e1', color: '#D97706', border: '1px solid #D97706' }}
                                onClick={async () => { if (window.confirm('确认停用？')) { await staffAPI.updatePatientSupplement(id, s._id, { stopped: true }); loadSupplements() } }}>
                                停用
                              </button>
                            )}
                            <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                              onClick={async () => { if (window.confirm('确认删除？')) { await staffAPI.deletePatientSupplement(id, s._id); loadSupplements() } }}>
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 新增/编辑药物弹窗 */}
          {showMedModal && (
            <div className="modal-overlay" onClick={() => setShowMedModal(false)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingMed ? '编辑药物' : '新增药物'}</h3>
                  <button className="modal-close" onClick={() => setShowMedModal(false)}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '药品化学名 *', full: false, placeholder: '如：苯磺酸氨氯地平' },
                    { k: 'brandName', label: '商品名', full: false, placeholder: '如：络活喜' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：5mg' },
                    { k: 'method', label: '用药方式', full: false, placeholder: '如：口服' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'timing', label: '服药时机', full: false, placeholder: '如：早饭后' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '用药目的', full: true, placeholder: '如：控制血压' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={medForm[k] || ''}
                        onChange={e => setMedForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowMedModal(false)}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!medForm.name || !medForm.dosage || !medForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      if (editingMed) await staffAPI.updatePatientMedication(id, editingMed, medForm)
                      else await staffAPI.createPatientMedication(id, medForm)
                      setShowMedModal(false); loadMedications()
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
          )}

          {/* 新增/编辑营养素弹窗 */}
          {showSupModal && (
            <div className="modal-overlay" onClick={() => setShowSupModal(false)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">{editingSup ? '编辑营养素' : '新增营养素'}</h3>
                  <button className="modal-close" onClick={() => setShowSupModal(false)}>✕</button>
                </div>
                <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { k: 'name', label: '营养素名称 *', full: false, placeholder: '如：维生素C' },
                    { k: 'brand', label: '品牌', full: false, placeholder: '如：汤臣倍健' },
                    { k: 'dosage', label: '剂量 *', full: false, placeholder: '如：500mg' },
                    { k: 'method', label: '使用方式', full: false, placeholder: '如：随餐' },
                    { k: 'frequency', label: '频次 *', full: false, placeholder: '如：每日1次' },
                    { k: 'startDate', label: '开始日期', full: false, type: 'date' },
                    { k: 'endDate', label: '计划结束日期', full: false, type: 'date' },
                    { k: 'purpose', label: '补充目的', full: true, placeholder: '如：提高免疫力' },
                    { k: 'note', label: '备注', full: true, placeholder: '注意事项' },
                  ].map(({ k, label, full, placeholder, type }) => (
                    <div key={k} className="form-group" style={{ gridColumn: full ? '1/-1' : 'auto', marginBottom: 0 }}>
                      <label className="form-label">{label}</label>
                      <input className="form-input" type={type || 'text'} placeholder={placeholder} value={supForm[k] || ''}
                        onChange={e => setSupForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setShowSupModal(false)}>取消</button>
                  <button className="btn btn-primary" disabled={medSaving} onClick={async () => {
                    if (!supForm.name || !supForm.dosage || !supForm.frequency) { toast('请填写必填项'); return }
                    setMedSaving(true)
                    try {
                      if (editingSup) await staffAPI.updatePatientSupplement(id, editingSup, supForm)
                      else await staffAPI.createPatientSupplement(id, supForm)
                      setShowSupModal(false); loadSupplements()
                    } catch (err) { toast(err.message) }
                    finally { setMedSaving(false) }
                  }}>{medSaving ? '保存中...' : '保存'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Plans Tab ── */}
      {tab === 'plans' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">管理方案</div>
          </div>
          {plans.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无管理方案</div>
          ) : (
            <table className="table">
              <thead><tr><th>方案名称</th><th>类型</th><th>状态</th><th>已阅</th><th>已确认</th><th>项目数</th><th>完成</th><th>负责人</th><th>创建时间</th></tr></thead>
              <tbody>
                {plans.map(p => {
                  const done = p.items?.filter(i => i.status === 'completed').length || 0
                  const total = p.items?.length || 0
                  return (
                    <tr key={p._id} style={{ cursor: 'pointer' }}
                      onClick={() => p.isAnnualPlan ? nav(`/patients/${id}/annual-health`) : nav(`/plans/${p._id}`)}>
                      <td style={{ fontWeight: 500, color: '#1E6B50' }}>
                        {p.title}
                        {p.isAnnualPlan && <span style={{ marginLeft: 6, fontSize: 11, color: '#1E6B50', background: '#E8F5EF', padding: '1px 6px', borderRadius: 4 }}>年度</span>}
                      </td>
                      <td><span className="badge badge-info">{PLAN_TYPE_LABEL[p.type] || p.type}</span></td>
                      <td><span style={{ color: PLAN_STATUS_COLOR[p.status], fontWeight: 500, fontSize: 13 }}>{PLAN_STATUS_LABEL[p.status]}</span></td>
                      <td>
                        {p.isAnnualPlan
                          ? <span style={{ fontSize: 12, color: '#8AA89C' }}>-</span>
                          : p.viewedAt
                            ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已阅<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.viewedAt).toLocaleDateString('zh-CN')}</span></span>
                            : <span style={{ fontSize: 12, color: '#D97706' }}>未查阅</span>
                        }
                      </td>
                      <td>
                        {p.confirmedAt
                          ? <span style={{ fontSize: 12, color: '#22A06B', fontWeight: 500 }}>✓ 已确认<br/><span style={{ color: '#aaa', fontWeight: 400 }}>{new Date(p.confirmedAt).toLocaleDateString('zh-CN')}</span></span>
                          : <span style={{ fontSize: 12, color: '#D97706' }}>待确认</span>
                        }
                      </td>
                      <td style={{ textAlign: 'center' }}>{total}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                            <div style={{ width: total ? `${(done/total)*100}%` : '0%', height: '100%', background: '#22A06B', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#666' }}>{done}/{total}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: '#666' }}>{p.staffId?.name || '-'}</td>
                      <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Follow-ups Tab ── */}
      {tab === 'followups' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">随访记录</div>
          </div>
          {followUps.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无随访记录</div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>日期</th><th>方式</th><th>状态</th><th>随访人</th><th>随访内容</th><th>下次随访</th><th>操作</th></tr>
              </thead>
              <tbody>
                {followUps.map(f => (
                  <tr key={f._id} style={{ cursor: 'pointer' }} onClick={() => setFollowUpDetail(f)}>
                    <td style={{ fontSize: 13, color: '#666' }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                    <td><span className="badge badge-info">{TYPE_MAP[f.type] || f.type}</span></td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500, color: STATUS_COLOR[f.status] || '#666' }}>
                        {STATUS_MAP[f.status] || f.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{f.staffId?.name || '-'}</td>
                    <td style={{ fontSize: 13, color: '#1A2B24', maxWidth: 200 }}>
                      {f.content ? (f.content.length > 60 ? f.content.slice(0, 60) + '…' : f.content) : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: '#8AA89C' }}>
                      {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setFollowUpDetail(f)}>查看详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 报告图片灯箱 */}
      {previewImageUrl && (
        <div onClick={() => setPreviewImageUrl(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={previewImageUrl} alt="报告" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setPreviewImageUrl(null)}
            style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Reports Tab ── */}
      {tab === 'reports' && (() => {
        const L1_COLORS = ['#7C3AED','#DC3545','#D97706','#0369A1','#0891B2','#1E6B50','#9D174D']
        const AI_COLOR = { none:'#ccc', pending:'#D97706', reviewed:'#22A06B', rejected:'#DC3545' }
        const AI_LABEL = { none:'未解析', pending:'待审核', reviewed:'已审核', rejected:'已驳回' }

        // 标题 → L1 节点映射（用 screeningTree）
        const titleToL1 = {}
        const titleL2Order = {} // title → L2 order index（用于组内排序）
        screeningTree.forEach(l1Node => {
          (l1Node.children || []).forEach((c, idx) => {
            if (!(c.label in titleToL1)) {
              titleToL1[c.label] = l1Node
              titleL2Order[c.label] = idx
            }
          })
        })

        // 按年份 → L1 分组（优先用 screeningL1 字段，旧数据 fallback 到标题匹配）
        const ANNUAL_KEY = '__annual__'
        const OTHER_KEY  = '__other__'
        const yearMap = {}
        reports.forEach(r => {
          const yr = r.reportYear || (r.date ? new Date(r.date).getFullYear() : new Date(r.createdAt).getFullYear()) || '未知'
          if (!yearMap[yr]) yearMap[yr] = {}
          const l1Node = r.screeningL1
            ? screeningTree.find(n => String(n._id) === r.screeningL1)
            : titleToL1[r.title]
          const key = l1Node ? String(l1Node._id) : (r.type === 'annual' ? ANNUAL_KEY : OTHER_KEY)
          if (!yearMap[yr][key]) yearMap[yr][key] = { node: l1Node, label: key === ANNUAL_KEY ? '年度体检报告' : null, reports: [] }
          yearMap[yr][key].reports.push(r)
        })
        const years = Object.keys(yearMap).sort((a, b) => b - a)

        // 组内按 L2 顺序排序
        const sortByTree = (rows) =>
          [...rows].sort((a, b) => {
            const ia = titleL2Order[a.title] ?? 9999
            const ib = titleL2Order[b.title] ?? 9999
            return ia !== ib ? ia - ib : (a.title || '').localeCompare(b.title || '', 'zh')
          })

        // L1 显示顺序：年度体检 → screeningTree 顺序 → 其他
        const getL1Keys = (yrData) => {
          const annualKey = yrData[ANNUAL_KEY] ? [ANNUAL_KEY] : []
          const treeKeys  = screeningTree.map(n => String(n._id)).filter(k => yrData[k])
          const otherKey  = yrData[OTHER_KEY] ? [OTHER_KEY] : []
          return [...annualKey, ...treeKeys, ...otherKey]
        }

        return (
          <div>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title">体检报告</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowUploadReport(true)}>＋ 上传报告</button>
            </div>
            {reports.length === 0 ? (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无体检报告</div>
            ) : years.map(yr => (
              <div key={yr} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1A2B24', padding: '8px 0', borderBottom: '2px solid #1E6B50', marginBottom: 12 }}>
                  📅 {yr} 年
                </div>
                {getL1Keys(yearMap[yr]).map(key => {
                  const { node: l1Node, label: grpLabel, reports: grpReports } = yearMap[yr][key]
                  const l1Label = grpLabel || l1Node?.label || '其他'
                  const l1Idx = l1Node ? screeningTree.findIndex(n => String(n._id) === key) : -1
                  const color = l1Idx >= 0 ? L1_COLORS[l1Idx % L1_COLORS.length] : '#8AA89C'
                  return (
                  <div key={key} style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #e8e4dc', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', background: '#f5f2ec', fontWeight: 700, fontSize: 13, color, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {l1Label}
                      <span style={{ fontWeight: 400, fontSize: 12, color: '#aaa', marginLeft: 4 }}>{grpReports.length} 份</span>
                    </div>
                    <table className="table" style={{ marginBottom: 0 }}>
                      <thead><tr><th>报告标题</th><th>机构</th><th>检查日期</th><th>审核状态</th><th>AI解析</th><th>操作</th></tr></thead>
                      <tbody>
                        {sortByTree(grpReports).map(r => (
                          <tr key={r._id}>
                            <td style={{ cursor: 'pointer' }} onClick={() => openReportDetail(r)}>
                              <span style={{ fontWeight: 500, color: '#1E6B50' }}>{r.title}</span>
                              {r.screeningL2 && <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 1 }}>{r.screeningL2}</div>}
                            </td>
                            <td style={{ fontSize: 12, color: '#666' }}>{r.institution || r.hospital || '-'}</td>
                            <td style={{ fontSize: 12, color: '#8AA89C' }}>{r.checkDate || r.date || '-'}</td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 500, color: r.audit_status === 'audited' ? '#22A06B' : r.audit_status === 'rejected' ? '#DC3545' : '#D97706' }}>
                                {r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, fontWeight: 600, color: AI_COLOR[r.aiStatus] || '#ccc' }}>
                                {AI_LABEL[r.aiStatus] || '—'}
                              </span>
                              {r.aiSummary && r.aiStatus === 'pending' && (
                                <div style={{ fontSize: 11, color: '#8AA89C', maxWidth: 180, marginTop: 2 }}>{r.aiSummary.slice(0, 60)}…</div>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {r.audit_status !== 'audited' && (
                                editingTitleReportId === r._id ? (
                                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                    <input style={{ fontSize: 12, padding: '2px 6px', border: '1px solid #E0D9CE', borderRadius: 4, width: 140 }}
                                      value={editingTitleValue}
                                      onChange={e => setEditingTitleValue(e.target.value)}
                                      onKeyDown={async e => {
                                        if (e.key === 'Enter') {
                                          try { await staffAPI.updateReport(r._id, { title: editingTitleValue }); setEditingTitleReportId(null); loadReports() } catch (err) { toast(err.message) }
                                        } else if (e.key === 'Escape') { setEditingTitleReportId(null) }
                                      }} autoFocus />
                                    <button className="btn btn-primary btn-sm"
                                      onClick={async () => { try { await staffAPI.updateReport(r._id, { title: editingTitleValue }); setEditingTitleReportId(null); loadReports() } catch (err) { toast(err.message) } }}>✓</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingTitleReportId(null)}>✕</button>
                                  </span>
                                ) : (
                                  <button className="btn btn-secondary btn-sm" style={{ marginRight: 4 }}
                                    onClick={() => { setEditingTitleReportId(r._id); setEditingTitleValue(r.title) }}>改标题</button>
                                )
                              )}
                              {r.aiStatus === 'pending' && (
                                <>
                                  <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }}
                                    onClick={async () => { try { await staffAPI.updateReport(r._id, { aiStatus: 'reviewed' }); loadReports() } catch (e) { toast(e.message) } }}>批准AI</button>
                                  <button className="btn btn-sm" style={{ background:'#fee', color:'#c00', border:'1px solid #fcc', marginRight: 4 }}
                                    onClick={async () => { try { await staffAPI.updateReport(r._id, { aiStatus: 'rejected' }); loadReports() } catch (e) { toast(e.message) } }}>驳回</button>
                                </>
                              )}
                              <button className="btn btn-secondary btn-sm" onClick={() => openReportDetail(r)}>查看</button>
                              {r.audit_status !== 'audited' && (
                                <button className="btn btn-sm" style={{ marginLeft: 4, background: '#fff0f0', color: '#c00', border: '1px solid #fcc' }}
                                  onClick={async () => {
                                    if (!window.confirm('确认删除这条报告记录？')) return
                                    try { await staffAPI.deleteReport(r._id); loadReports() } catch (err) { toast(err.message) }
                                  }}>删除</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Service Records Tab ── */}
      {tab === 'serviceRecords' && (() => {
        const CATS = ['营养干预', '专病管理', '医院就医', '日常随访']
        const grouped = {}
        CATS.forEach(c => { grouped[c] = [] })
        serviceRecords.forEach(r => {
          const cat = SR_CATEGORY[r.type] || '日常随访'
          grouped[cat].push(r)
        })
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {CATS.map(cat => (
              <div className="card" key={cat}>
                <div className="card-header">
                  <div className="card-title" style={{ color: SR_CATEGORY_COLOR[cat] }}>{cat}</div>
                  <span style={{ fontSize: 13, color: '#aaa' }}>{grouped[cat].length} 条</span>
                </div>
                {grouped[cat].length === 0 ? (
                  <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>暂无{cat}记录</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>类型</th><th>标题</th><th>内容摘要</th><th>负责人</th><th>日期</th></tr></thead>
                    <tbody>
                      {grouped[cat].map(r => (
                        <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => setShowSRDetail(r)}>
                          <td><span className="badge badge-success" style={{ background: SR_CATEGORY_COLOR[cat] + '20', color: SR_CATEGORY_COLOR[cat] }}>{SR_TYPE_LABEL[r.type] || r.type}</span></td>
                          <td style={{ fontWeight: 500, color: '#1E6B50' }}>{r.title || '-'}</td>
                          <td style={{ fontSize: 13, color: '#666', maxWidth: 200 }}>{r.content ? (r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content) : '-'}</td>
                          <td style={{ fontSize: 13, color: '#666' }}>{r.staffId?.name || '-'}</td>
                          <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── 转介记录 Tab ── */}
      {tab === 'referrals' && (() => {
        const REFERRAL_CAT_MAP = {
          familyDoctor:      '家庭医师转介',
          specialist:        '专科医师转介',
          nutritionist:      '营养师转介',
          tcmDoctor:         '中医师转介',
          psychologist:      '心理咨询师转介',
          rehabSpecialist:   '运动复健师转介',
          medicalAssistant:  '就医专员转介',
          healthManager:     '健管专员转介',
        }
        const REFERRAL_CAT_COLOR = {
          '家庭医师转介':   '#1E6B50',
          '专科医师转介':   '#0077B6',
          '营养师转介':     '#22A06B',
          '中医师转介':     '#8e44ad',
          '心理咨询师转介': '#D97706',
          '运动复健师转介': '#DC3545',
          '就医专员转介':   '#4A6558',
          '健管专员转介':   '#8AA89C',
        }
        const STATUS_LABEL = { pending:'待处理', accepted:'已接受', completed:'已完成', rejected:'已拒绝' }
        const STATUS_COLOR = { pending:'#D97706', accepted:'#0077B6', completed:'#22A06B', rejected:'#DC3545' }
        const CATS = ['家庭医师转介','专科医师转介','营养师转介','中医师转介','心理咨询师转介','运动复健师转介','就医专员转介','健管专员转介']
        const grouped = {}
        CATS.forEach(c => { grouped[c] = [] })
        patientReferrals.forEach(r => {
          const role = r.toStaffId?.role
          const cat = REFERRAL_CAT_MAP[role] || '就医专员转介'
          grouped[cat].push(r)
        })
        const activeCats = CATS.filter(c => grouped[c].length > 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {patientReferrals.length === 0 && (
              <div className="card" style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无转介记录</div>
            )}
            {activeCats.map(cat => {
              const isOpen = !!expandedReferralCats[cat]
              return (
              <div className="card" key={cat}>
                <div className="card-header" style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setExpandedReferralCats(prev => ({ ...prev, [cat]: !prev[cat] }))}>
                  <div className="card-title" style={{ color: REFERRAL_CAT_COLOR[cat] }}>{cat}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: '#aaa' }}>{grouped[cat].length} 条</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {grouped[cat].map((r, i) => (
                    <div key={r._id} style={{ padding: '16px 20px', borderBottom: i < grouped[cat].length - 1 ? '1px solid #f5f2ec' : 'none' }}>
                      {/* 头部：转介方向 + 状态 + 时间 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.urgency === 'urgent' && (
                            <span style={{ fontSize: 11, background: '#DC3545', color: '#fff', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>紧急</span>
                          )}
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reason}</span>
                          <span style={{ fontSize: 12, color: STATUS_COLOR[r.status], fontWeight: 600 }}>· {STATUS_LABEL[r.status]}</span>
                        </div>
                        <span style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                      {/* 转介信息 */}
                      <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 4 }}>
                        发起：<strong>{r.fromStaffId?.name}</strong> → 接收：<strong>{r.toStaffId?.name}</strong>（{r.toStaffId?.title || REFERRAL_CAT_MAP[r.toStaffId?.role] || r.toStaffId?.role}）
                      </div>
                      {r.content && <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{r.content}</div>}
                      {r.attachedHealthInfo && <AttachedHealthInfoView info={r.attachedHealthInfo} />}
                      {/* 回复 */}
                      {(r.responseAnalysis || r.responseOpinion || r.response) && (
                        <div style={{ marginTop: 10, padding: '10px 12px', background: '#f0faf5', borderRadius: 6, borderLeft: `3px solid ${REFERRAL_CAT_COLOR[cat]}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 11, color: '#8AA89C' }}>
                            {r.toStaffId?.name} 回复 · {r.respondedAt ? new Date(r.respondedAt).toLocaleDateString('zh-CN') : ''}
                          </div>
                          {r.responseAnalysis && (
                            <div>
                              <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>当前问题分析</div>
                              <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseAnalysis}</div>
                            </div>
                          )}
                          {r.responseOpinion && (
                            <div>
                              <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 2 }}>会诊意见</div>
                              <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.responseOpinion}</div>
                            </div>
                          )}
                          {r.response && !r.responseAnalysis && !r.responseOpinion && (
                            <div style={{ fontSize: 13, color: '#1A2B24' }}>{r.response}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
              </div>
            )})}
          </div>
        )
      })()}

      {/* ── Requisitions Tab ── */}
      {tab === 'requisitions' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">检查开单</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowReqModal(true)}>＋ 新建开单</button>
          </div>
          {requisitions.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#aaa' }}>暂无开单记录</div>
          ) : (
            <div style={{ padding: '0 16px 16px' }}>
              {requisitions.map(r => {
                const statusMap = { open: { label: '待上传', color: '#D97706' }, partial: { label: '部分上传', color: '#0077B6' }, completed: { label: '已完成', color: '#22A06B' }, cancelled: { label: '已取消', color: '#aaa' } }
                const sm = statusMap[r.status] || { label: r.status, color: '#aaa' }
                return (
                  <div key={r._id} style={{ marginBottom: 16, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#f5f0e8', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title || '检查开单'}</span>
                        <span style={{ fontSize: 12, marginLeft: 10, color: '#8AA89C' }}>
                          {new Date(r.createdAt).toLocaleDateString('zh-CN')} · {r.staffId?.name || '-'}开单
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: sm.color, fontWeight: 600 }}>{sm.label}</span>
                        {r.status === 'open' && (
                          <button className="btn btn-secondary btn-sm" onClick={async () => {
                            if (!window.confirm('确定取消此开单？')) return
                            try { await staffAPI.cancelRequisition(r._id); toast('已取消'); loadRequisitions() }
                            catch (e) { toast(e.message) }
                          }}>取消</button>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      {r.notes && <div style={{ fontSize: 13, color: '#4A6558', marginBottom: 8 }}>备注：{r.notes}</div>}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            {['检查项目', '类型', '注意事项', '状态'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(r.items || []).map((item, idx) => {
                            const iStatusMap = { pending: '待上传', uploaded: '已上传', reviewed: '已审核' }
                            const iStatusColor = { pending: '#D97706', uploaded: '#0077B6', reviewed: '#22A06B' }
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 500 }}>{item.itemName}</td>
                                <td style={{ padding: '6px 10px', color: '#8AA89C', fontSize: 12 }}>{item.itemType === 'labTestOrder' ? '检验医嘱' : '检查医嘱'}</td>
                                <td style={{ padding: '6px 10px', color: '#4A6558' }}>{item.notes || '-'}</td>
                                <td style={{ padding: '6px 10px', color: iStatusColor[item.status], fontWeight: 500 }}>{iStatusMap[item.status] || item.status}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Orders Tab ── */}
      {/* ── 消费记录 Tab（需求17：合并服务订单+收费管理）── */}
      {tab === 'consumption' && (() => {
        const ORDER_STATUS = { pending:'待安排', scheduled:'已安排', completed:'已完成', cancelled:'已取消' }
        const ORDER_STATUS_COLOR = { pending:'#D97706', scheduled:'#0077B6', completed:'#22A06B', cancelled:'#DC3545' }
        const thisYear = new Date().getFullYear()
        const yearOrders = patientOrders.filter(o => new Date(o.createdAt).getFullYear() === thisYear)
        const yearTotal  = yearOrders.reduce((s, o) => s + (o.servicePrice || 0), 0)
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 账户概览 */}
            <div className="card">
              <div className="card-header"><div className="card-title">账户概览</div></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: '健康基金余额', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
                  { label: `${thisYear}年消费总额`, value: `¥${yearTotal.toFixed(2)}`, color: '#DC3545' },
                  { label: '服务包', value: getServicePackageLabel(user.servicePackage) || '未购买', color: '#0077B6' },
                  { label: '服务到期', value: user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-', color: '#D97706' },
                ].map(item => (
                  <div key={item.label} style={{ padding: 14, background: '#f9f7f3', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 服务购买记录 */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="card-title">服务购买记录</div>
                <span style={{ fontSize: 12, color: '#8AA89C' }}>待安排 {patientOrders.filter(o => o.status === 'pending').length} 条</span>
              </div>
              {patientOrders.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无购买记录</div>
              ) : (
                <table className="table">
                  <thead><tr><th>产品名称</th><th>金额</th><th>下单时间</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {patientOrders.map(order => (
                      <tr key={order._id}>
                        <td style={{ fontWeight: 500 }}>{order.serviceName || order.serviceId}</td>
                        <td style={{ color: '#D97706', fontWeight: 600 }}>
                          {order.servicePrice != null ? `¥${order.servicePrice}` : '-'}
                        </td>
                        <td style={{ fontSize: 13, color: '#8AA89C' }}>{new Date(order.createdAt).toLocaleDateString('zh-CN')}</td>
                        <td>
                          <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                            background: (ORDER_STATUS_COLOR[order.status] || '#aaa') + '20',
                            color: ORDER_STATUS_COLOR[order.status] || '#aaa' }}>
                            {ORDER_STATUS[order.status] || order.status}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {order.status === 'pending' && (
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                              try {
                                await staffAPI.startOrder(order._id, { action: 'schedule' })
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: 'scheduled', scheduledAt: new Date().toISOString() } : o))
                                toast('已安排服务')
                              } catch (err) { toast(err.message || '操作失败') }
                            }}>启动服务</button>
                          )}
                          {order.status === 'scheduled' && (
                            <button className="btn btn-sm" style={{ background: '#22A06B', color: '#fff', border: 'none' }} onClick={async () => {
                              try {
                                await staffAPI.startOrder(order._id, { action: 'complete' })
                                setPatientOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: 'completed' } : o))
                                toast('服务已完成')
                              } catch (err) { toast(err.message || '操作失败') }
                            }}>标记完成</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 健康基金收支 */}
            <div className="card">
              <div className="card-header"><div className="card-title">健康基金</div></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, padding: 14, background: '#E8F5EF', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#1E6B50', marginBottom: 4 }}>当前余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1E6B50' }}>¥{(user.healthFundBalance || 0).toFixed(2)}</div>
                  </div>
                  <div style={{ flex: 1, padding: 14, background: '#FEF3E2', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: '#D97706', marginBottom: 4 }}>充值余额</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>¥{(user.rechargeBalance || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#8AA89C', textAlign: 'center' }}>健康基金收支明细请在财务模块管理</div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Family Tab ── */}
      {tab === 'family' && (
        <FamilyTab patientId={id} user={user} onRefresh={load} />
      )}

      {/* ── Membership Tab ── */}
      {tab === 'membership' && (
        <MembershipPanel user={user} patientId={id} onRefresh={load} />
      )}

      {/* 随访详情弹窗 */}
      {followUpDetail && (
        <div className="modal-overlay" onClick={() => setFollowUpDetail(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">随访详情</h3>
              <button className="modal-close" onClick={() => setFollowUpDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 基本信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: '随访日期', value: new Date(followUpDetail.date).toLocaleDateString('zh-CN') },
                  { label: '随访方式', value: TYPE_MAP[followUpDetail.type] || followUpDetail.type || '-' },
                  { label: '随访状态', value: STATUS_MAP[followUpDetail.status] || followUpDetail.status || '-' },
                  { label: '随访人员', value: followUpDetail.staffId?.name || '-' },
                  { label: '参与人员', value: followUpDetail.participants || '-' },
                  { label: '随访主题', value: followUpDetail.theme || followUpDetail.planName || '-' },
                  { label: '下次随访', value: followUpDetail.nextFollowUpDate ? new Date(followUpDetail.nextFollowUpDate).toLocaleDateString('zh-CN') : '-' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, color: '#1A2B24', fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>
              {/* 随访内容 */}
              {followUpDetail.content && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>随访内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {followUpDetail.content}
                  </div>
                </div>
              )}
              {/* 面谈纪要（上门/面谈时显示） */}
              {followUpDetail.interviewMinutes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>面谈纪要</div>
                  <div style={{ background: '#f0f8f4', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap', borderLeft: '3px solid #1E6B50' }}>
                    {followUpDetail.interviewMinutes}
                  </div>
                </div>
              )}
              {/* 打卡项目 */}
              {followUpDetail.checkInItems?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>打卡项目</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {followUpDetail.checkInItems.map((item, i) => (
                      <span key={i} style={{ padding: '2px 10px', borderRadius: 99, background: '#E8F5EF', color: '#1E6B50', fontSize: 12, fontWeight: 500 }}>{CHECKIN_LABEL[item] || item}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 表单内容（formData） */}
              {followUpDetail.formData && Object.keys(followUpDetail.formData).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>表单内容</div>
                  <div style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(followUpDetail.formData).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>{k}</span>
                        <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 备注 */}
              {followUpDetail.notes && (
                <div>
                  <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 6 }}>备注</div>
                  <div style={{ fontSize: 13, color: '#4A6558' }}>{followUpDetail.notes}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setFollowUpDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 随访记录弹窗 */}
      {showFollowUpModal && (
        <FollowUpModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowFollowUpModal(false)}
          onSaved={handleFollowUpCreated}
        />
      )}

      {/* 体检报告详情弹窗 */}
      {showReportDetail && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowReportDetail(null) }}>
          <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">{showReportDetail.title}</h3>
              <button className="modal-close" onClick={() => setShowReportDetail(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const r = showReportDetail
                const REPORT_TYPE_LABEL = { annual:'年度体检报告', blood:'血液检查', bloodTest:'血液检查', ultrasound:'超声检查', radiology:'放射检查', mri:'磁共振', ecg:'心电图', endoscopy:'内镜检查', pathology:'病理', functional:'功能医学', genetic:'基因检测', other:'其他', tumor:'肿瘤筛查', cardiovascular:'心脑血管病筛查', chronic:'慢性病筛查', health_promote:'健康促进' }
                const typeLabel = REPORT_TYPE_LABEL[r.type] || r.type || '-'
                const l1Node = r.screeningL1 ? screeningTree.find(n => String(n._id) === r.screeningL1) : null
                const categoryLabel = l1Node ? [l1Node.label, r.screeningL2].filter(Boolean).join(' › ') : (r.type === 'annual' ? '年度体检报告' : null)
                const rows = [
                  ['报告类型', typeLabel],
                  ...(categoryLabel && categoryLabel !== typeLabel ? [['分类', categoryLabel]] : []),
                  ['医院 / 机构', r.hospital || '-'],
                  ['报告日期', r.date || '-'],
                  ['审核状态', r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'],
                  ['审核人', r.audited_by || '-'],
                  ...(r.reject_reason ? [['驳回原因', r.reject_reason]] : []),
                  ['上传人', r.uploadedBy?.name || '-'],
                ]
                return rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                    <span style={{ width: 90, flexShrink: 0, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#1A2B24' }}>{v}</span>
                  </div>
                ))
              })()}
              {showReportDetail.note && (
                <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13 }}>{showReportDetail.note}</div>
              )}

              {/* 专项筛查详情 */}
              {reportScreeningData.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1E6B50', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e8f5ef' }}>
                    专项筛查记录（共 {reportScreeningData.length} 条）
                  </div>
                  {reportScreeningData.map((s, idx) => (
                    <div key={s._id || idx} style={{ marginBottom: 14, padding: '12px 14px', background: '#f8fcfa', borderRadius: 8, borderLeft: '3px solid #1E6B50' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1A2B24' }}>{s.screeningL3 || s.title || '检查项目'}</span>
                        <span style={{ fontSize: 12, color: '#8AA89C' }}>{s.checkDate || '-'}</span>
                      </div>
                      {/* 化验/检验结果 */}
                      {s.reportItems?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 4 }}>检验结果</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ padding: '3px 8px', textAlign: 'left', color: '#666', fontWeight: 500 }}>项目</th>
                                <th style={{ padding: '3px 8px', textAlign: 'right', color: '#666', fontWeight: 500 }}>结果</th>
                                <th style={{ padding: '3px 8px', textAlign: 'right', color: '#666', fontWeight: 500 }}>参考范围</th>
                                <th style={{ padding: '3px 8px', textAlign: 'center', color: '#666', fontWeight: 500 }}>状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.reportItems.map((item, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f0ede8' }}>
                                  <td style={{ padding: '3px 8px', color: '#1A2B24' }}>{item.name}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'right', color: item.status === 'abnormal' ? '#DC3545' : item.status === 'attention' ? '#D97706' : '#1A2B24', fontWeight: item.status === 'abnormal' ? 600 : 400 }}>
                                    {item.value}{item.unit ? ` ${item.unit}` : ''}
                                  </td>
                                  <td style={{ padding: '3px 8px', textAlign: 'right', color: '#aaa', fontSize: 11 }}>{item.reference || '-'}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                                    {item.status === 'abnormal' && <span style={{ fontSize: 11, color: '#DC3545', fontWeight: 600 }}>↑↓异常</span>}
                                    {item.status === 'attention' && <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>注意</span>}
                                    {item.status === 'normal' && <span style={{ fontSize: 11, color: '#22A06B' }}>正常</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {/* 影像/功能检查 */}
                      {s.examDescription && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 3 }}>描述</div>
                          <div style={{ fontSize: 12, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.examDescription}</div>
                        </div>
                      )}
                      {s.examConclusion && (
                        <div>
                          <div style={{ fontSize: 11, color: '#4A6558', fontWeight: 600, marginBottom: 3 }}>结论</div>
                          <div style={{ fontSize: 12, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.examConclusion}</div>
                        </div>
                      )}
                      {s.note && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#8AA89C', fontStyle: 'italic' }}>{s.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 8 }}>报告文件</div>
                {reportDetailLoading ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: '#8AA89C', fontSize: 13 }}>加载中…</div>
                ) : (showReportDetail.content || showReportDetail.fileUrl) ? (() => {
                  const rawSrc = showReportDetail.content || showReportDetail.fileUrl
                  const src = rawSrc.startsWith('/') ? API_ORIGIN + rawSrc : rawSrc
                  const isPdf = showReportDetail.mimeType === 'application/pdf' || rawSrc.includes('.pdf') || rawSrc.startsWith('data:application/pdf')
                  const isImg = showReportDetail.mimeType?.startsWith('image/') || rawSrc.startsWith('data:image')
                  const sizeKB = showReportDetail.fileSize ? Math.round(Number(showReportDetail.fileSize) / 1024) : null
                  const ext = isPdf ? '.pdf' : isImg ? (showReportDetail.mimeType === 'image/png' ? '.png' : '.jpg') : ''
                  const displayName = showReportDetail.title ? `${showReportDetail.title}${ext}` : (isPdf ? 'PDF 文件' : isImg ? '图片文件' : '附件')
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F6F9F7', borderRadius: 8, border: '1px solid #D8EDE3' }}>
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{isPdf ? '📄' : isImg ? '🖼️' : '📎'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: '#1A2B24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                        {sizeKB && <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>{sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`}</div>}
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => isImg ? setPreviewImageUrl(src) : window.open(src, '_blank')}>查看</button>
                    </div>
                  )
                })() : (
                  <div style={{ padding: '12px 0' }}>
                    <div style={{ color: '#B0C4BB', fontSize: 13, marginBottom: 8 }}>暂无文件</div>
                    {showReportDetail.audit_status !== 'audited' && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, border: '1px dashed #B0C4BB', color: '#4A6558', fontSize: 13, cursor: 'pointer' }}>
                        📎 补传文件
                        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files[0]
                            if (!file) return
                            if (file.size > 10 * 1024 * 1024) { toast('文件不能超过10MB'); return }
                            try {
                              const { url, mimeType, fileSize } = await staffAPI.uploadReportFile(file, () => {})
                              const updated = await staffAPI.updateReport(showReportDetail._id, {
                                fileUrl: url, mimeType, fileSize: String(fileSize), content: ''
                              })
                              setShowReportDetail(updated.data)
                              toast('文件已上传')
                            } catch (err) { toast(err.message || '上传失败') }
                          }} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
              {/* 审核操作区：仅当报告待审核时展示 */}
              {showReportDetail.audit_status !== 'audited' && showReportDetail.audit_status !== 'rejected' && (
                <>
                  {showRejectInput ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="请填写驳回原因"
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{ fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                          disabled={auditLoading || !rejectReason.trim()}
                          onClick={() => handleAudit('reject')}>
                          确认驳回
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowRejectInput(false); setRejectReason('') }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                        disabled={auditLoading}
                        onClick={() => handleAudit('approve')}>
                        ✓ 审核通过
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                        onClick={() => setShowRejectInput(true)}>
                        ✕ 驳回
                      </button>
                    </div>
                  )}
                </>
              )}
              <button className="btn btn-secondary" onClick={() => { setShowReportDetail(null); setShowRejectInput(false); setRejectReason('') }}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* 服务记录详情弹窗 */}
      {showSRDetail && (() => {
        const SRDetailModal = () => {
          const [mode, setMode] = React.useState('view') // view | edit | supplement
          const [editForm, setEditForm] = React.useState({ title: showSRDetail.title || '', content: showSRDetail.content || '', result: showSRDetail.result || '', nextDate: showSRDetail.nextDate ? new Date(showSRDetail.nextDate).toISOString().slice(0,10) : '' })
          const [suppContent, setSuppContent] = React.useState('')
          const [suppDate, setSuppDate] = React.useState(new Date().toISOString().slice(0,10))
          const [saving, setSaving] = React.useState(false)

          const handleEdit = async () => {
            setSaving(true)
            try {
              await staffAPI.updateServiceRecord(showSRDetail._id, { title: editForm.title, content: editForm.content, result: editForm.result, nextDate: editForm.nextDate || null })
              toast('记录已更新'); setShowSRDetail(null); loadServiceRecords()
            } catch (err) { toast(err.message || '保存失败') }
            finally { setSaving(false) }
          }

          const handleSupplement = async () => {
            if (!suppContent.trim()) { toast('请填写补充内容'); return }
            setSaving(true)
            try {
              await staffAPI.addServiceSupplement(showSRDetail._id, { content: suppContent, date: suppDate })
              toast('补充记录已添加'); setShowSRDetail(null); loadServiceRecords()
            } catch (err) { toast(err.message || '添加失败') }
            finally { setSaving(false) }
          }

          return (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSRDetail(null) }}>
              <div className="modal" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                  <h3 className="modal-title">{showSRDetail.title || '服务记录详情'}</h3>
                  <button className="modal-close" onClick={() => setShowSRDetail(null)}>✕</button>
                </div>
                <div className="modal-body">
                  {mode === 'view' && (
                    <>
                      {[
                        ['服务类型', SR_TYPE_LABEL[showSRDetail.type] || showSRDetail.type],
                        ['负责人', showSRDetail.staffId?.name || '-'],
                        ['服务日期', showSRDetail.date ? new Date(showSRDetail.date).toLocaleDateString('zh-CN') : '-'],
                      ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #f5f2ec' }}>
                          <span style={{ width: 80, color: '#8AA89C', fontSize: 13 }}>{k}</span>
                          <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
                        </div>
                      ))}
                      {showSRDetail.content && (
                        <div style={{ marginTop: 12, padding: 12, background: '#f9f7f3', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {showSRDetail.content}
                        </div>
                      )}
                      {showSRDetail.result && (
                        <div style={{ marginTop: 8, padding: 12, background: '#EFF6FF', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          <div style={{ fontSize: 11, color: '#0077B6', marginBottom: 4, fontWeight: 600 }}>结果/建议</div>
                          {showSRDetail.result}
                        </div>
                      )}
                      {(showSRDetail.supplements || []).length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>补充记录</div>
                          {showSRDetail.supplements.map((s, i) => (
                            <div key={i} style={{ padding: '8px 12px', background: '#F9F6F0', borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: '#8AA89C' }}>{s.staffName}</span>
                                <span style={{ fontSize: 11, color: '#8AA89C' }}>{s.date ? new Date(s.date).toLocaleDateString('zh-CN') : '-'}</span>
                              </div>
                              <div style={{ whiteSpace: 'pre-wrap' }}>{s.content}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {mode === 'edit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div><label className="form-label">标题</label><input className="form-input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} /></div>
                      <div><label className="form-label">详细内容</label><textarea className="form-input" rows={4} value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} /></div>
                      <div><label className="form-label">结果/建议</label><textarea className="form-input" rows={3} value={editForm.result} onChange={e => setEditForm(f => ({ ...f, result: e.target.value }))} /></div>
                      <div><label className="form-label">下次计划日期</label><input className="form-input" type="date" value={editForm.nextDate} onChange={e => setEditForm(f => ({ ...f, nextDate: e.target.value }))} /></div>
                    </div>
                  )}
                  {mode === 'supplement' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 13, color: '#8AA89C', marginBottom: 4 }}>为此记录追加补充，不影响原始内容</div>
                      <div><label className="form-label">补充日期</label><input className="form-input" type="date" value={suppDate} onChange={e => setSuppDate(e.target.value)} /></div>
                      <div><label className="form-label">补充内容</label><textarea className="form-input" rows={5} placeholder="如：1周后随访，专病方案调整情况..." value={suppContent} onChange={e => setSuppContent(e.target.value)} /></div>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {mode === 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('edit')}>编辑</button>}
                    {mode === 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('supplement')}>补充记录</button>}
                    {mode !== 'view' && <button className="btn btn-secondary btn-sm" onClick={() => setMode('view')}>返回</button>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowSRDetail(null)}>关闭</button>
                    {mode === 'edit' && <button className="btn btn-primary" disabled={saving} onClick={handleEdit}>{saving ? '保存中...' : '保存'}</button>}
                    {mode === 'supplement' && <button className="btn btn-primary" disabled={saving} onClick={handleSupplement}>{saving ? '添加中...' : '添加补充'}</button>}
                  </div>
                </div>
              </div>
            </div>
          )
        }
        return <SRDetailModal />
      })()}

      {/* 转介弹窗 */}
      {showReferralModal && (
        <ReferralModal
          patientId={id}
          patientName={user.name}
          patientUser={user}
          staffList={staffList}
          onClose={() => setShowReferralModal(false)}
          onSaved={() => { setShowReferralModal(false); toast('转介已发送') }}
        />
      )}

      {/* 发消息弹窗 */}
      {showMessageModal && (
        <SendMessageModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowMessageModal(false)}
        />
      )}

      {/* 上传体检报告弹窗 */}
      {showUploadReport && (
        <UploadReportModal
          patientId={id}
          screeningTree={screeningTree}
          onClose={() => setShowUploadReport(false)}
          onSaved={() => { setShowUploadReport(false); toast('报告已上传'); loadReports() }}
        />
      )}

      {/* 新建开单弹窗 */}
      {showReqModal && (
        <RequisitionModal
          patientId={id}
          onClose={() => setShowReqModal(false)}
          onSaved={() => {
            setShowReqModal(false)
            toast('开单已创建，请上传对应报告')
            loadRequisitions()
            setTab('requisitions')
          }}
        />
      )}
    </div>
  )
}

function MembershipPanel({ user, patientId, onRefresh }) {
  const toast = useToast()
  const [cardNumber, setCardNumber] = useState(user.cardNumber || '')
  const [pointsDelta, setPointsDelta] = useState('')
  const [rechargeDelta, setRechargeDelta] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const payload = { cardNumber }
      if (pointsDelta) payload.pointsDelta = parseInt(pointsDelta)
      if (rechargeDelta) payload.rechargeDelta = parseFloat(rechargeDelta)
      await staffAPI.updatePatientMembership(patientId, payload)
      toast('已更新')
      setPointsDelta(''); setRechargeDelta('')
      onRefresh()
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 会员基本信息 */}
      <div className="card">
        <div className="card-header"><div className="card-title">会员基本信息</div></div>
        <div className="card-body">
          <InfoRow label="手机号" value={user.phone} />
          <InfoRow label="会员类型" value={user.memberType || (user.patientType === 'vip' ? 'VIP会员' : user.patientType === 'trial' ? '试用会员' : '普通会员')} />
          <InfoRow label="服务包" value={getServicePackageLabel(user.servicePackage)} />
          <InfoRow label="服务开始" value={user.serviceStartDate ? new Date(user.serviceStartDate).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="服务到期" value={user.serviceExpiry ? new Date(user.serviceExpiry).toLocaleDateString('zh-CN') : '-'} />
          <InfoRow label="会员来源" value={user.source || '-'} />
        </div>
      </div>

      {/* 会员卡 & 积分管理 */}
      <div className="card">
        <div className="card-header"><div className="card-title">卡号 & 积分 & 余额</div></div>
        <div className="card-body">
          {/* 当前状态 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: '健康基金', value: `¥${(user.healthFundBalance || 0).toFixed(2)}`, color: '#1E6B50' },
              { label: '充值余额', value: `¥${(user.rechargeBalance || 0).toFixed(2)}`, color: '#0077B6' },
              { label: '积分', value: (user.points || 0).toString(), color: '#D97706' },
            ].map(s => (
              <div key={s.label} style={{ background: '#f9f7f3', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* 编辑区 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="form-label" style={{ fontSize: 12 }}>会员卡号</label>
              <input className="form-input" value={cardNumber} onChange={e => setCardNumber(e.target.value)} placeholder="如：JY-2025-001" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>积分变动（+/-）</label>
                <input className="form-input" type="number" value={pointsDelta} onChange={e => setPointsDelta(e.target.value)} placeholder="如：100 或 -50" />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: 12 }}>充值余额变动（元）</label>
                <input className="form-input" type="number" value={rechargeDelta} onChange={e => setRechargeDelta(e.target.value)} placeholder="如：500 或 -100" />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存更新'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
      <span style={{ color: '#8AA89C' }}>{label}</span>
      <span style={{ color: '#1A2B24', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

const RECORD_TYPE_LABEL = {
  bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率',
  weight: '体重', sleep: '睡眠', mood: '情绪',
  diet: '饮食', exercise: '运动', water: '饮水',
  alcohol: '饮酒', bowel: '排便', smoking: '吸烟',
}

function formatRecordValue(r) {
  if (r.type === 'bloodPressure' && r.extra) {
    return `${r.extra.sys}/${r.extra.dia} mmHg`
  }
  if (r.type === 'bloodSugar') return `${r.value} mmol/L`
  if (r.type === 'heartRate') return `${r.value} 次/分`
  if (r.type === 'weight') return `${r.value} kg`
  if (r.type === 'sleep') return `${r.value} h`
  if (r.type === 'mood') return `${r.value} / 10`
  return r.value ?? '-'
}

// ── 聊天对话弹窗 ──────────────────────────────────────────────
function SendMessageModal({ patientId, patientName, onClose }) {
  const { staff } = useStaff()
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  const loadThread = async () => {
    try {
      const res = await staffAPI.getChatThread(patientId)
      setMsgs(res.data || [])
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'auto' }), 80)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadThread() }, [patientId])

  // 轮询获取新消息（3秒一次）
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await staffAPI.getChatThread(patientId)
        setMsgs(res.data || [])
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [patientId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })
  }, [msgs])

  const send = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await staffAPI.replyChatMessage(patientId, input.trim())
      setInput('')
      if (res.data) setMsgs(prev => [...prev, res.data])
      setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }), 80)
    } catch {}
    finally { setSending(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const fmtTime = (t) => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 520, height: '70vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* 顶栏 */}
        <div className="modal-header" style={{ borderBottom: '1px solid #E0D9CE', flexShrink: 0 }}>
          <h3 className="modal-title">与 {patientName} 对话</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 消息列表 */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, backgroundColor: '#F2EDE3' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#8AA89C', padding: 40 }}>加载中…</div>
          ) : msgs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#8AA89C', padding: 40 }}>暂无消息，发送第一条吧</div>
          ) : msgs.map((m, i) => {
            const isStaff = m.type !== 'user'
            const showTime = i === 0 || (new Date(m.createdAt) - new Date(msgs[i-1].createdAt)) > 300000
            return (
              <div key={m._id}>
                {showTime && <div style={{ textAlign: 'center', fontSize: 11, color: '#8AA89C', margin: '4px 0' }}>{fmtTime(m.createdAt)}</div>}
                <div style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start', gap: 8 }}>
                  {!isStaff && (
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: '#1E6B50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {(patientName || '用')[0]}
                    </div>
                  )}
                  <div style={{ maxWidth: '68%' }}>
                    {!isStaff && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 3 }}>{m.sender || patientName}</div>}
                    <div style={{
                      padding: '9px 13px', borderRadius: isStaff ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isStaff ? '#1E6B50' : '#fff',
                      color: isStaff ? '#fff' : '#1A2B24',
                      fontSize: 14, lineHeight: 1.5,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}>
                      {m.content}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 输入栏 */}
        <div style={{ borderTop: '1px solid #E0D9CE', padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, backgroundColor: '#fff' }}>
          <textarea
            style={{ flex: 1, border: '1px solid #E0D9CE', borderRadius: 10, padding: '8px 12px', fontSize: 14, resize: 'none', outline: 'none', maxHeight: 100, lineHeight: 1.5, fontFamily: 'inherit' }}
            rows={1}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{ padding: '8px 16px', borderRadius: 10, background: '#1E6B50', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: (sending || !input.trim()) ? 0.5 : 1 }}
          >
            {sending ? '…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 上传体检报告弹窗 ───────────────────────────────────────
const ANNUAL_L1_ID = '__annual__'

function UploadReportModal({ patientId, screeningTree = [], onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', l1Id: '', l2Label: '', hospital: '', date: '', note: '' })
  const [fileData, setFileData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')

  const isAnnual = form.l1Id === ANNUAL_L1_ID
  const currentL1 = isAnnual ? null : screeningTree.find(n => String(n._id) === form.l1Id)
  const l2Options = currentL1?.children || []

  const handleL1Change = (l1Id) => {
    const isAnn = l1Id === ANNUAL_L1_ID
    setForm(f => ({
      ...f, l1Id,
      l2Label: '',
      title: isAnn ? (f.title || '年度体检报告') : '',
    }))
  }

  const handleL2Change = (l2Label) => {
    setForm(f => ({ ...f, l2Label, title: l2Label ? `${l2Label} 报告` : f.title }))
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('文件不能超过 10MB'); return }
    setFileData({ file, mimeType: file.type, fileSize: file.size, name: file.name })
    if (!form.title) setForm(f => ({ ...f, title: file.name.replace(/\.[^.]+$/, '') }))
  }

  const handleSubmit = async () => {
    if (!form.l1Id) { setError('请选择报告大类'); return }
    if (!form.title) { setError('请填写报告标题'); return }
    if (!fileData) { setError('请选择报告文件（图片或PDF）'); return }
    try {
      setSaving(true); setError(''); setUploadProgress(0)
      // 阶段一：上传文件到服务器磁盘（真实进度 0-90%）
      const { url, mimeType, fileSize } = await staffAPI.uploadReportFile(
        fileData.file,
        (p) => setUploadProgress(Math.round(p * 0.9))
      )
      // 阶段二：创建报告记录（90-100%）
      setUploadProgress(90)
      await staffAPI.uploadReport({
        patientId,
        title: form.title,
        type: isAnnual ? 'annual' : 'other',
        screeningL1: isAnnual ? '' : form.l1Id,
        screeningL2: isAnnual ? '' : form.l2Label,
        hospital: form.hospital,
        date: form.date,
        note: form.note,
        fileUrl: url,
        mimeType,
        fileSize: String(fileSize),
      })
      setUploadProgress(100)
      onSaved()
    } catch (err) {
      setError(err.message || '上传失败')
    } finally {
      setSaving(false)
      setUploadProgress(0)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">上传体检报告</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="alert alert-error">{error}</div>}

          {/* L1 大类 */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告大类 *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: ANNUAL_L1_ID, label: '年度体检报告' }, ...screeningTree.map(n => ({ id: String(n._id), label: n.label }))].map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => handleL1Change(opt.id)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: '1.5px solid',
                    background: form.l1Id === opt.id ? '#1E6B50' : '#fff',
                    color: form.l1Id === opt.id ? '#fff' : '#4A6558',
                    borderColor: form.l1Id === opt.id ? '#1E6B50' : '#C8D5CE',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* L2 具体分类（年度体检不展示） */}
          {!isAnnual && form.l1Id && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">具体分类</label>
              {l2Options.length > 0 ? (
                <select className="form-input" value={form.l2Label} onChange={e => handleL2Change(e.target.value)}>
                  <option value="">-- 选择具体项目（可选）--</option>
                  {l2Options.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: '#aaa', padding: '6px 0' }}>该大类暂无子分类</div>
              )}
            </div>
          )}

          {/* 当前分类路径提示 */}
          {form.l1Id && (
            <div style={{ fontSize: 12, color: '#1E6B50', background: '#E8F5EF', borderRadius: 6, padding: '5px 10px' }}>
              {isAnnual ? '年度体检报告（整份报告）' : [currentL1?.label, form.l2Label].filter(Boolean).join(' › ')}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告标题 *</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="如：2024年年度体检报告" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">医院 / 机构</label>
              <input className="form-input" value={form.hospital} onChange={e => setForm(f => ({ ...f, hospital: e.target.value }))} placeholder="如：协和医院" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label">报告日期</label>
              <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">报告文件（图片/PDF，≤10MB）</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFile} style={{ fontSize: 13, padding: '6px 0' }} />
            {fileData && <div style={{ fontSize: 12, color: '#22A06B', marginTop: 4 }}>✓ {fileData.name}</div>}
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="补充说明（可选）" />
          </div>
        </div>
        <div className="modal-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {saving && (
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4A6558', marginBottom: 4 }}>
                <span>{uploadProgress < 100 ? '正在上传...' : '服务器处理中，请稍候...'}</span>
                {uploadProgress < 100 && <span>{uploadProgress}%</span>}
              </div>
              <div style={{ width: '100%', height: 6, background: '#E0D9CE', borderRadius: 99, overflow: 'hidden' }}>
                {uploadProgress < 100
                  ? <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#1E6B50', borderRadius: 99, transition: 'width 0.2s ease' }} />
                  : <div style={{ height: '100%', width: '100%', background: 'linear-gradient(90deg, #1E6B50 0%, #4CAF8A 50%, #1E6B50 100%)', backgroundSize: '200% 100%', borderRadius: 99, animation: 'progressPulse 1.2s linear infinite' }} />
                }
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>取消</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? (uploadProgress < 100 ? `上传中 ${uploadProgress}%` : '处理中...') : '确认上传'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 赠送权益弹窗（供 MarketingPage 导出使用）───────────────────────
const SERVICE_OPTIONS = ['就医协助服务', '居家监测套餐', '专家咨询', '陪诊服务', '上门采血', '营养咨询', '其他服务']

export function GiftModal({ patientId, patientName, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ giftType: 'service', serviceName: '', serviceCount: 1, fundAmount: 0, fundType: 'enterprise', validFrom: '', validTo: '', remark: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (form.giftType === 'service' && !form.serviceName) { setError('请选择赠送服务'); return }
    if (form.giftType === 'fund' && (!form.fundAmount || Number(form.fundAmount) <= 0)) { setError('请输入有效金额'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.giftToPatient(patientId, { ...form, serviceCount: Number(form.serviceCount), fundAmount: Number(form.fundAmount) })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3 className="modal-title">赠送权益 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">赠送类型</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['service', '🎁 赠送服务'], ['fund', '💰 健康基金']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: form.giftType === v ? 700 : 400, color: form.giftType === v ? '#1E6B50' : '#666' }}>
                  <input type="radio" value={v} checked={form.giftType === v} onChange={set('giftType')} /> {l}
                </label>
              ))}
            </div>
          </div>

          {form.giftType === 'service' ? (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">服务类型 *</label>
                <select className="form-input" value={form.serviceName} onChange={set('serviceName')}>
                  <option value="">-- 请选择 --</option>
                  {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">赠送次数</label>
                <input className="form-input" type="number" min={1} max={99} value={form.serviceCount} onChange={set('serviceCount')} />
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">金额（元）*</label>
                <input className="form-input" type="number" min={1} placeholder="如：500" value={form.fundAmount || ''} onChange={set('fundAmount')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">基金类型</label>
                <select className="form-input" value={form.fundType} onChange={set('fundType')}>
                  <option value="enterprise">企业派送</option>
                  <option value="promotion">促销赠送</option>
                  <option value="other">其他</option>
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">有效期开始</label>
              <input className="form-input" type="date" value={form.validFrom} onChange={set('validFrom')} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">有效期结束</label>
              <input className="form-input" type="date" value={form.validTo} onChange={set('validTo')} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">备注</label>
            <input className="form-input" placeholder="赠送原因或说明..." value={form.remark} onChange={set('remark')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '赠送中...' : '确认赠送'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 转介弹窗 ───────────────────────────────────────────────
const ROLE_LABEL_MAP = {
  familyDoctor:'家庭医师', nutritionist:'营养师', healthManager:'健管专员',
  medicalAssistant:'就医专员', psychologist:'心理咨询师', rehabSpecialist:'运动复健师',
  tcmDoctor:'中医师', specialist:'专科医师', healthPlanner:'健康规划师', superadmin:'超级管理员',
}

function ReferralModal({ patientId, patientName, patientUser, staffList, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ toStaffId: '', reason: '', content: '', urgency: 'normal' })
  const [selectedHealthSections, setSelectedHealthSections] = useState(['basicInfo'])
  const [extraData, setExtraData] = useState({ medications: [], supplements: [], healthRecords: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // 打开时拉取用药、营养补剂、近期打卡记录
  useEffect(() => {
    Promise.allSettled([
      staffAPI.getPatientMedications(patientId),
      staffAPI.getPatientSupplements(patientId),
      staffAPI.getPatientHealthRecords(patientId, { limit: 20 }),
    ]).then(([medsR, supsR, recsR]) => {
      setExtraData({
        medications:   medsR.status === 'fulfilled' ? (medsR.value.data || []) : [],
        supplements:   supsR.status === 'fulfilled' ? (supsR.value.data || []) : [],
        healthRecords: recsR.status === 'fulfilled' ? (recsR.value.data || []) : [],
      })
    })
  }, [patientId])

  const REASON_PRESETS = ['需要就医协助', '营养干预评估', '心理咨询介入', '运动康复指导', '中医体质评估', '专科会诊', '健康方案制定', '体检报告解读']

  // 计算年龄
  const calcAge = (birthDate) => {
    if (!birthDate) return null
    return Math.floor((Date.now() - new Date(birthDate)) / (365.25 * 24 * 3600 * 1000))
  }

  // 提取最近一次各类打卡数据
  const buildLatestVitals = (records) => {
    const VITAL_LABEL = { weight:'体重', bloodPressure:'血压', bloodSugar:'血糖', heartRate:'心率', sleep:'睡眠' }
    const seen = {}
    const result = []
    records.forEach(r => {
      if (VITAL_LABEL[r.type] && !seen[r.type]) {
        seen[r.type] = true
        let valStr = r.value ? `${r.value}${r.unit || ''}` : ''
        if (r.type === 'bloodPressure' && r.extra) valStr = `${r.extra.sys || ''}/${r.extra.dia || ''} mmHg`
        result.push(`${VITAL_LABEL[r.type]}：${valStr}（${new Date(r.recordedAt || r.createdAt).toLocaleDateString('zh-CN')}）`)
      }
    })
    return result.length ? result.join('；') : null
  }

  // 可附带的健康档案区块（固定全量，按有无数据过滤）
  const buildSections = () => {
    const u = patientUser
    const ed = extraData
    const age = calcAge(u?.birthDate)
    const basicInfoVal = [
      u?.name ? `姓名：${u.name}` : '',
      u?.gender ? `性别：${u.gender}` : '',
      age ? `年龄：${age}岁` : '',
      u?.height ? `身高：${u.height}cm` : '',
    ].filter(Boolean).join('，')

    const dietSummary = u?.lifestyle_data?.summaryOverride
      || (u?.lifestyle_data?.autoSummaryFlags?.length ? u.lifestyle_data.autoSummaryFlags.join('；') : null)
      || u?.lifestyle?.diet || null

    const latestVitals = buildLatestVitals(ed.healthRecords)

    return [
      { key: 'basicInfo',        label: '基本信息',     val: basicInfoVal || null },
      { key: 'foodAllergy',      label: '食物过敏',     val: u?.healthProfile?.foodAllergy || null },
      { key: 'drugAllergy',      label: '药物过敏',     val: u?.healthProfile?.drugAllergy || null },
      { key: 'medicalHistory',   label: '既往病史',     val: (() => { const v = u?.healthProfile?.medicalHistory; return Array.isArray(v) && v.length ? v : (v || null) })() },
      { key: 'specialDiseases',  label: '特殊疾病史',   val: u?.healthProfile?.pastHistory || (u?.chronicDiseases?.length ? u.chronicDiseases.join('；') : null) },
      { key: 'familyHistory',    label: '家族史',       val: (() => { const v = u?.healthProfile?.familyHistory; return Array.isArray(v) && v.length ? v : (v || null) })() },
      { key: 'longTermMeds',     label: '长期用药',     val: ed.medications.length ? ed.medications.map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}`).join('；') : null },
      { key: 'longTermSups',     label: '长期营养补剂', val: ed.supplements.length ? ed.supplements.map(s => s.name).join('；') : null },
      { key: 'dietSummary',      label: '膳食调查概述', val: dietSummary },
      { key: 'latestVitals',     label: '近期打卡数据', val: latestVitals },
    ].filter(s => s.val !== null && s.val !== '' && !(Array.isArray(s.val) && s.val.length === 0))
  }

  const HEALTH_SECTIONS = buildSections()

  const toggleSection = (key) => {
    setSelectedHealthSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const buildAttachedHealthInfo = () => {
    if (selectedHealthSections.length === 0) return null
    const result = {}
    HEALTH_SECTIONS.forEach(s => {
      if (selectedHealthSections.includes(s.key)) result[s.key] = s.val
    })
    return Object.keys(result).length ? result : null
  }

  const handleSubmit = async () => {
    if (!form.toStaffId || !form.reason) { setError('接收人和转介原因不能为空'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createReferral({ patientId, ...form, attachedHealthInfo: buildAttachedHealthInfo() })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">🔀 转介 — {patientName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">接收人 *</label>
            <select className="form-input" value={form.toStaffId} onChange={set('toStaffId')}>
              <option value="">-- 请选择接收医护人员 --</option>
              {staffList.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} · {ROLE_LABEL_MAP[s.role] || s.role}{s.title ? ` (${s.title})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">转介原因 *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {REASON_PRESETS.map(r => (
                <button key={r} type="button" className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12, padding: '3px 10px', background: form.reason === r ? '#E8F5EF' : '', border: form.reason === r ? '1px solid #1E6B50' : '' }}
                  onClick={() => setForm(f => ({ ...f, reason: r }))}>{r}</button>
              ))}
            </div>
            <input className="form-input" placeholder="或手动输入原因..." value={form.reason} onChange={set('reason')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">详细说明</label>
            <textarea className="form-input" rows={3} placeholder="病情描述、需要协助的具体内容..." value={form.content} onChange={set('content')} />
          </div>
          {/* 健康档案附件选择 */}
          {HEALTH_SECTIONS.length > 0 && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">附带健康档案（供接收方参考）</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {HEALTH_SECTIONS.map(s => {
                  const selected = selectedHealthSections.includes(s.key)
                  return (
                    <button key={s.key} type="button" className="btn btn-secondary btn-sm"
                      style={{ fontSize: 12, padding: '3px 12px',
                        background: selected ? '#E8F5EF' : '',
                        border: selected ? '1px solid #1E6B50' : '',
                        color: selected ? '#1E6B50' : '' }}
                      onClick={() => toggleSection(s.key)}>
                      {selected ? '✓ ' : ''}{s.label}
                    </button>
                  )
                })}
              </div>
              {selectedHealthSections.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#8AA89C' }}>
                  已选 {selectedHealthSections.length} 项，接收方可在转介信中查看
                </div>
              )}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">紧急程度</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['normal', '普通'], ['urgent', '🚨 紧急']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: form.urgency === v && v === 'urgent' ? '#DC3545' : form.urgency === v ? '#1E6B50' : '#666', fontWeight: form.urgency === v ? 700 : 400 }}>
                  <input type="radio" value={v} checked={form.urgency === v} onChange={set('urgency')} /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '发送中...' : '发送转介'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 家庭成员 Tab ────────────────────────────────────────────────────
function FamilyTab({ patientId, user, onRefresh }) {
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addRelation, setAddRelation] = useState('')
  const [addTarget, setAddTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getPatientFamilyLinks(patientId)
      setMembers(res.data || [])
    } catch { setMembers([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])

  const handleSearch = (kw) => {
    setAddSearch(kw)
    setAddTarget(null)
    clearTimeout(searchTimer.current)
    if (!kw.trim()) { setAddResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await staffAPI.getPatients({ search: kw, limit: 20 })
        setAddResults((res.data.patients || []).filter(p => p._id !== patientId))
      } catch { setAddResults([]) }
    }, 300)
  }

  const handleAdd = async () => {
    if (!addTarget) { toast('请先搜索并选择会员'); return }
    if (!addRelation.trim()) { toast('请填写关系'); return }
    setSaving(true)
    try {
      await staffAPI.addFamilyLink(patientId, { linkedUserId: addTarget._id, relation: addRelation })
      toast('已添加家庭成员')
      setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('')
      load()
    } catch (err) { toast(err.message || '添加失败') }
    finally { setSaving(false) }
  }

  const handleRemove = async (linkId) => {
    if (!window.confirm('确定移除此家庭成员关联？')) return
    try {
      await staffAPI.removeFamilyLink(patientId, linkId)
      toast('已移除')
      load()
    } catch (err) { toast(err.message || '移除失败') }
  }

  const calcAge = (birthDate) => {
    if (!birthDate) return '-'
    const birth = new Date(birthDate)
    if (isNaN(birth)) return '-'
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
    return age >= 0 ? `${age}岁` : '-'
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* 家庭联系人 */}
      <div className="card">
        <div className="card-header"><div className="card-title">紧急联系人</div></div>
        <div className="card-body">
          <InfoRow label="联系人" value={user.contactName || '-'} />
          <InfoRow label="联系电话" value={user.contactPhone2 || user.contactPhone3 || '-'} />
          <InfoRow label="家庭医师" value={user.assignedFamilyDoctor?.name || '-'} />
          <InfoRow label="家庭医师职称" value={user.assignedFamilyDoctor?.title || '-'} />
        </div>
      </div>

      {/* 系统内家庭成员 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">家庭成员（系统内客户）</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(v => !v)}>＋ 添加成员</button>
        </div>
        <div className="card-body">
          {showAdd && (
            <div style={{ background: '#f9f7f3', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">搜索会员（姓名/手机号）</label>
                <input className="form-input" value={addSearch} onChange={e => handleSearch(e.target.value)} placeholder="输入姓名或手机号..." autoComplete="off" />
                {addResults.length > 0 && !addTarget && (
                  <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto', background: '#fff' }}>
                    {addResults.map(p => (
                      <div key={p._id} onClick={() => { setAddTarget(p); setAddSearch(`${p.name}  ${p.phone}`) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f2ec' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <strong>{p.name}</strong><span style={{ color: '#8AA89C', marginLeft: 8 }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">关系</label>
                <input className="form-input" value={addRelation} onChange={e => setAddRelation(e.target.value)} placeholder="如：配偶、父亲、母亲、子女..." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setAddSearch(''); setAddResults([]); setAddTarget(null); setAddRelation('') }}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>{saving ? '添加中...' : '确认添加'}</button>
              </div>
            </div>
          )}

          {loading ? <div style={{ color: '#aaa', padding: '12px 0', fontSize: 13 }}>加载中...</div>
          : members.length === 0 ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂无关联家庭成员</div>
          : members.map(m => {
            const linked = m.linkedUser
            return (
              <div key={m._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f2ec' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{linked?.name || '-'}</span>
                  <span style={{ color: '#8AA89C', fontSize: 12, marginLeft: 8 }}>{m.relation}</span>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                    {linked?.gender || ''}{linked?.gender ? ' · ' : ''}{linked?.birthDate ? calcAge(linked.birthDate) : ''}{linked?.phone ? ' · ' + linked.phone : ''}
                  </div>
                </div>
                <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc', fontSize: 12 }}
                  onClick={() => handleRemove(m._id)}>移除</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


// -- InitialHealthRecordForm component
function InitialHealthRecordForm({ patientId, onSaved, toast: toastFn }) {
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState('bloodPressure')
  const [saving, setSaving] = React.useState(false)

  const TYPES = [
    { key: 'bloodPressure', label: '血压',  unit: 'mmHg',   kind: 'bp' },
    { key: 'bloodSugar',    label: '血糖',  unit: 'mmol/L', kind: 'num', placeholder: '如 5.8' },
    { key: 'heartRate',     label: '心率',  unit: '次/分',  kind: 'num', placeholder: '如 72' },
    { key: 'weight',        label: '体重',  unit: 'kg',     kind: 'num', placeholder: '如 65.0' },
    { key: 'sleep',         label: '睡眠',  unit: '小时',   kind: 'sleep' },
    { key: 'diet',          label: '饮食',  unit: '',       kind: 'text', placeholder: '如：三餐规律，以主食蔬菜为主，少油少盐' },
    { key: 'exercise',      label: '运动',  unit: '',       kind: 'text', placeholder: '如：跑步，每周3次，每次30分钟' },
    { key: 'water',         label: '饮水',  unit: '',       kind: 'text', placeholder: '如：白水为主，每日约2000毫升' },
    { key: 'bowel',         label: '排便',  unit: '',       kind: 'text', placeholder: '如：1次/日，成形，无特殊' },
    { key: 'smoking',       label: '吸烟',  unit: '',       kind: 'text', placeholder: '如：不吸烟 / 每日10支，2010年起' },
    { key: 'alcohol',       label: '饮酒',  unit: '',       kind: 'text', placeholder: '如：红酒，每次100ml，每周1次' },
  ]

  const initVals = () => Object.fromEntries(TYPES.map(t =>
    [t.key, t.kind === 'bp' ? { sys: '', dia: '' } : t.kind === 'sleep' ? { sleepTime: '', wakeTime: '' } : { val: '' }]
  ))

  const [vals, setVals] = React.useState(initVals)
  const setField = (field, v) => setVals(p => ({ ...p, [type]: { ...p[type], [field]: v } }))
  const reset = () => setVals(initVals())

  const curType = TYPES.find(t => t.key === type)

  const handleSave = async () => {
    let value, extra = {}
    const cur = vals[type]
    if (curType.kind === 'bp') {
      if (!cur.sys || !cur.dia) { toastFn('请填写收缩压和舒张压'); return }
      value = cur.sys + '/' + cur.dia
      extra = { sys: Number(cur.sys), dia: Number(cur.dia) }
    } else if (curType.kind === 'sleep') {
      if (!cur.sleepTime || !cur.wakeTime) { toastFn('请填写入睡和起床时间'); return }
      const [sh, sm] = cur.sleepTime.split(':').map(Number)
      const [wh, wm] = cur.wakeTime.split(':').map(Number)
      const dur = ((wh * 60 + wm) - (sh * 60 + sm) + 1440) % 1440 / 60
      value = dur.toFixed(1)
      extra = { sleepTime: cur.sleepTime, wakeTime: cur.wakeTime }
    } else {
      if (!cur.val) { toastFn('请填写内容'); return }
      value = cur.val
    }
    setSaving(true)
    try {
      await staffAPI.createPatientHealthRecord(patientId, { type, value, extra })
      toastFn('健康数据已录入，已同步到用户端')
      reset(); setOpen(false); onSaved()
    } catch (e) { toastFn(e.message || '录入失败') }
    finally { setSaving(false) }
  }

  if (!open) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>初始健康数据录入</div>
            <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 2 }}>录入后直接同步到用户端，格式与用户打卡完全一致</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ 录入数据</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <div className="card-title">初始健康数据录入</div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); reset() }}>取消</button>
      </div>
      <div className="card-body">
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 6 }}>数据类型</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPES.map(t => (
              <button key={t.key}
                className={'btn btn-sm ' + (type === t.key ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setType(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        {curType.kind === 'bp' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>收缩压（高压）</label>
              <input className="form-control" type="number" placeholder="如 120" value={vals.bloodPressure.sys}
                onChange={e => setField('sys', e.target.value)} style={{ width: 120 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>舒张压（低压）</label>
              <input className="form-control" type="number" placeholder="如 80" value={vals.bloodPressure.dia}
                onChange={e => setField('dia', e.target.value)} style={{ width: 120 }} />
            </div>
            <span style={{ color: '#8AA89C', fontSize: 13, marginBottom: 8 }}>mmHg</span>
          </div>
        )}

        {curType.kind === 'sleep' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>入睡时间</label>
              <input className="form-control" type="time" value={vals.sleep.sleepTime}
                onChange={e => setField('sleepTime', e.target.value)} style={{ width: 130 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>起床时间</label>
              <input className="form-control" type="time" value={vals.sleep.wakeTime}
                onChange={e => setField('wakeTime', e.target.value)} style={{ width: 130 }} />
            </div>
          </div>
        )}

        {curType.kind === 'num' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>{curType.label}</label>
              <input className="form-control" type="number" step="0.1" value={vals[type].val}
                onChange={e => setField('val', e.target.value)} style={{ width: 150 }}
                placeholder={curType.placeholder} />
            </div>
            <span style={{ color: '#8AA89C', fontSize: 13, marginBottom: 8 }}>{curType.unit}</span>
          </div>
        )}

        {curType.kind === 'text' && (
          <div>
            <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>{curType.label}</label>
            <textarea className="form-control" rows={2} value={vals[type].val}
              onChange={e => setField('val', e.target.value)}
              placeholder={curType.placeholder}
              style={{ width: '100%' }} />
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 12 }}
          onClick={handleSave} disabled={saving}>
          {saving ? '录入中...' : '确认录入'}
        </button>
      </div>
    </div>
  )
}

// ── 附带健康档案展示组件（转介记录tab共用）──────────────────────
const REFERRAL_HEALTH_LABELS = {
  basicInfo:       '基本信息',
  foodAllergy:     '食物过敏',
  drugAllergy:     '药物过敏',
  medicalHistory:  '既往病史',
  specialDiseases: '特殊疾病史',
  familyHistory:   '家族史',
  longTermMeds:    '长期用药',
  longTermSups:    '长期营养补剂',
  dietSummary:     '膳食调查概述',
  latestVitals:    '近期打卡数据',
  allergies:       '过敏史',
  medications:     '当前用药',
  surgeries:       '手术史',
  recentSymptoms:  '近期症状',
}

function AttachedHealthInfoView({ info }) {
  if (!info) return null
  const sections = Object.keys(info).filter(k => {
    const v = info[k]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  if (sections.length === 0) return null
  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0f6ff', borderRadius: 6, borderLeft: '3px solid #0077B6' }}>
      <div style={{ fontSize: 11, color: '#0077B6', fontWeight: 600, marginBottom: 6 }}>附带健康档案</div>
      {sections.map(k => {
        const v = info[k]
        const label = REFERRAL_HEALTH_LABELS[k] || k
        let display = ''
        if (Array.isArray(v)) {
          display = v.map(item => typeof item === 'object' ? Object.values(item).filter(Boolean).join(' · ') : item).join('；')
        } else if (typeof v === 'object') {
          display = Object.entries(v).map(([kk, vv]) => `${kk}：${vv}`).join('；')
        } else {
          display = String(v)
        }
        return (
          <div key={k} style={{ fontSize: 12, color: '#1A2B24', marginBottom: 3 }}>
            <span style={{ color: '#4A6558', marginRight: 4 }}>{label}：</span>{display}
          </div>
        )
      })}
    </div>
  )
}
